# 🥊 Grogi AI

> **공감 제로, 현실 인식 맥스 — AI 에이전트**

고민을 입력하면 공감 대신 팩폭을 날리고, 실시간 데이터 기반의 현실적 액션 플랜을 제시하는 AI 에이전트입니다.

## 🔥 핵심 기능

- **팩폭 상담** — 현실 진단 → 팩트 체크 → 액션 플랜 3단계 구조
- **이성적 분석** — 냉정하고 직설적인 조언 (Spicy Tone 고정)
- **현실 회피 지수** — 0~100점 측정 + SNS 공유 카드
- **AI 에이전트** — LangGraph 기반 다단계 추론, 실시간 웹 검색/통계 자동 수집
- **안전 장치** — 위기 상황 자동 감지 시 팩폭 해제 + 전문 상담 안내

## 🏗️ 아키텍처

```
[React - Cloudflare Pages]
        │ SSE
        ▼
[Node.js Express - Railway]
        │ HTTP Streaming
        ▼
[Python FastAPI + LangGraph - Railway]
        │
        ├── OpenAI GPT-4o (Function Calling)
        └── Tavily Search API
```

## 🛠️ 기술 스택

| 구분 | 기술 |
|------|------|
| Frontend | React 18 + Vite + TypeScript, Tailwind CSS, Zustand |
| Backend | Node.js + Express, Prisma, PostgreSQL |
| AI Agent | Python + FastAPI + LangGraph, GPT-4o, Tavily |
| 인증 | 카카오 OAuth 2.0 + JWT |
| 배포 | Cloudflare Pages, Railway |

## 📁 프로젝트 구조

```
grogi-ai/
├── frontend/          # React + Vite (Cloudflare Pages)
│   ├── src/
│   │   ├── stores/    # Zustand 스토어
│   │   ├── components/
│   │   └── hooks/
│   ├── package.json
│   └── vite.config.ts
├── backend/           # Node.js + Express (Railway)
│   ├── src/
│   ├── prisma/
│   ├── package.json
│   └── Dockerfile
├── ai/                # Python + FastAPI + LangGraph (Railway)
│   ├── app/
│   │   ├── agent/     # LangGraph 그래프 + 노드
│   │   ├── tools/     # search_web, get_statistics 등
│   │   └── prompts/   # 시스템 프롬프트 템플릿
│   ├── requirements.txt
│   └── Dockerfile
├── .gitignore
└── README.md
```

## ⚡ 로컬 실행

### 환경 변수 설정

각 서비스 디렉토리에 `.env` 파일 생성:

**backend/.env**
```
DATABASE_URL=postgresql://...
KAKAO_CLIENT_ID=
KAKAO_CLIENT_SECRET=
KAKAO_REDIRECT_URI=
JWT_SECRET=
AI_SERVER_URL=http://localhost:8000
PORT=3000
```

**ai/.env**
```
OPENAI_API_KEY=
TAVILY_API_KEY=
PORT=8000
```

**frontend/.env**
```
VITE_API_URL=http://localhost:3000
VITE_KAKAO_JS_KEY=
```

### 실행

```bash
# AI 서버
cd ai
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 백엔드
cd backend
npm install
npx prisma migrate dev
npm run dev

# 프론트엔드
cd frontend
npm install
npm run dev
```

## 👥 팀

| 역할 | 담당 |
|------|------|
| Backend | Node.js API, 카카오 OAuth, SSE 중계, DB |
| Frontend | React UI, 채팅, 결과 카드, 공유 |
| AI | LangGraph 에이전트, 프롬프트, 도구 구현 |

## 📅 개발 기간

**2026.02.13 ~ 02.20 (7일)**

---

*"불편하지만 필요한 진실을, 데이터와 함께."*