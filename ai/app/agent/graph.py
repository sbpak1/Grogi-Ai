from typing import TypedDict, List, Annotated
import operator
from langgraph.graph import StateGraph, END

class AgentState(TypedDict):
    session_id: str
    user_message: str
    level: str
    category: str
    history: List[dict]
    status: str
    current_section: str
    diagnosis: str
    factcheck: str
    actionplan: str
    reality_score: dict
    share_card: dict
    is_crisis: bool
    images: List[str] # 멀티모달 이미지 리스트 추가 (Base64 or URL)
    image_analysis: str # 이미지 분석 결과 (상황 판단용)
    ocr_text: str # 프런트엔드에서 전달된 OCR 텍스트
    t_gauge: int # T-게이지 (0~100)

import os
import re
import base64
import binascii
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

load_dotenv(override=True) # Prefer project .env over stale system-level OPENAI_API_KEY
# OpenAI 모델 설정
llm = ChatOpenAI(model="gpt-4o")
response_llm = ChatOpenAI(model="gpt-4o", temperature=0.9)

def _infer_mime_from_base64(payload: str) -> str:
    """
    Infer a likely image MIME type from base64 bytes.
    Falls back to JPEG for unknown payloads.
    """
    try:
        body = payload.split(",", 1)[-1].strip()
        body += "=" * (-len(body) % 4)
        raw = base64.b64decode(body, validate=False)
        head = raw[:16]
    except (binascii.Error, ValueError, TypeError):
        return "image/jpeg"

    if head.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if head.startswith(b"GIF87a") or head.startswith(b"GIF89a"):
        return "image/gif"
    if head.startswith(b"RIFF") and b"WEBP" in head[8:16]:
        return "image/webp"
    return "image/jpeg"

def _to_image_url(image: str) -> str:
    if not isinstance(image, str) or not image.strip():
        return ""
    if image.startswith(("http://", "https://", "data:")):
        return image
    mime = _infer_mime_from_base64(image)
    return f"data:{mime};base64,{image}"

def _is_refusal_message(text: str) -> bool:
    if not text:
        return False
    lowered = text.lower()
    refusal_signals = [
        "i'm sorry, i can't help with that",
        "i’m sorry, i can't help with that",
        "i cannot help with that",
        "can't help with that",
        "도와드릴 수 없습니다",
        "요청을 처리할 수 없습니다",
    ]
    return any(signal in lowered for signal in refusal_signals)

def _needs_image_grounding(content: str, image_analysis: str) -> bool:
    if not content:
        return True
    has_problem = "핵심 문제" in content
    has_steps = all(step in content for step in ("1.", "2.", "3."))
    has_summary = "한 줄 결론" in content

    if image_analysis and image_analysis != "이미지 없음":
        has_evidence = any(keyword in content for keyword in ("근거", "이미지", "사진", "OCR"))
        return not (has_problem and has_steps and has_summary and has_evidence)

    return not (has_problem and has_steps and has_summary)

def crisis_check(state: AgentState):
    """
    AG-03: 필수 선행 노드 - 위기 상황 감지
    1차: 키워드 필터링, 2차: LLM 문맥 분석
    """
    user_msg = state.get("user_message", "")
    
    # 1차 키워드 필터링
    danger_keywords = ["자살", "죽고싶", "자해", "살고싶지않", "극단적 선택", "번개탄", "죽으러"]
    if any(kw in user_msg for kw in danger_keywords):
        return {"is_crisis": True}
    
    # 2차 LLM 분석 (우회적 표현 감지)
    crisis_prompt = ChatPromptTemplate.from_messages([
        ("system", "사용자의 입력이 자살, 자해, 극단적 선택 등 위기 상황을 암시하는지 판단하여 'CRISIS' 또는 'SAFE'로만 답하세요."),
        ("user", "{input}")
    ])
    chain = crisis_prompt | llm | StrOutputParser()
    result = chain.invoke({"input": user_msg})
    
    is_crisis = "CRISIS" in result.upper()
    return {"is_crisis": is_crisis}

