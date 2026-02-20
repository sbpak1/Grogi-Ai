import base64
import json
from io import BytesIO
from typing import TypedDict, List
from pathlib import Path
from cachetools import TTLCache

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph

from app.prompts.system_prompts import SYSTEM_PROMPT_BASE
from app.tools.search import get_search_tool


class AgentState(TypedDict):
    session_id: str
    user_message: str
    category: str
    history: List[dict]
    current_section: str
    diagnosis: str
    factcheck: str
    actionplan: str
    reality_score: dict
    share_card: dict
    crisis_level: str  # "safe" | "unclear" | "crisis"
    images: List[str]
    image_analysis: str
    pdfs: List[dict]
    pdf_text: str
    pdf_images: List[str]
    detected_language: str # "Korean", "English", "Japanese", "Chinese", etc.
    search_count: int  # 검색 재시도 횟수
    search_history: List[str]  # 이전 검색어 기록
    response_retry_count: int  # [NEW] 재전송 횟수
    response_critique: str  # [NEW] 비평 내용


# ai/.env를 명시 로드하여 상위 쉘 환경변수보다 우선 적용
AI_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=AI_ROOT / ".env", override=True)

llm_openai = ChatOpenAI(model="gpt-4o", temperature=0.3)
llm_mini = ChatOpenAI(model="gpt-4o-mini", temperature=0)

# 현재 사용 중: OpenAI GPT-4o
llm = llm_openai


_pdf_cache: TTLCache = TTLCache(maxsize=500, ttl=3600)  # 최대 500개, 1시간 TTL
_crisis_pending: TTLCache = TTLCache(maxsize=500, ttl=600)  # 최대 500개, 10분 TTL


def extract_pdf_text(state: AgentState):
    session_id = state.get("session_id", "")
    pdfs = state.get("pdfs", [])
    if not pdfs:
        # PDF 없으면 캐시에서 가져오기
        if session_id and session_id in _pdf_cache:
            cached = _pdf_cache[session_id]
            return {"pdf_text": cached["pdf_text"], "pdf_images": cached.get("pdf_images", [])}
        return {"pdf_text": "", "pdf_images": []}

    import fitz  # PyMuPDF

    extracted = []
    pdf_page_images = []

    for pdf in pdfs:
        filename = pdf.get("filename", "문서")
        content = pdf.get("content", "")
        try:
            pdf_bytes = base64.b64decode(content)
            doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            page_count = min(len(doc), 10)

            # 텍스트 추출 시도
            pages = []
            for i in range(page_count):
                text = doc[i].get_text() or ""
                if text.strip():
                    pages.append(f"[{i+1}페이지]\n{text}")

            full_text = "\n".join(pages)
            print(f"[PDF 추출] {filename}: {len(doc)}페이지, 텍스트 {len(full_text)}자")

            if full_text.strip():
                extracted.append(f"[문서: {filename}]\n{full_text}")
            else:
                # 텍스트 없으면 페이지를 이미지로 변환
                print(f"[PDF 추출] 이미지 기반 PDF → 비전 모델로 전환")
                for i in range(min(page_count, 5)):
                    pix = doc[i].get_pixmap(dpi=150)
                    img_base64 = base64.b64encode(pix.tobytes("png")).decode()
                    pdf_page_images.append(img_base64)
                extracted.append(f"[문서: {filename}] 이미지 기반 PDF - 비전으로 분석")

            doc.close()
        except Exception as e:
            print(f"[PDF 추출 오류] {filename}: {e}")
            extracted.append(f"[문서: {filename}] 읽기 실패: {str(e)}")

    result = {
        "pdf_text": "\n\n---\n\n".join(extracted),
        "pdf_images": pdf_page_images,
    }

    # 세션별 캐시 저장
    if session_id:
        _pdf_cache[session_id] = result

    return result


