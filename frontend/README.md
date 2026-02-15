# Grogi Frontend (간단한 스캐폴드)

설치 및 실행:

```bash
cd frontend
npm install
npm run dev
```

개요:
- Vite + React 기반의 최소 스캐폴드입니다.
- 프론트엔드는 백엔드 API와 통신하기 위한 간단한 API 클라이언트(`src/api.ts`)와 최소 UI(`src/pages/*`)를 포함합니다.

중요 라이브러리:
- `react`, `react-dom` — UI
- `axios` — REST 호출
- `@microsoft/fetch-event-source` — POST 기반 SSE 스트리밍 수신용
- `vite`, `@vitejs/plugin-react`, `typescript` — 개발/빌드 도구

프론트엔드가 호출하는 주요 엔드포인트(백엔드 쪽 명세 참고):
- `POST /api/auth/kakao` — 카카오 인가 코드 교환 → JWT
- `POST /api/sessions` — 새 대화 세션 생성
- `POST /api/chat` — 팩폭 요청 → SSE 스트리밍
- `GET /api/chat/{sessionId}` — 세션 대화 기록 조회
- `POST /api/share` — 공유 카드 데이터 조회

간단 사용법:
- 로그인: `Login` 페이지에서 카카오 SDK가 로드되어 있으면 `Kakao.Auth.authorize()`를 호출합니다. 개발 시 인가 코드를 직접 붙여넣어 테스트할 수 있습니다.
- 세션 생성: `Sessions`에서 category/level로 세션 생성 후 Chat으로 이동.
- 채팅: 입력 후 전송하면 SSE로 스트리밍 응답을 수신합니다.

디자이너가 UX를 준비하면 `src/pages/*` 컴포넌트를 UI에 맞춰 스타일링하면 됩니다.