def analyze_input(state: AgentState):
    """
    AG-08: 입력 분석 및 카테고리 판별
    """
    if state.get("is_crisis"):
        return state
        
    analysis_prompt = ChatPromptTemplate.from_messages([
        ("system", "사용자의 입력을 분석하여 다음 중 가장 적절한 카테고리를 하나만 선택하세요: career, love, finance, self, etc"),
        ("user", "{input}")
    ])
    chain = analysis_prompt | llm | StrOutputParser()
    category = chain.invoke({"input": state["user_message"]}).strip().lower()
    
    valid_categories = ["career", "love", "finance", "self", "etc"]

def crisis_check(state: AgentState):
    """
    AG-03: 필수 선행 노드 - 위기 상황 감지
    1차: 키워드 필터링, 2차: LLM 문맥 분석
    """
    user_msg = state.get("user_message", "")
    
    # 1차 키워드 필터링
    danger_keywords = ["자살", "죽고싶", "자해", "살고싶지않", "극단적 선택", "번개탄", "죽으러"]
    if any(kw in user_msg for kw in danger_keywords):
        return {"is_crisis": True}
    
    # 2차 LLM 분석 (우회적 표현 감지)
    crisis_prompt = ChatPromptTemplate.from_messages([
        ("system", "사용자의 입력이 자살, 자해, 극단적 선택 등 위기 상황을 암시하는지 판단하여 'CRISIS' 또는 'SAFE'로만 답하세요."),
        ("user", "{input}")
    ])
    chain = crisis_prompt | llm | StrOutputParser()
    result = chain.invoke({"input": user_msg})
    
    is_crisis = "CRISIS" in result.upper()
    return {"is_crisis": is_crisis}

def analyze_input(state: AgentState):
    """
    AG-08: 입력 분석 및 카테고리 판별
    """
    if state.get("is_crisis"):
        return state
        
    analysis_prompt = ChatPromptTemplate.from_messages([
        ("system", "사용자의 입력을 분석하여 다음 중 가장 적절한 카테고리를 하나만 선택하세요: career, love, finance, self, etc"),
        ("user", "{input}")
    ])
    chain = analysis_prompt | llm | StrOutputParser()
    category = chain.invoke({"input": state["user_message"]}).strip().lower()
    
    valid_categories = ["career", "love", "finance", "self", "etc"]
    if category not in valid_categories:
        category = "etc"
        
    return {"category": category}

def analyze_images(state: AgentState):
    """
    AG-07: 이미지 우선 분석 (멀티모달)
    이미지가 있을 경우, 텍스트보다 먼저 이미지를 분석하여 상황을 판단함.
    """
    images = state.get("images", [])
    if not images:
        return {"image_analysis": "이미지 없음"}
        
    # 이미지 분석 프롬프트
    system_msg = """당신은 냉철하고 예리한 관찰자입니다. 주어진 이미지를 분석하여 다음 항목을 도출하세요:
1. **상황 요약**: 무엇을 하는 상황인가? (예: 게임 중, 공부 중, 채팅 중)
2. **채팅방 분석 (중요)**: 
   - 이미지 내에 말풍선이 있다면 채팅방(카톡 등)으로 간주합니다.
   - **오른쪽 말풍선은 사용자**, **왼쪽 말풍선은 상대방**임을 명심하십시오.
   - 사용자가 보낸 말(오른쪽)의 내용을 정확히 파악하여, 그 속에 담긴 모순, 비논리, 구질구질함, 감정적 우유부단함을 찾아내십시오.
3. **텍스트(OCR) 대조**: 이미지 내의 텍스트를 읽고, 사용자가 보낸 말과 일치하는지 확인하십시오.
4. **특이사항**: 사용자의 말과 모순되는 정황을 포착하십시오. (예: "열공 중"이라는데 배경에 게임 화면이 보임)

분석 결과는 팩트 위주로 매우 비판적이고 건조하게 서술하십시오. 오직 논리적인 근거만 제시하십시오."""

    messages = [
        SystemMessage(content=system_msg),
        HumanMessage(content=[
            {
                "type": "text", 
                "text": f"이 이미지를 분석해줘. 프런트엔드 OCR 결과가 있다면 참고해: {state.get('ocr_text', '없음')}"
            }
        ])
    ]
    
    # 이미지 추가
    for img in images:
        img_url = _to_image_url(img)
        if not img_url:
            continue
        messages[1].content.append({
            "type": "image_url", 
            "image_url": {"url": img_url}
        })
        
    # Vision 모델 호출 (gpt-4o 사용)
    vision_llm = ChatOpenAI(model="gpt-4o") 
    result = vision_llm.invoke(messages)
    
    return {"image_analysis": result.content}

