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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    session_id: str
    user_message: str
    level: str
    category: str
    history: List[ChatMessage]
    images: Optional[List[str]] = None
    ocr_text: Optional[str] = None


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
                    yield {"event": "token", "data": json.dumps({"content": content})}

            elif kind == "on_chain_end":
                node_name = event.get("name")

                if node_name == "crisis_check":
                    res = event["data"]["output"]
                    if res.get("is_crisis"):
                        yield {
                            "event": "crisis",
                            "data": json.dumps(
                                {
                                    "message": "지금은 혼자 버티는 것보다 즉시 전문 도움을 받는 게 우선입니다.",
                                    "hotlines": ["자살예방 1393", "정신건강위기 1577-0199", "긴급복지 129"],
                                }
                            ),
                        }
                        yield {"event": "done", "data": "{}"}
                        return

                elif node_name == "execute_tools":
                    yield {
                        "event": "status",
                        "data": json.dumps({"step": "searching", "detail": "실시간 데이터 검색 및 팩트 체크 완료"}),
                    }

                elif node_name == "generate_response":
                    final_result = event["data"]["output"]
                    # 텍스트 생성 결과 (이미 스트리밍으로 전송되었을 수 있음)
                    raw_text = final_result.get("diagnosis") or final_result.get("content") or ""
                    normalized_text = _extract_text(raw_text)
                    
                    if normalized_text.strip() and not sent_content:
                        sent_content = True
                        yield {"event": "token", "data": json.dumps({"content": normalized_text})}

                elif node_name == "calculate_score":
                    final_result = event["data"]["output"]
                    yield {"event": "score", "data": json.dumps(final_result.get("reality_score", {}))}
                    yield {"event": "share_card", "data": json.dumps(final_result.get("share_card", {}))}

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
