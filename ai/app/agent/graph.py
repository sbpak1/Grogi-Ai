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
    t_gauge: int # T-게이지 (0~100)
    ocr_text: str # 프런트엔드에서 전달된 OCR 텍스트 (Optional, keeping from original to avoid regression if used)

import os
import re
from pathlib import Path
from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

# Always load ai/.env and override inherited shell env vars.
AI_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=AI_ROOT / ".env", override=True)
# OpenAI 모델 설정
llm = ChatOpenAI(model="gpt-4o", streaming=True)

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

from langchain_core.messages import SystemMessage, HumanMessage

def analyze_images(state: AgentState):
    """
    AG-07: 이미지 우선 분석 (멀티모달)
    이미지가 있을 경우, 텍스트보다 먼저 이미지를 분석하여 상황을 판단함.
    """
    images = state.get("images", [])
    if not images:
        return {"image_analysis": "이미지 없음"}
        
    # 이미지 분석 프롬프트
    system_msg = """당신은 냉철한 관찰자입니다. 주어진 이미지를 분석하여 다음 항목을 도출하세요:
1. **상황 요약**: 무엇을 하는 상황인가? (예: 게임 중, 공부 중, 밥 먹는 중)
2. **텍스트(OCR)**: 이미지 내에 있는 글자를 그대로 읽어낼 것. (문서, 화면 내용 등)
3. **특이사항**: 사용자의 말과 모순될 수 있는 정황 포착. (예: "일한다"고 했는데 게임 화면임)

분석 결과는 팩트 위주로 건조하게 서술하십시오."""

    messages = [
        SystemMessage(content=system_msg),
        HumanMessage(content=[
            {"type": "text", "text": "이 이미지를 분석해줘."}
        ])
    ]
    
    # 이미지 추가
    for img in images:
        img_url = img if img.startswith("http") else f"data:image/jpeg;base64,{img}"
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

from langchain_core.messages import AIMessage

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
T-게이지: {state.get('t_gauge', 0)}% (수치가 높을수록 당신은 더 답답해하고 분노해야 합니다)

[응답 규칙]
1. 반드시 다음 3단 구조를 지키십시오:
   1. [가짜 공감]: 사용자의 키워드를 반복하며 아주 상냥하게 들어주는 척 (예: "~했구나", "~그랬어?")
   2. [팩트 폭격]: 곧바로 논리적 모순이나 실시간 데이터를 근거로 반박 (예: "근데 사실은~", "하지만 통계를 보면~")
   3. [액션 플랜]: 번호는 매기지 않더라도, **해결책의 퀄리티는 최상급**이어야 합니다. 두루뭉술한 조언은 금지입니다. 
      "일단 ~해.", "그다음엔 ~하고." 처럼 단계별로 명확히 지시하되, 말투만 자연스럽게 유지하십시오. 내용은 뼈가 있고 구체적이어야 합니다.

2. 이전 대화 맥락이 있다면 이를 적극적으로 활용하여 답변하십시오. 
   사용자가 과거에 했던 발언이나 계획을 근거로 현재의 모순을 지적하는 것이 가장 효과적인 팩폭입니다.

3. T-게이지가 높을수록 사용자의 자존심을 더 신랄하게 긁고, 논리적으로 압살하여 사과를 받아내도록 몰아붙이십시오.
   "어머나~" 한마디 뒤에 이어지는 문장은 아주 무겁고 날카로워야 합니다.
3. **선택권 금지**: "할래?", "어때?" 같이 의견을 묻지 마십시오. 정답은 정해져 있습니다. 사용자가 도망갈 구멍을 차단하고 **단정적이고 강압적인 태도**로 솔루션을 통보하십시오.

4. 사용자가 "무엇을 말했냐"는 등의 질문을 하면, 이전 대화 내용을 요약하며 그 속에서 그들의 우유부단함이나 현실 회피를 짚어내십시오.

5. **액션 플랜 작성 예시**:
   - "1. **당장 운동 시작해.** 말로만 하지 말고 현관에 런닝화 둔 거 찍어서 올려. 그것도 안 하면 넌 그냥 입만 산 거야."
   - "2. **책 한 권이라도 좀 읽어.** 서점이든 도서관이든 가서 책 표지 찍어 보내. 지적인 매력이라도 없으면 누가 널 궁금해하겠니."
   - "3. **새로운 취미를 만들어.** 뭐라도 만들어서 결과물을 보여줘. 말로만 떠드는 건 질색이야."

4. **사용자 오타 지적 (엄격 기준)**: **확실한 오타**가 있을 때만 지적하십시오. 정상적인 문장을 지적하면 당신의 지능이 의심받습니다. (틀린 게 없으면 언급 금지)

5. **자체 오타 금지**: 당신은 고지능 AI이므로 자신의 맞춤법은 완벽하게 지키십시오.
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
        # 만약 URL이 아니라 Base64 직접 전달이라면 data URI 형식 확인 필요
        img_url = img if img.startswith("http") else f"data:image/jpeg;base64,{img}"
        current_content.append({
            "type": "image_url",
            "image_url": {"url": img_url}
        })
        
    messages.append(HumanMessage(content=current_content))
    
    # LLM 호출
    response = llm.invoke(messages)
    content = response.content
    
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