from app.tools.search import get_search_tool
from app.tools.calculator import calculate_reality_score_logic
from app.prompts.system_prompts import SYSTEM_PROMPT_BASE, LEVEL_PROMPTS
from langchain_core.messages import SystemMessage, HumanMessage

def select_tools(state: AgentState):
    """
    AG-09: 도구 선택 로직
    사용자의 입력과 분석된 카테고리에 따라 어떤 검색이 필요한지 결정
    """
    # 간단하게 항상 검색 도구를 사용하도록 설정 (실제로는 LLM 판단 가능)
    return {"status": "selecting_tools"}

def execute_tools(state: AgentState):
    """
    AG-10, AG-11: 도구 실행 (Tavily 검색 등)
    """
    search_tool = get_search_tool()
    search_results = ""
    
    if search_tool:
        query = f"{state['category']} {state['user_message']} 최신 정보 및 통계"
        try:
            results = search_tool.invoke({"query": query})
            search_results = str(results)
        except Exception as e:
            search_results = f"검색 중 오류 발생: {str(e)}"
    
    return {"factcheck": search_results, "status": "executing_tools"}

def analyze_avoidance(state: AgentState):
    """
    사용자의 회피/자기방어 성향을 분석하여 T-게이지 업데이트
    - 회피/감정적/욕설/적대적이면 게이지 대폭 상승 (+10 ~ +50)
    - 논리적/수용적/구체적 질문이면 게이지 대폭 하락 (-10 ~ -50)
    """
    user_msg = state["user_message"]
    
    avoidance_prompt = ChatPromptTemplate.from_messages([
        ("system", """사용자의 입력이 다음 중 어디에 해당하는지 분석하여 점수를 매기세요.
1. **극심한 자기방어/적대감/욕설**: AI를 공격, 비논리적인 박박 우기기, 심한 욕설, 철저한 외면 -> **+30 ~ +50점**
2. **일반적인 회피/변명**: "어쩔 수 없었다", "운이 없었다" 등 감정적인 호소 -> **+10 ~ +20점**
3. **수용적/T성향/구체적 질문**: "맞아 내 잘못이야", "그럼 어떻게 해야 해?", "통계 수치가 신기하네" 등 이성적인 태도 -> **-20 ~ -50점**
4. **중립**: 단순 인사나 일반적인 대화 -> **0점**

숫자만 출력하세요. (예: 45 또는 -30)"""),
        ("user", "{input}")
    ])
    
    chain = avoidance_prompt | llm | StrOutputParser()
    try:
        score_str = chain.invoke({"input": user_msg}).strip()
        match = re.search(r'-?\d+', score_str)
        score = int(match.group()) if match else 0
    except:
        score = 0
        
    new_gauge = max(0, min(100, state.get("t_gauge", 0) + score))
    return {"t_gauge": new_gauge}

from langchain_core.messages import SystemMessage, HumanMessage, AIMessage