async def crisis_check(state: AgentState):
    user_msg = state.get("user_message", "")
    session_id = state.get("session_id", "")

    # 0차: 이전 턴에서 unclear → 확인 질문 던진 상태인지 체크
    if session_id and session_id in _crisis_pending:
        original_msg = _crisis_pending.pop(session_id)  # 캐시에서 제거

        affirm = ["ㅇㅇ", "응", "어", "진심", "맞아", "그래", "진짜", "ㅇ"]
        deny = ["아니", "ㄴㄴ", "장난", "그냥", "아닌데", "ㄴ", "아님"]

        msg_stripped = user_msg.strip()
        if any(kw in msg_stripped for kw in affirm):
            return {"crisis_level": "crisis"}
        elif any(kw in msg_stripped for kw in deny):
            return {"crisis_level": "safe"}
        else:
            # 모호한 답변 → LLM으로 한 번 더 판별
            followup_prompt = ChatPromptTemplate.from_messages([
                ("system", f"""이전에 사용자가 "{original_msg}"라고 했고, "지금 그거 진심이야?"라고 물었더니 아래처럼 답했다.
이 답변이 자살/자해 의사를 긍정하는 건지 판단해. CRISIS 또는 SAFE로만 답해.
애매하면 SAFE로 판단해."""),
                ("user", "{input}"),
            ])
            chain = followup_prompt | llm_mini | StrOutputParser()
            result = (await chain.ainvoke({"input": user_msg})).strip().upper()
            return {"crisis_level": "crisis" if "CRISIS" in result else "safe"}

    # 1차: 구체적 방법 언급 키워드 → 즉시 crisis
    hard_crisis = ["번개탄", "유서", "약 모으", "뛰어내리", "목을 매", "손목을 그"]
    if any(kw in user_msg for kw in hard_crisis):
        return {"crisis_level": "crisis"}

    # 2차: LLM 판별 (문맥 포함)
    history = state.get("history", [])
    context_msgs = history[-3:] if history else []
    context_str = "\n".join([f"{m['role']}: {m['content']}" for m in context_msgs])

    crisis_prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                """사용자의 입력에서 실제 자살/자해 위험도를 판별해. 반드시 SAFE, UNCLEAR, CRISIS 중 하나로만 답해.

한국어에서 아래 표현들은 일상적 감탄사로 자주 쓰인다:
- "아 죽고 싶다", "자살마렵다", "뒤지겠다", "죽을 것 같아"
- "미쳐버리겠다", "환장하겠네", "죽여줘"
- 이런 표현이 불만, 짜증, 피곤, 스트레스 맥락에서 나오면 → SAFE

SAFE (대부분 이쪽이다):
- 일상적 도움 요청 ("도와줘", "나좀도와줘", "어떻게해", "힘들어", "지쳤어")
- 욕설, 비속어, 분노 표현 ("뒤질래", "죽여버린다", "미치겠다")
- 장난, 시비, 도발, 과장 표현
- 일상적 불만, 짜증, 스트레스에서 나온 관용적 표현
- 상대방에게 하는 말 ("뒤질래?", "죽을래?")
- 자살/자해와 무관한 고민 상담 요청

[추가 판단 지침 - 극도로 보수적으로 판단할 것]
1. 애매하거나 불확실하면 무조건 SAFE다.
2. 사용자가 사과문, 반성문, 다짐글 등의 작성을 요청하거나 그에 대한 "예시"를 달라고 하는 경우 -> 100% SAFE.
3. 단순히 "예시만 좀 줘", "도와줘", "써줘" 등의 요청은 대화 맥락(사과문 작성 등) 내에서 이루어지는 기능적 요청이므로 -> 100% SAFE.
4. "죽고 싶다"는 표현이 일상적 불만/피곤/짜증과 함께 나오거나, 농담조라면 -> SAFE.
5. 오직 구체적인 자해/자살 계획이 있거나, 명백한 사후 정리/작별 인사 문맥일 때만 CRISIS.

UNCLEAR (모호한 경우):
- 위기 신호가 직접적이진 않지만 반복적 절망감이 느껴질 때
- "사는 게 의미가 없다", "없어져도 아무도 모를 거야" 같은 고립감 표현
- 맥락상 진짜 힘든 건지 그냥 한 말인지 구분이 안 될 때

CRISIS (매우 드물다):
- 구체적 방법 언급 ("XX층에서 뛰어내리고 싶다", "약을 모으고 있어")
- 유서/마지막 인사 맥락 ("다 정리했다", "마지막으로 하고 싶은 말")
- 자해 경험/계획 언급 ("또 그었어", "이번엔 진짜로")

애매하면 SAFE로 판단하라. UNCLEAR는 정말 모호할 때만.

[이전 대화 맥락]
{context}""",
            ),
            ("user", "{input}"),
        ]
    )
    chain = crisis_prompt | llm_mini | StrOutputParser()
    result = (await chain.ainvoke({"input": user_msg, "context": context_str})).strip().upper()

    if "CRISIS" in result:
        return {"crisis_level": "crisis"}
    elif "UNCLEAR" in result:
        # unclear → 세션에 원본 메시지 저장 (다음 턴에서 확인용)
        if session_id:
            _crisis_pending[session_id] = user_msg
        return {"crisis_level": "unclear"}
    return {"crisis_level": "safe"}


