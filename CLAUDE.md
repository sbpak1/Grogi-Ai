# Grogi AI

AI 기반 고민 상담 챗봇 서비스. 사용자의 고민을 듣고 현실성 점수(Reality Score)와 함께 조언을 제공한다.
분노게이지(T-Gauge): 사용자가 답답한 대화(회피, 변명)를 할수록 AI가 자동으로 팩폭 강도를 올림 (0~100%).

## Project Structure

```
Grogi-Ai/
├── backend/          # Express + TypeScript API 서버
├── frontend/         # Vite + React
├── ai/               # FastAPI + LangGraph AI 에이전트
└── docs/             # 기획서, 백로그, API 스펙
```

## Deployment

| 서비스 | 플랫폼 | 도메인 |
|--------|--------|--------|
| Frontend | Cloudflare Pages | grogi.store |
| Backend | Railway | api.grogi.store |
| AI Server | Railway | ai.grogi.store |
| PostgreSQL | Railway | 내부 통신 |

- DNS: Cloudflare에서 관리 (카페24에서 네임서버 이전 완료)
- Railway 내부 통신: `http://Grogi-Ai.railway.internal:8000` (백엔드→AI)
- 자동 배포: main 브랜치 push 시 Railway/Cloudflare 자동 빌드

## Git Workflow

- `main`: 배포 브랜치 (Railway, Cloudflare Pages 자동 배포)
- `dev`: 개발 통합 브랜치
- `feature/*`: 기능 브랜치 → dev PR → main 머지
- 커밋 시 브랜치 만들고 PR로 머지 (dev에 직접 push 금지)

## Backend (backend/)

### Tech Stack
- **Runtime**: Node.js v20, TypeScript (ES2020, strict)
- **Framework**: Express 5
- **ORM**: Prisma 7 + PostgreSQL (`@prisma/adapter-pg`)
- **Validation**: Zod 4 (`import from "zod/v4"`)
- **Auth**: JWT (jsonwebtoken), 카카오 OAuth
- **Architecture**: MVC (routes → controllers → services)

### Commands
```bash
cd backend
npm run dev      # tsx watch src/server.ts (개발)
npm run build    # prisma generate && tsc
npm start        # node dist/server.js (프로덕션)
npx prisma generate   # Prisma 클라이언트 타입 생성
npx prisma migrate dev # DB 마이그레이션 (DB 연결 필요)
```

### Key Conventions
- **Prisma 7**: datasource에 url 없음. `prisma.config.ts`에서 datasource URL 관리, PrismaClient에 adapter 전달 필수
- **Prisma 모델**: PascalCase 모델명 + `@@map("snake_case")` 테이블 매핑
- **Generated 코드**: `src/generated/prisma/` — git 추적 안 함, tsconfig exclude
- **Import**: PrismaClient는 `../generated/prisma/client`에서 import
- **환경변수**: `src/lib/env.ts`에서 Zod로 검증. 빠진 변수 시 서버 시작 안 됨
- **라우터**: `/api/auth`, `/api/sessions`, `/api/chat`, `/api/share`
- **CORS**: localhost:5173 + grogi.store + FRONTEND_URL 환경변수
- **Express 5**: req.params는 `string | string[]` 타입 → `as string` 캐스트 필요
- **빌드 스크립트**: `prisma generate && tsc` (Railway에서 generated 타입 필요)

### DB Models
- **User**: kakao_id(unique), nickname
- **Session**: user_id FK (category/level 제거됨 — 분노게이지 자동 판단)
- **Message**: session_id FK, role, content, reality_score?, score_breakdown?
- **ShareCard**: message_id FK(unique), summary, score, actions

### Environment Variables
- `backend/.env` 참고 (git 추적 안 함)
- 필요 키: DATABASE_URL, KAKAO_CLIENT_ID, KAKAO_CLIENT_SECRET, KAKAO_REDIRECT_URI, JWT_SECRET, AI_SERVER_URL, PORT, FRONTEND_URL

## Frontend (frontend/)

### Tech Stack
- **Framework**: React 18 + Vite 5 + TypeScript
- **SSE**: @microsoft/fetch-event-source
- **OCR**: tesseract.js
- **HTTP**: axios (토큰 인터셉터 자동 첨부)

### Key Points
- 메인 화면 = 채팅 화면 (ChatGPT 스타일)
- 첫 메시지 전송 시 세션 자동 생성 (`createSession()` → `chatStream()`)
- 로그인 안 된 상태면 로그인 페이지 표시
- `VITE_API_BASE_URL` 환경변수로 API 서버 주소 설정
- Cloudflare Pages: `VITE_API_BASE_URL=https://api.grogi.store`

## AI Server (ai/)

### Tech Stack
- **Framework**: FastAPI + Uvicorn
- **Agent**: LangGraph 7-node (crisis_check → analyze → select_tools → generate)
- **LLM**: GPT-4o
- **Search**: DuckDuckGo (무료, Tavily에서 변경)
- **T-Gauge**: 분노게이지 0~100% 자동 조절

### Environment Variables
- OPENAI_API_KEY, PORT (Railway 환경변수로 관리)

## 카카오 OAuth

- 카카오 개발자 콘솔에서 REST API 키, Client Secret, Redirect URI 관리
- Redirect URI (로컬): http://localhost:5173/auth/kakao
- Redirect URI (배포): https://grogi.store/auth/kakao

## 완료된 작업 (Day 1~3)

- 백엔드 API (auth, sessions, chat, share) 구현
- Prisma DB 스키마 + 마이그레이션
- category/level 제거 → 분노게이지 자동 판단
- MVC 패턴 리팩토링 (routes → controllers → services)
- Railway 배포 (백엔드 + AI + PostgreSQL)
- Cloudflare Pages 프론트 배포
- DNS 설정 (카페24 → Cloudflare 네임서버 이전)
- 카카오 개발자 콘솔 Redirect URI 설정
- CORS 설정 (grogi.store 허용)

## 남은 작업

- 통합 테스트 (프론트 → 백엔드 → AI 전체 흐름)
- 프론트 UI/UX 개선
- 공유 카드 기능 테스트
- 에러 핸들링 강화
