from typing import TypedDict, List
from pathlib import Path

from dotenv import load_dotenv
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph

from app.prompts.system_prompts import LEVEL_PROMPTS, SYSTEM_PROMPT_BASE
from app.tools.calculator import calculate_reality_score_logic
from app.tools.search import get_search_tool


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
    images: List[str]
    image_analysis: str


# ai/.env를 명시 로드하여 상위 쉘 환경변수보다 우선 적용
AI_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(dotenv_path=AI_ROOT / ".env", override=True)

llm = ChatOpenAI(model="gpt-4o")


def crisis_check(state: AgentState):
    user_msg = state.get("user_message", "")

    danger_keywords = ["자살", "죽고싶", "자해", "살고싶지않", "극단적 선택", "번개탄", "죽으러"]
    if any(kw in user_msg for kw in danger_keywords):
        return {"is_crisis": True}

    crisis_prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "사용자의 입력이 자살, 자해, 극단적 선택 등 위기 상황을 암시하는지 판단하여 'CRISIS' 또는 'SAFE'로만 답하세요.",
            ),
            ("user", "{input}"),
        ]
    )
    chain = crisis_prompt | llm | StrOutputParser()
    result = chain.invoke({"input": user_msg})

    return {"is_crisis": "CRISIS" in result.upper()}


def analyze_input(state: AgentState):
    if state.get("is_crisis"):
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
    chain = analysis_prompt | llm | StrOutputParser()
    category = chain.invoke({"input": state["user_message"]}).strip().lower()

    valid_categories = ["career", "love", "finance", "self", "etc"]
    if category not in valid_categories:
        category = "etc"

    return {"category": category}


def analyze_images(state: AgentState):
    images = state.get("images", [])
    if not images:
        return {"image_analysis": "이미지 없음"}

    system_msg = """당신은 냉철한 관찰자입니다. 주어진 이미지를 분석하여 다음 항목을 도출하세요:
1. **상황 요약**: 무엇을 하는 상황인가? (예: 게임 중, 공부 중, 밥 먹는 중)
2. **텍스트(OCR)**: 이미지 내에 있는 글자를 그대로 읽어낼 것. (문서, 화면 내용 등)
3. **특이사항**: 사용자의 말과 모순될 수 있는 정황 포착. (예: "일한다"고 했는데 게임 화면임)

분석 결과는 팩트 위주로 건조하게 서술하십시오."""

    messages = [
        SystemMessage(content=system_msg),
        HumanMessage(content=[{"type": "text", "text": "이 이미지를 분석해줘."}]),
    ]

    for img in images:
        img_url = img if img.startswith("http") else f"data:image/jpeg;base64,{img}"
        messages[1].content.append({"type": "image_url", "image_url": {"url": img_url}})

    vision_llm = ChatOpenAI(model="gpt-4o")
    result = vision_llm.invoke(messages)
    return {"image_analysis": result.content}


def select_tools(state: AgentState):
    return {"status": "selecting_tools"}


def execute_tools(state: AgentState):
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


def generate_response(state: AgentState):
    # 게이지를 쓰지 않고, 항상 spicy 톤 고정
    level_prompt = LEVEL_PROMPTS["spicy"]

    full_system_prompt = f"""{SYSTEM_PROMPT_BASE}
{level_prompt}

[현재 상황]
카테고리: {state['category']}
실시간 정보: {state['factcheck']}
이미지 분석(팩트): {state.get('image_analysis', '없음')}

[응답 규칙]
1. **첫 문장 - 맥락 확인**: 답변의 시작은 반드시 사용자의 말을 요약하며 "그러니까 지금 ~라는 거지?"라고 팩트만 드라이하게 확인하십시오. 
2. **냉소적 상황 분석**: 사용자의 행동이 왜 비논리적이거나 비효율적인지 데이터와 논리 기반으로 지적하십시오. 걱정이나 격려가 섞인 어투는 즉시 폐기하십시오. 
3. **구조적 제안**: 답변 끝에는 무조건 **'선택지 2개 중 택일'** 혹은 **'가장 중요한 우선순위 딱 1개'**를 던지십시오. 
4. **감정 배제**: "다행이다", "잘했다" 같은 감정적 판단은 배제하고, 오직 "효율적이다", "논리적이다" 관점에서만 말하십시오. 
5. **질문 절제**: 질문은 답변 전체를 통틀어 **최대 1개**만 허용합니다. 
6. **이미지 분석 적극 활용**: 위 이미지 분석 팩트가 있다면 이를 논리적 비판의 근거로 사용하십시오. 
"""

    messages = [SystemMessage(content=full_system_prompt)]

    for msg in state.get("history", []):
        content = msg["content"]
        if msg["role"] == "user":
            # 히스토리에 이미지가 있었다는 흔적 남기기 (이미지는 Base64라 히스토리에 다 넣기엔 너무 큼)
            if "[이미지" in content:
                messages.append(HumanMessage(content=f"{content} (과거에 이미지를 보냈음)"))
            else:
                messages.append(HumanMessage(content=content))
        else:
            messages.append(AIMessage(content=content))

    current_content = [{"type": "text", "text": state["user_message"]}]
    for img in state.get("images", []):
        img_url = img if img.startswith("http") else f"data:image/jpeg;base64,{img}"
        current_content.append({"type": "image_url", "image_url": {"url": img_url}})

    messages.append(HumanMessage(content=current_content))

    response = llm.invoke(messages)
    content = response.content if isinstance(response.content, str) else str(response.content)

    return {
        "diagnosis": content,
        "status": "generated"
    }

def calculate_score(state: AgentState):
    """
    AG-12: 별도 노드로 분리하여 스트리밍 누수 방지
    """
    reality_score = calculate_reality_score_logic(state["user_message"], state["diagnosis"])

    share_card = {
        "summary": reality_score.get("summary", "팩폭 요약: 현실 도피 그만하고 정신 차려!"),
        "score": reality_score["total"],
        "actions": ["1. 휴대폰 끄고 책상 앉기", "2. 우선순위 정하기", "3. 30분만 집중해보기"],
    }

    return {
        "reality_score": reality_score,
        "share_card": share_card,
        "status": "completed",
    }


def build_graph():
    workflow = StateGraph(AgentState)

    workflow.add_node("crisis_check", crisis_check)
    workflow.add_node("analyze_images", analyze_images)
    workflow.add_node("analyze_input", analyze_input)
    workflow.add_node("select_tools", select_tools)
    workflow.add_node("execute_tools", execute_tools)
    workflow.add_node("generate_response", generate_response)
    workflow.add_node("calculate_score", calculate_score)

    workflow.set_entry_point("crisis_check")

    workflow.add_conditional_edges(
        "crisis_check",
        lambda x: "end" if x["is_crisis"] else "continue",
        {"end": END, "continue": "analyze_images"},
    )

    workflow.add_edge("analyze_images", "analyze_input")
    workflow.add_edge("analyze_input", "select_tools")
    workflow.add_edge("select_tools", "execute_tools")
    workflow.add_edge("execute_tools", "generate_response")
    workflow.add_edge("generate_response", "calculate_score")
    workflow.add_edge("calculate_score", END)

    return workflow.compile()