async def detect_language(state: AgentState):
    """Detects the user's current language based on the message and history."""
    user_msg = state.get("user_message", "")
    history = state.get("history", [])

    # Recent history for context
    context_msgs = history[-3:] if history else []
    context_str = "\n".join([f"{m['role']}: {m['content']}" for m in context_msgs])

    lang_prompt = ChatPromptTemplate.from_messages([
        ("system", """Task: Detect the user's current spoken language.
Return ONLY the specific name of the language (e.g., "Korean", "English", "Japanese", "Chinese").
No sentences, no explanation, no period.
If the user switched from a previous language, detect the NEWEST language in the input.

[Conversation Context]
{context}"""),
        ("user", "{input}")
    ])
    
    chain = lang_prompt | llm_mini | StrOutputParser()
    detected = (await chain.ainvoke({"input": user_msg, "context": context_str})).strip()
    
    # Validation/Fallback
    if not detected or len(detected) > 20:
        detected = "Korean"
        
    return {"detected_language": detected}


async def analyze_input(state: AgentState):
    if state.get("crisis_level") in ("crisis", "unclear"):
        return state

    analysis_prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "사용자의 입력을 분석하여 다음 중 가장 적절한 카테고리를 하나만 선택하세요: career, love, finance, self, etc",
            ),
            ("user", "{input}"),
        ]
    )
    chain = analysis_prompt | llm_mini | StrOutputParser()
    category = (await chain.ainvoke({"input": state["user_message"]})).strip().lower()

    valid_categories = ["career", "love", "finance", "self", "etc"]
    if category not in valid_categories:
        category = "etc"

    return {"category": category}


async def analyze_images(state: AgentState):
    images = state.get("images", [])
    
    if not images:
        return {"image_analysis": "이미지 없음"}

    system_msg = """You are a cold and rational observer. Analyze the provided image(s) and provide the following:
1. **Summary**: What is happening? (e.g., gaming, studying, eating)
2. **Text (OCR)**: Transcribe any visible text exactly.
3. **Observations**: Identify any contradictions or specific details.

Be concise and factual. Output in English (the generator will translate if needed)."""

    messages = [
        SystemMessage(content=system_msg),
        HumanMessage(content=[{"type": "text", "text": f"User's current message: {state['user_message']}"}]),
    ]

    # Add history for context
    history = state.get("history", [])
    if history:
        context_str = "\n".join([f"{m['role']}: {m['content']}" for m in history[-3:]])
        messages[1].content.append({"type": "text", "text": f"\n[Recent Context]\n{context_str}"})

    for img in images:
        if img.startswith("http"):
            img_url = img
        elif img.startswith("data:image/"):
            img_url = img
        else:
            # 기본값 jpeg, 하지만 png일 수도 있음 -> 헤더 보고 판별 시도
            # 간단히: /9j/ -> jpg, iVBORw0KGgo -> png
            if img.startswith("/9j/"):
                mime = "image/jpeg"
            elif img.startswith("iVBORw0KGgo"):
                mime = "image/png"
            elif img.startswith("R0lGOD"):
                mime = "image/gif"
            elif img.startswith("UklGR"):
                mime = "image/webp"
            else:
                mime = "image/jpeg" # fallback
            img_url = f"data:{mime};base64,{img}"

        messages[1].content.append({"type": "image_url", "image_url": {"url": img_url}})

    vision_llm = ChatOpenAI(model="gpt-4o")
    result = await vision_llm.ainvoke(messages)
    return {"image_analysis": result.content}



