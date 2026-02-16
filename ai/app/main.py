import json
import os
import sys
from typing import List, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.agent.graph import build_graph

app = FastAPI(title="Grogi AI Agent Server")

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://grogi.store",
    "https://www.grogi.store",
    "https://api.grogi.store",
]
if os.getenv("FRONTEND_URL"):
    ALLOWED_ORIGINS.append(os.getenv("FRONTEND_URL"))
if os.getenv("BACKEND_URL"):
    ALLOWED_ORIGINS.append(os.getenv("BACKEND_URL"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str
    content: str


class PdfAttachment(BaseModel):
    filename: str
    content: str


class ChatRequest(BaseModel):
    session_id: str
    user_message: str
    level: str
    category: str
    history: List[ChatMessage]
    images: Optional[List[str]] = None
    ocr_text: Optional[str] = None
    pdfs: Optional[List[PdfAttachment]] = None


@app.get("/agent/health")
async def health_check():
    return {"status": "ok", "model": "gpt-4o", "tavily": "ok"}


agent_executor = build_graph()

ANALYSIS_PREVIEW_PAYLOAD = {
    "goal_realism": None,
    "effort_specificity": None,
    "external_blame": None,
    "info_seeking": None,
    "time_urgency": None,
    "total": None,
    "summary": "분석 중...",
}


def _is_generate_response_event(event: dict) -> bool:
    tags = event.get("tags", [])
    metadata = event.get("metadata", {})
    node = metadata.get("langgraph_node")
    return "generate_response" in tags or node == "generate_response"


def _extract_text(value: object) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts: list[str] = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict) and isinstance(item.get("text"), str):
                parts.append(item["text"])
        return "".join(parts)
    if value is None:
        return ""
    return str(value)


async def real_agent_generator(request: ChatRequest):
    # 게이지 제거: 시작부터 고정 spicy 톤
    initial_state = {
        "session_id": request.session_id,
        "user_message": request.user_message,
        "level": "spicy",
        "category": request.category,
        "history": [msg.dict() for msg in request.history],
        "images": request.images or [],
        "pdfs": [p.dict() for p in request.pdfs] if request.pdfs else [],
        "status": "starting",
        "current_section": "diagnosis",
    }

    try:
        sent_content = False

        async for event in agent_executor.astream_events(initial_state, version="v2"):
            kind = event["event"]

            if kind == "on_chain_start" and event["name"] == "LangChain":
                yield {
                    "event": "status",
                    "data": json.dumps({"step": "analyzing", "detail": "입력 분석 및 위험 감지 중"}),
                }
                yield {"event": "analysis_preview", "data": json.dumps(ANALYSIS_PREVIEW_PAYLOAD, ensure_ascii=False)}

            elif kind == "on_chat_model_stream":
                if not _is_generate_response_event(event):
                    continue

                chunk = event.get("data", {}).get("chunk")
                content = _extract_text(getattr(chunk, "content", ""))
                if content:
                    sent_content = True
                    yield {"event": "token", "data": json.dumps({"content": content}, ensure_ascii=False)}

            elif kind == "on_chain_end":
                node_name = event.get("name")

                # LangGraph 노드 종료 이벤트만 처리 (metadata에 langgraph_node가 있는 경우)
                if event.get("metadata", {}).get("langgraph_node") != node_name:
                    # 노드 자체가 아닌 내부 체인 종료는 무시
                    if node_name != "generate_response":
                        continue

                if node_name == "crisis_check":
                    res = event["data"]["output"]
                    crisis_level = res.get("crisis_level", "safe")

                    if crisis_level == "crisis":
                        yield {
                            "event": "crisis",
                            "data": json.dumps({
                                "message": (
                                    "야, 장난 아니고 진지하게 말할게.\n"
                                    "이건 나랑 대화로 풀 수 있는 영역이 아니야.\n"
                                    "지금 네 상태는 전문가한테 말하는 게 맞아.\n"
                                    "전화 한 통이면 돼. 부담 없어."
                                ),
                                "hotlines": [
                                    {"name": "자살예방상담전화", "number": "1393", "desc": "24시간, 전화하면 바로 상담사 연결"},
                                    {"name": "정신건강위기상담전화", "number": "1577-0199", "desc": "24시간, 문자 상담도 가능"},
                                    {"name": "긴급복지", "number": "129", "desc": "복지 지원 연결"},
                                ],
                                "follow_up": "전화가 부담되면 카카오톡에서 '마음이음'검색해봐. 채팅 상담도 돼.",
                            }, ensure_ascii=False),
                        }
                        yield {"event": "done", "data": "{}"}
                        return

                    elif crisis_level == "unclear":
                        yield {
                            "event": "token",
                            "data": json.dumps({
                                "content": (
                                    "야 잠만.\n"
                                    "지금 그거 진심이야?"
                                ),
                            }, ensure_ascii=False),
                        }
                        yield {"event": "done", "data": "{}"}
                        return

                elif node_name == "execute_tools":
                    yield {
                        "event": "status",
                        "data": json.dumps({"step": "searching", "detail": "실시간 데이터 검색 및 팩트 체크 완료"}, ensure_ascii=False),
                    }

                elif node_name == "generate_response":
                    if sent_content:
                        continue # 이미 스트리밍으로 보냄
                    
                    final_result = event["data"]["output"]
                    raw_text = final_result.get("diagnosis") or final_result.get("content") or ""
                    normalized_text = _extract_text(raw_text)
                    
                    if normalized_text.strip():
                        sent_content = True
                        yield {"event": "token", "data": json.dumps({"content": normalized_text}, ensure_ascii=False)}

                elif node_name == "calculate_score":
                    final_result = event["data"]["output"]
                    yield {"event": "score", "data": json.dumps(final_result.get("reality_score", {}), ensure_ascii=False)}
                    yield {"event": "share_card", "data": json.dumps(final_result.get("share_card", {}), ensure_ascii=False)}

            if kind == "on_chat_model_start" and _is_generate_response_event(event):
                yield {"event": "section", "data": json.dumps({"type": "diagnosis"})}

    except Exception as e:
        yield {"event": "error", "data": json.dumps({"code": "AGENT_ERROR", "message": f"에러 발생: {str(e)}"})}

    yield {"event": "done", "data": "{}"}


@app.post("/agent/chat")
async def chat_endpoint(request: ChatRequest):
    return EventSourceResponse(real_agent_generator(request))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", 8000)))
