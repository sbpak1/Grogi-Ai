# Grogi AI

AI 기반 고민 상담 챗봇 서비스. 사용자의 고민을 듣고 현실성 점수(Reality Score)와 함께 조언을 제공한다.

## Project Structure

```
Grogi-Ai/
├── backend/          # Express + TypeScript API 서버
├── frontend/         # (예정) Vite + React
└── docs/             # 기획서, 백로그, API 스펙
```

## Backend (backend/)

### Tech Stack
- **Runtime**: Node.js v20, TypeScript (ES2020, strict)
- **Framework**: Express 5
- **ORM**: Prisma 7 + PostgreSQL (`@prisma/adapter-pg`)
- **Validation**: Zod 4 (`import from "zod/v4"`)
- **Auth**: JWT (jsonwebtoken), 카카오 OAuth

### Commands
```bash
cd backend
npm run dev      # tsx watch src/server.ts (개발)
npm run build    # tsc
npm start        # node dist/server.js (프로덕션)
npx prisma generate   # Prisma 클라이언트 타입 생성
npx prisma migrate dev # DB 마이그레이션 (DB 연결 필요)
```

### Key Conventions
- **Prisma 7**: datasource에 url 없음. `prisma.config.ts`에서 migrate URL 관리, PrismaClient에 adapter 전달 필수
- **Prisma 모델**: PascalCase 모델명 + `@@map("snake_case")` 테이블 매핑
- **Generated 코드**: `src/generated/prisma/` — git 추적 안 함, tsconfig exclude
- **Import**: PrismaClient는 `../generated/prisma/client`에서 import
- **환경변수**: `src/lib/env.ts`에서 Zod로 검증. 빠진 변수 시 서버 시작 안 됨
- **라우터**: `/api/auth`, `/api/sessions`, `/api/chat`, `/api/share`
- **CORS**: localhost:5173 + FRONTEND_URL 환경변수

### DB Models
- **User**: kakao_id(unique), nickname
- **Session**: user_id FK, category, level
- **Message**: session_id FK, role, content, reality_score?, score_breakdown?
- **ShareCard**: message_id FK(unique), summary, score, actions

### Environment Variables (backend/.env)
```
DATABASE_URL=postgresql://...
KAKAO_CLIENT_ID=
KAKAO_CLIENT_SECRET=
KAKAO_REDIRECT_URI=   # URL 형식 필수
JWT_SECRET=            # 8자 이상
AI_SERVER_URL=http://localhost:8000
PORT=3000
FRONTEND_URL=          # (optional) 배포 시 프론트 URL
```