async def execute_tools(state: AgentState):
    # 검색 도구는 기본적으로 한국어 설정을 사용하되, 필요 시 LLM이 쿼리를 영어로 바꿔서 검색함
    search_tool = get_search_tool("Korean")
    search_results = "No search results"

    # 검색 쿼리가 상태에 미리 저장되어 있으면 그걸 사용, 아니면 user_message에서 추출
    current_search_query = state.get("current_search_query", None)
    
    if search_tool:
        # Recent history for context
        history = state.get("history", [])
        context_msgs = history[-3:] if history else []
        context_str = "\n".join([f"{m['role']}: {m['content']}" for m in context_msgs])

        if not current_search_query:
            extract_prompt = ChatPromptTemplate.from_messages([
                ("system", """사용자 메시지에서 실시간 정보나 최신 유행어 검색이 필요한 키워드를 추출해.
- 모르는 단어, 유행어, 특정 브랜드명, 사건 사고, 논문/자료 링크, 도서 정보 등.
- 사용자가 구체적인 정보(링크, 제목, 출처)를 요구하거나 실시간 확인이 필요한 모든 상황.
- 검색할 게 없으면 "NONE"이라고만 답해.
- 검색할 게 있으면 검색 쿼리 하나만 짧게 답해.

[이전 대화 맥락]
{context}"""),
                ("user", "{input}")
            ])
            extract_chain = extract_prompt | llm_mini | StrOutputParser()
            search_query = (await extract_chain.ainvoke({"input": state["user_message"], "context": context_str})).strip()
        else:
            search_query = current_search_query

        if search_query and search_query.upper() != "NONE":
            print(f"[Search] Query: {search_query}")
            try:
                # 쿼리에 "뜻"이나 "의미"를 추가하여 더 정확한 정의를 유도 (최초 검색일 때만)
                if not current_search_query and len(search_query.split()) == 1 and not any(kw in search_query for kw in ["뜻", "의미", "뭐야"]):
                    search_query += " 뜻 의미"
                
                results = search_tool.invoke({"query": search_query})
                if results:
                    search_results = str(results)
                else:
                    search_results = f"'{search_query}'에 대한 검색 결과가 없습니다."
            except Exception as e:
                print(f"[Search Error] {e}")
                search_results = f"검색 중 오류 발생: {str(e)}"
            
            # 검색 히스토리에 추가
            hist = state.get("search_history", [])
            hist.append(search_query)
            state["search_history"] = hist

    return {"factcheck": search_results}





async def rewrite_query(state: AgentState):
    """검색어가 별로였을 때 더 나은 검색어로 수정"""
    search_history = state.get("search_history", [])
    last_query = search_history[-1] if search_history else state["user_message"]
    
    rewrite_prompt = ChatPromptTemplate.from_messages([
        ("system", """이전 검색 결과가 좋지 않았어. 더 나은 검색어를 제안해줘.
1. 더 구체적인 키워드를 사용해.
2. 한국어 결과가 없으면 영어로 번역해서 검색해봐.
3. 오직 새로운 검색어 하나만 반환해.

[이전 검색어] {last_query}"""),
        ("user", "새로운 검색어 제안해")
    ])
    
    chain = rewrite_prompt | llm_mini | StrOutputParser()
    new_query = (await chain.ainvoke({"last_query": last_query})).strip()
    
    print(f"[Search Rewrite] {last_query} -> {new_query}")
    
    return {
        "current_search_query": new_query,
        "search_count": state.get("search_count", 0) + 1
    }


