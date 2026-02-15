import asyncio
import os
import json
from dotenv import load_dotenv
load_dotenv(override=True) # Prefer project .env over stale system-level OPENAI_API_KEY

from app.agent.graph import build_graph
from langchain_core.messages import HumanMessage, AIMessage

async def test_agent_cli():
    print("🥊 Grogi AI CLI Test Mode 🥊")
    print("-" * 30)
    
    # API Key 확인 (테스트를 위해 필요)
    if not os.getenv("OPENAI_API_KEY"):
        print("경고: OPENAI_API_KEY가 설정되지 않았습니다. .env 파일이나 환경 변수를 확인하세요.")
        # 임시로 더미 키를 넣을 수는 없으니 사용자에게 안내
        
    executor = build_graph()
    
    # 초기 세팅
    history = []
    t_gauge = 0
    level = "spicy"
    category = "career"
    
    while True:
        user_input = input(f"\n[나] (T-Gauge: {t_gauge}%) (종료: q, 이미지 첨부: i): ")
        if user_input.lower() == 'q':
            break
            
        images = []
        # 'i' 커맨드 또는 직접 파일 경로 입력 시 이미지 처리
        img_path = None
        if user_input.lower() == 'i':
            img_path = input("이미지 파일 경로를 입력하세요: ").strip()
        elif os.path.isfile(user_input.strip()): # 입력값이 실제 파일 경로인 경우 자동 인식
            img_path = user_input.strip()
            
        if img_path:
            if os.path.exists(img_path):
                # 파일 확장자 확인
                ext = os.path.splitext(img_path)[1].lower()
                
                # 이미지 파일 처리
                if ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp']:
                    try:
                        import base64
                        with open(img_path, "rb") as image_file:
                            encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
                            mime_type = {
                                ".jpg": "image/jpeg",
                                ".jpeg": "image/jpeg",
                                ".png": "image/png",
                                ".gif": "image/gif",
                                ".webp": "image/webp",
                            }.get(ext, "image/jpeg")
                            images.append(f"data:{mime_type};base64,{encoded_string}")
                        print(f"✅ 이미지 파일 로드 성공: {os.path.basename(img_path)}")
                        
                        if user_input.lower() == 'i':
                            user_input = input("이미지와 함께 보낼 메시지: ")
                        else:
                            # 경로만 입력했을 경우
                            msg = input("이미지와 함께 보낼 메시지 (엔터 치면 '분석해줘'로 전송): ").strip()
                            user_input = msg if msg else "이 이미지 내용 분석해줘."
                    except Exception as e:
                        print(f"❌ 이미지 로드 실패: {e}")
                        continue
                        
                # 텍스트 파일 처리
                elif ext in ['.txt', '.md', '.py', '.js', '.json', '.html', '.css', '.csv']:
                    try:
                        with open(img_path, "r", encoding='utf-8') as f:
                            file_content = f.read()
                        print(f"✅ 텍스트 파일 읽기 성공: {os.path.basename(img_path)} ({len(file_content)}자)")
                        
                        # 사용자 입력에 파일 내용 추가
                        file_msg = f"\n\n[파일 내용 ({os.path.basename(img_path)})]\n```\n{file_content}\n```"
                        
                        if user_input.lower() == 'i':
                             user_input = input("파일과 함께 보낼 메시지: ") + file_msg
                        else:
                             msg = input("파일과 함께 보낼 메시지 (엔터 치면 '내용 분석해줘'로 전송): ").strip()
                             user_input = (msg if msg else "이 파일 내용 분석해줘.") + file_msg
                    except Exception as e:
                        print(f"❌ 파일 읽기 실패: {e}")
                        continue
                
                else:
                    print(f"⚠️ 지원하지 않는 파일 형식입니다: {ext}")
                    continue
            else:
                print("❌ 파일을 찾을 수 없습니다.")

        print("\n[Grogi AI 분석 중...]")
        
        state = {
            "session_id": "test_session",
            "user_message": user_input,
            "level": level,
            "category": category,
            "history": history,
            "images": images,
            "t_gauge": t_gauge,
            "status": "starting",
            "current_section": "diagnosis"
        }
        
        try:
            # 동기식 호출로 결과 확인
            result = await asyncio.to_thread(executor.invoke, state)
            
            # 게이지 업데이트 보관
            t_gauge = result.get("t_gauge", t_gauge)
            
            if result.get("is_crisis"):
                print("\n🚨 위기 감지 보호 모드 작동 🚨")
                print(f"응답: 지금은 위로가 필요해 보입니다. 전문가의 도움(1393)을 받으세요.")
            else:
                response_text = result.get("diagnosis", "응답 생성 실패")
                image_fact = result.get("image_analysis", "")
                if image_fact and image_fact != "이미지 없음":
                    print(f"\n[이미지 팩트]\n{image_fact}")
                print(f"\n[Grogi AI 응답 - T-Gauge: {t_gauge}%]\n{response_text}")
                print("-" * 20)
                print(f"📊 현실회피지수: {result.get('reality_score', {}).get('total', 0)}점")
                
                # 히스토리에 추가
                history.append({"role": "user", "content": user_input})
                history.append({"role": "assistant", "content": response_text})
        except Exception as e:
            print(f"오류 발생: {e}")

if __name__ == "__main__":
    asyncio.run(test_agent_cli())
