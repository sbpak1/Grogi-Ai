import os
import sys
import asyncio
from fastapi import FastAPI, Request

# 패키지 경로 추가 (로컬 실행 시 'app' 모듈 인식용)
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import json
from sse_starlette.sse import EventSourceResponse

app = FastAPI(title="Grogi AI Agent Server")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 실제 운영환경에서는 제한 필요
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
    images: Optional[List[str]] = None  # Base64encoded images or URLs
    ocr_text: Optional[str] = None

@app.get("/agent/health")
async def health_check():
    return {
        "status": "ok",
        "model": "gpt-4o",
        "tavily": "ok"
    }

from app.agent.graph import build_graph

# LangGraph 컴파일된 그래프
agent_executor = build_graph()

async def real_agent_generator(request: ChatRequest):
    """
    실제 에이전트 연동 및 SSE 스트리밍 (AG-14, AG-15, 멀티모달 반영)
    API 스펙 v3.2를 엄격히 준수합니다.
    """
    initial_state = {
        "session_id": request.session_id,
        "user_message": request.user_message,
        "level": request.level,
        "category": request.category,
        "history": [msg.dict() for msg in request.history],
        "images": request.images or [],
        "t_gauge": 0, # 초기 게이지
        "status": "starting",
        "current_section": "diagnosis"
    }

    try:
        # 1. 상태 전이 추적하며 이벤트 발행
        # astream_events를 사용하여 노드 진입/완료 시점 캐치
        async for event in agent_executor.astream_events(initial_state, version="v2"):
            kind = event["event"]
            
            # 노드 시작/종료 시 status 업데이트
            if kind == "on_chain_start" and event["name"] == "LangChain":
                yield {"event": "status", "data": json.dumps({"step": "analyzing", "detail": "입력 분석 및 위험 감지 중..."})}
            
            elif kind == "on_chat_model_stream":
                # 토큰 스트리밍
                tags = event.get("tags", [])
                if "generate_response" not in tags:
                    continue
                content = event["data"]["chunk"].content
                if content:
                    yield {"event": "token", "data": json.dumps({"content": content})}
            
            elif kind == "on_chain_end":
                node_name = event.get("name")
                if node_name == "crisis_check":
                    res = event["data"]["output"]
                    if res.get("is_crisis"):
                        yield {
                            "event": "crisis",
                            "data": json.dumps({
                                "message": "지금 하신 말씀은 장난으로만 들리지 않네요. 지쳐있는 당신에게 지금 필요한 건 팩폭이 아니라 따뜻한 위로와 전문가의 도움인 것 같습니다.",
                                "hotlines": ["자살예방 1393", "정신건강위기 1577-0199", "생명의전화 109"]
                            })
                        }
                        yield {"event": "done", "data": "{}"}
                        return
                
                elif node_name == "analyze_avoidance":
                    tg = event["data"]["output"].get("t_gauge", 0)
                    yield {"event": "t_gauge", "data": json.dumps({"value": tg})}

                elif node_name == "execute_tools":
                    yield {"event": "status", "data": json.dumps({"step": "searching", "detail": "실시간 데이터 검색 및 팩트 체크 완료"})}
                
                elif node_name == "generate_response":
                    final_result = event["data"]["output"]
                    # Final assistant text for chat UI/persistence.
                    diagnosis = final_result.get("diagnosis")
                    if isinstance(diagnosis, str) and diagnosis.strip():
                        yield {"event": "token", "data": json.dumps({"content": diagnosis})}
                    # 최종 스코어 및 카드 전송
                    yield {"event": "score", "data": json.dumps(final_result.get("reality_score", {}))}
                    yield {"event": "share_card", "data": json.dumps(final_result.get("share_card", {}))}
                    if "t_gauge" in final_result:
                         yield {"event": "t_gauge", "data": json.dumps({"value": final_result["t_gauge"]})}

            # 섹션 전환 시뮬레이션 (프롬프트 내에서 섹션 구분자를 사용하면 더 정확함)
            # 현재는 간단히 스트리밍 시작 시 diagnosis 섹션 발행
            if kind == "on_chat_model_start" and "generate_response" in event.get("tags", []):
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