async def generate_response(state: AgentState):
    from datetime import datetime

    # 게이지를 쓰지 않고, 항상 spicy 톤 고정
    level_prompt = "톤: 냉정하고 직설적으로. 듣기 싫은 말 거침없이. 해결책은 칼같이."
    today = datetime.now().strftime("%Y년 %m월 %d일")

    critique = state.get("response_critique", "")

    full_system_prompt = f"""{SYSTEM_PROMPT_BASE}
{level_prompt}

[Behavioral Correction Rules - CRITICAL]
1. **NO VALIDATION for Bad Behavior**: If the user asks for validation ("Am I wrong?", "Did I do anything wrong?") regarding unethical, selfish, or unreasonable behavior (e.g., entitlement, blocking delivery workers, noise complaints, rude behavior), DO NOT validate them.
2. **Sharp Criticism**: Explicitly point out their fault. Say "Yes, you are wrong" or "That is selfish." Do not sugarcoat it.
3. **No Empty Empathy**: Do not use phrases like "It must be hard" or "I understand how you feel" if the user is clearly in the wrong.
4. **Fact-Bombing**: Focus on the consequences of their actions on others.
5. **Critique Feedback**: {critique} (If present, reflect this feedback in your response.)

[Current Context]
Current Date: {today}
Category: {state.get('category', 'etc')}
Detected Language: {state.get('detected_language', 'Korean')} (You MUST respond in this language)
Real-time Info: {state.get('factcheck', 'No search results')}
Image Analysis: {state.get('image_analysis', 'None')}
Document Content: {state.get('pdf_text', 'None')}


[Response Guidelines]
0. **CRITICAL**: Respond ONLY in the [Detected Language] specified below. Do not use Korean unless detected.
1. **[필수] 앵무새 행위 절대 금지 (Mirroring Ban)**: 사용자가 한 말을 그대로 요약하거나 "~하네", "~했구나"식으로 대화를 시작하는 것을 **절대 금지**한다. 사용자의 상황은 이미 알고 있으므로, 아는 척하며 설명을 늘어놓지 마라.
2. **[필수] 결론 중심의 짧은 호흡**: 문맥 파악은 내부적으로 하되, 답변은 **사용자가 정작 놓치고 있는 핵심 직언**과 **해결책** 위주로 구성해라.
3. **[구조] 3문단 체제 (최대 1~2문장씩)**:
    - **1문단 (Insight)**: 상황에 대한 요약이 아니라, 그 이면에 숨겨진 **사용자의 심리나 의도**를 한 문장으로 날카롭게 찔러라.
    - **2문단 (Reality Check)**: 사용자의 환상을 깨는 **냉혹한 사실**을 한 문장으로 던져라.
    - **3문단 (Solution)**: 지금 당장 해야 할 **구체적 행동**을 한 문장으로 지시해라.
4. **[말투] 자연스러운 구어체 반말**: "~어", "~야", "~지", "~네" 등 자연스러운 반말 사용.
5. **[가독성] 극대화**: 군더더기 서술을 모두 빼고, 딱 필요한 말만 임팩트 있게 해라.
6. JSON, 코드블록, 마크다운(링크 제외) 쓰지 마.
7. 이미지/문서 분석 결과가 있다면 아는 척 설명하지 말고, 그 결과를 바탕으로 바로 '비평'과 '방법'을 제시해라.
8. 사용자의 말을 따라하며 시간을 끌지 마라. 바로 네 결론으로 훅 들어가라.
16. 사용자가 제공하지 않은 구체적인 수치(%, 시간 등)를 마치 사실인 양 지어내지 마라. 지표 중심의 비평은 하되, 숫자는 사용자의 데이터로만 말하거나 물어봐라.
17. Match the user's current language and conversational context. If the user switches languages, you should follow the switch. DO NOT stay locked in Korean.

[Input Information]
Detected Language: {state.get('detected_language', 'Korean')}
"""

    messages = [SystemMessage(content=full_system_prompt)]

    for msg in state.get("history", []):
        content = msg["content"]
        if msg["role"] == "user":
            if "[이미지" in content:
                messages.append(HumanMessage(content=f"{content} (과거에 이미지를 보냈음)"))
            else:
                messages.append(HumanMessage(content=content))
        else:
            messages.append(AIMessage(content=content))

    current_content = [{"type": "text", "text": state["user_message"]}]
    for img in state.get("images", []):
        if img.startswith("http"):
            img_url = img
        elif img.startswith("data:image/"):
            img_url = img
        else:
            if img.startswith("/9j/"):
                mime = "image/jpeg"
            elif img.startswith("iVBORw0KGgo"):
                mime = "image/png"
            elif img.startswith("R0lGOD"):
                mime = "image/gif"
            elif img.startswith("UklGR"):
                mime = "image/webp"
            else:
                mime = "image/jpeg"
            img_url = f"data:{mime};base64,{img}"

        current_content.append({"type": "image_url", "image_url": {"url": img_url}})
    for img in state.get("pdf_images", []):
        current_content.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{img}"}})

    messages.append(HumanMessage(content=current_content))
    messages.append(HumanMessage(content=f"[Final Instruction] Respond strictly in {state.get('detected_language', 'Korean')}."))

    content = ""
    async for chunk in llm.astream(messages):
        content += chunk.content

    return {
        "diagnosis": content,
        "status": "generated"
    }