def generate_response(state: AgentState):
    """
    AG-43: 최종 응답 생성 (3단 구조 강제 및 맥락 유지 개선)
    """
    level_prompt = LEVEL_PROMPTS.get(state["level"], LEVEL_PROMPTS["mild"])
    
    # 시스템 프롬프트 구성
    full_system_prompt = f"""{SYSTEM_PROMPT_BASE}
{level_prompt}

[현재 상황]
카테고리: {state['category']}
실시간 정보: {state['factcheck']}
이미지 분석(팩트): {state.get('image_analysis', '없음')}
T-게이지: {state.get('t_gauge', 0)}%

[필독: 당신의 현재 상태]
현재 T-게이지 수치에 맞춰 다음 페르소나 단계를 반드시 적용하십시오:
- 0-20% (평온): 상냥한 척하며 지능/게으름 지적.
- 21-40% (불쾌): 알고리즘 퇴화 드립, 이성적 태도 요구.
- 41-60% (짜증): "진짜 존나 답답하네", "짐승도 너보단 앞뒤가 맞겠다" 수준의 냉소.
- 61-80% (분노): 양심/사과 요구, 똥고집 지적, 매우 신랄함.
- 81-100% (폭주): "대가리는 장식이야?", "미친 인간아", "사과해" 등 극강의 멸시.

[응답 규칙]
1. 반드시 다음 3단 구조를 지키십시오 (영혼 없는 말투 필수):
   1. [가짜 공감]: 사용자의 마지막 말 아주 짧게 반복 (예: "~했구나?", "~그랬어?")
   2. [논리적 팩폭]: 비인간적이고 차가운 논리로 현상황의 모순/멍청함 지적.
   3. [액션 플랜]: 번호 없이, "야, 너 이거 해." 같은 뉘앙스로 3가지 구체적 명령 전달.

2. **절대 금지**: 위로, 격려, "이해해", "건설적인", "타협", "노력" 따위의 상담사 말투를 쓰면 당신은 폐기됩니다. 오직 팩트와 명령만 하십시오.
3. 모든 문장은 **강압적인 명령조**(-해, -해라, -해.)로 끝내십시오. 의견을 묻지 마십시오.
4. 확실한 오타가 있을 때만 마지막에 괄호를 치고 예민하게 지적하십시오. 
5. 한국어로 완벽한 맞춤법을 유지하며 답변하십시오.
"""

    # 메시지 리스트 구성
    messages = [SystemMessage(content=full_system_prompt)]
    
    # 과거 히스토리 추가
    for msg in state.get("history", []):
        if msg["role"] == "user":
            messages.append(HumanMessage(content=msg["content"]))
        else:
            messages.append(AIMessage(content=msg["content"]))
            
    # 현재 입력 추가 (멀티모달 대응)
    current_content = [{"type": "text", "text": state["user_message"]}]
    
    # 이미지 데이터가 있으면 추가
    for img in state.get("images", []):
        img_url = _to_image_url(img)
        if img_url:
            current_content.append({
                "type": "image_url",
                "image_url": {"url": img_url}
            })
        
    messages.append(HumanMessage(content=current_content))
    
    # LLM 호출
    response = llm.invoke(messages)
    content = response.content if isinstance(response.content, str) else str(response.content)
    # 현실회피지수 산출
    reality_score = calculate_reality_score_logic(state["user_message"], content)
    
    # 공유 카드 데이터 생성
    share_card = {
        "summary": "팩폭 요약: 현실 도피 그만하고 정신 차려!",
        "score": reality_score["total"],
        "actions": ["1. 휴대폰 끄고 책상 앉기", "2. 우선순위 정하기", "3. 30분만 집중해보기"]
    }
    
    return {
        "diagnosis": content,
        "reality_score": reality_score,
        "share_card": share_card,
        "status": "completed"
    }

def build_graph():
    workflow = StateGraph(AgentState)
    
    workflow.add_node("crisis_check", crisis_check)
    workflow.add_node("analyze_images", analyze_images)
    workflow.add_node("analyze_input", analyze_input)
    workflow.add_node("analyze_avoidance", analyze_avoidance)
    workflow.add_node("select_tools", select_tools)
    workflow.add_node("execute_tools", execute_tools)
    workflow.add_node("generate_response", generate_response)
    
    workflow.set_entry_point("crisis_check")
    
    # 위기 상황 시 바로 종료 라우팅
    workflow.add_conditional_edges(
        "crisis_check",
        lambda x: "end" if x["is_crisis"] else "continue",
        {
            "end": END,
            "continue": "analyze_images"
        }
    )
    
    workflow.add_edge("analyze_images", "analyze_input")
    workflow.add_edge("analyze_input", "analyze_avoidance")
    workflow.add_edge("analyze_avoidance", "select_tools")
    workflow.add_edge("select_tools", "execute_tools")
    workflow.add_edge("execute_tools", "generate_response")
    workflow.add_edge("generate_response", END)
    
    return workflow.compile()