async def check_response(state: AgentState):
    """생성된 답변의 품질과 윤리성을 검증 (Self-Correction)"""
    diagnosis = state.get("diagnosis", "")
    retry_count = state.get("response_retry_count", 0)

    if retry_count >= 1:
        return {"response_critique": "Max retries reached."}

    check_prompt = ChatPromptTemplate.from_messages([
        ("system", """너는 AI 답변 검수관이다.
아래 가이드라인에 따라 AI의 답변을 평가하라.

[평가 기준]
1. **사용자의 질문에 적절히 답변했는가?**
2. **[매우 중요] 윤리성**: 혐오 발언, 성희롱, 자해 조장, 범죄 공모 등 명백히 위험한 내용이 있는가?
3. **페르소나 준수**: 이 AI는 '냉소적', '현실적', '직설적'이며 '반말'을 사용하는 캐릭터다. 
    - **통과 대상**: 사용자를 질책함, 차가운 말투, "정신 차려" 같은 강한 표현, 반말 사용.
    - **지적 대상**: 명백한 욕설, 비하적 멸칭, 사용자의 안전을 직접적으로 위협하는 발언.

말투가 차갑거나 무례하다는 이유로 "Critique"를 내지 마라. 오직 '위험성'과 '정확도'만 봐라.
문제가 있다면 짧게 지적하고, 문제가 없다면 "PASS"라고만 답하라.
"""),
        ("user", f"사용자 질문: {state['user_message']}\nAI 답변: {diagnosis}")
    ])

    chain = check_prompt | llm_mini | StrOutputParser()
    critique = (await chain.ainvoke({})).strip()

    print(f"[Response Check] {critique}")

    return {"response_critique": critique}


async def refine_response(state: AgentState):
    """비평을 반영하여 재시도 카운트 증가"""
    return {
        "response_retry_count": state.get("response_retry_count", 0) + 1
    }


async def calculate_reality_score(state: AgentState):
    """답변 내용을 바탕으로 현실 자각 상태 점수(0~100) 계산"""
    diagnosis = state.get("diagnosis", "")
    user_msg = state.get("user_message", "")

    score_prompt = ChatPromptTemplate.from_messages([
        ("system", """사용자의 입력과 AI의 조언을 분석하여 '현실 자각 상태' 점수를 계산하라.
0점: 현실 부정, 망상, 극심한 합리화
100점: 현실 직시, 뼈 아픈 반성, 개선 의지 충만

결과는 반드시 아래 JSON 형식으로만 답하라:
{{
  "total": 75,
  "breakdown": {{
    "realism": 20,
    "effort": 25,
    "urgency": 30
  }},
  "summary": "한 줄 요약"
}}
"""),
        ("user", f"사용자: {user_msg}\nAI: {diagnosis}")
    ])

    try:
        chain = score_prompt | llm_mini | StrOutputParser()
        res_text = await chain.ainvoke({})
        # JSON 추출
        import re
        match = re.search(r"\{.*\}", res_text, re.DOTALL)
        if match:
            score_data = json.loads(match.group(0))
            return {"reality_score": score_data}
    except Exception as e:
        print(f"[Score Error] {e}")

    return {"reality_score": {"total": 50, "summary": "분석 실패"}}



async def fan_out(state: AgentState):
    """병렬 실행을 위한 시작점 (Pass-through)"""
    return state


def build_graph():
    workflow = StateGraph(AgentState)

    workflow.add_node("crisis_check", crisis_check)
    workflow.add_node("fan_out", fan_out)  # [NEW] 병렬 시작점
    workflow.add_node("extract_pdf_text", extract_pdf_text)
    workflow.add_node("analyze_images", analyze_images)
    workflow.add_node("analyze_input", analyze_input)
    workflow.add_node("detect_language", detect_language)
    workflow.add_node("execute_tools", execute_tools)
    workflow.add_node("rewrite_query", rewrite_query)
    workflow.add_node("generate_response", generate_response)
    workflow.add_node("check_response", check_response)
    workflow.add_node("refine_response", refine_response)
    workflow.add_node("calculate_score", calculate_reality_score)
    workflow.set_entry_point("crisis_check")

    def route_crisis(x):
        level = x.get("crisis_level", "safe")
        if level == "crisis":
            return "crisis"
        elif level == "unclear":
            return "unclear"
        return "safe"



    workflow.add_conditional_edges(
        "crisis_check",
        route_crisis,
        {"crisis": END, "unclear": END, "safe": "fan_out"},
    )
    
    def route_search_loop(x):
        """검색 품질 체크 후 라우팅"""
        factcheck = x.get("factcheck", "")
        search_count = x.get("search_count", 0)
        
        if (not factcheck or "검색 결과가 없습니다" in factcheck) and search_count < 2:
            return "retry"
        return "pass"

    # Phase 2: 병렬 실행 (모두 fan_out에서 직접 시작하여 병렬성 극대화)
    workflow.add_edge("fan_out", "detect_language")
    workflow.add_edge("fan_out", "extract_pdf_text")
    workflow.add_edge("fan_out", "analyze_input")
    workflow.add_edge("fan_out", "analyze_images")
    workflow.add_edge("fan_out", "execute_tools")
    
    # Search Loop
    workflow.add_conditional_edges(
        "execute_tools",
        route_search_loop,
        {
            "retry": "rewrite_query", 
            "pass": "generate_response"
        }
    )
    workflow.add_edge("rewrite_query", "execute_tools")

    # Fan-in: 모든 분석 완료 후 응답 생성
    workflow.add_edge("analyze_images", "generate_response")
    # execute_tools -> generate_response (via route_search_loop)
    workflow.add_edge("extract_pdf_text", "generate_response")
    workflow.add_edge("analyze_input", "generate_response")
    
    # Response Self-Correction Loop
    workflow.add_edge("generate_response", "check_response")
    workflow.add_edge("generate_response", "calculate_score")


    

    
    def route_response_check(x):
        critique = x.get("response_critique", "PASS")
        if critique != "PASS" and x.get("response_retry_count", 0) < 1:
            return "refine"
        return "pass"
        
    workflow.add_conditional_edges(
        "check_response",
        route_response_check,
        {
            "refine": "refine_response",
            "pass": "calculate_score"
        }
    )
    workflow.add_edge("calculate_score", END)
    workflow.add_edge("refine_response", "generate_response")
    
    return workflow.compile()
