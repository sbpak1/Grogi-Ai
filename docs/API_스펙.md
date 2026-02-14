# Grogi AI API 스펙

## 1. 전체 API 목록

### 프론트엔드 → Node.js 백엔드

| # | Method | Endpoint | 설명 | 인증 | 근거 | 백로그 |
|---|--------|----------|------|------|------|--------|
| 1 | POST | /api/auth/kakao | 카카오 인가 코드 → JWT(24h) 발급 | None | 4.5.1절, 10절 | BE-05 |
| 2 | POST | /api/sessions | 새 대화 세션 생성 (category, level) | Bearer JWT | 6절 | BE-07 |
| 3 | POST | /api/chat | 팩폭 요청 → SSE 스트리밍 응답 (60초 타임아웃) | Bearer JWT | 8.1절, 10절 | BE-08 |
| 4 | GET | /api/chat/{sessionId} | 대화 히스토리 조회 (세션 정보 + 메시지 목록) | Bearer JWT | 10절 | BE-16 |
| 5 | POST | /api/share | 공유 카드 데이터 조회 (message_id 기반) | Bearer JWT | 10절 | BE-17 |

### Node.js 백엔드 → Python AI 서버

| # | Method | Endpoint | 설명 | 인증 | 근거 | 백로그 |
|---|--------|----------|------|------|------|--------|
| 6 | POST | /agent/chat | 팩폭 요청 → SSE 스트리밍 (Node가 파싱 후 중계) | 내부 인증 (합의) | 8.1절 | AG-14, BE-08 |
| 7 | GET | /agent/health | 헬스체크 (30초 간격, status/model/tavily) | None | 8.4절 | AG-18, BE-18 |

### Node.js 백엔드 → 카카오 API

| # | Method | Endpoint | 설명 | 인증 | 근거 | 백로그 |
|---|--------|----------|------|------|------|--------|
| 8 | POST | https://kauth.kakao.com/oauth/token | 인가 코드 → 카카오 Access Token 교환 | None | 4.5.1절 | BE-05 |
| 9 | GET | https://kapi.kakao.com/v2/user/me | 카카오 사용자 정보 조회 (kakao_id, nickname) | Bearer 카카오AT | 4.5.1절 | BE-05 |

### 프론트엔드 → 카카오 SDK

| # | Method | Endpoint | 설명 | 인증 | 근거 | 백로그 |
|---|--------|----------|------|------|------|--------|
| 10 | SDK | Kakao.Auth.authorize() | 카카오 인증 페이지 리다이렉트 → 인가 코드 수신 | None | 4.5.1절 | AU-02 |

### Python AI 서버 → OpenAI API

| # | Method | Endpoint | 설명 | 인증 | 근거 | 백로그 |
|---|--------|----------|------|------|------|--------|
| 11 | POST | https://api.openai.com/v1/chat/completions | GPT-4o 추론 + Function Calling (stream) | Bearer API Key | 5절, 3.3절 | AG-02 |
| 12 | POST | https://api.openai.com/v1/chat/completions | crisis_check 2차 LLM 분석 (우회 표현 감지) | Bearer API Key | 3.1절 | AG-03 |

### Python AI 서버 → Tavily API

| # | Method | Endpoint | 설명 | 인증 | 근거 | 백로그 |
|---|--------|----------|------|------|------|--------|
| 13 | POST | https://api.tavily.com/search | 실시간 웹 검색 (무료 1,000회/월) | API Key (body) | 3.5절 | AG-10 |

---

## 2. API 상세

### 1. POST /api/auth/kakao

**Request:**
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| code | string | Y | 카카오 인가 코드 |

**Response (200):**
```json
{
  "token": "JWT (24시간 만료)",
  "user": {
    "id": "uuid",
    "kakao_id": "카카오 사용자 ID",
    "nickname": "카카오 닉네임"
  }
}
```

**Error (401):**
```json
{ "error": "INVALID_CODE" }
```

---

### 2. POST /api/sessions

**Request:**
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| category | string | Y | "career" \| "love" \| "finance" \| "self" \| "etc" |
| level | string | Y | "mild" \| "spicy" \| "extreme" |

**Response (200):**
```json
{ "session_id": "uuid" }
```

---

### 3. POST /api/chat

**Request:**
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| session_id | string | Y | 세션 uuid |
| message | string | Y | 사용자 입력 메시지 |

> level/category는 세션값, history는 서버가 DB에서 조립

**Response:** `Content-Type: text/event-stream` (SSE 이벤트 시트 참조)

**Error (408):**
```json
{ "error": "TIMEOUT" }
```

---

### 4. GET /api/chat/{sessionId}

**Request:** sessionId (URL 경로 파라미터)

**Response (200):**
```json
{
  "session": {
    "id": "uuid",
    "category": "career",
    "level": "spicy"
  },
  "messages": [
    {
      "role": "user | assistant",
      "content": "메시지 내용",
      "reality_score": 76,
      "score_breakdown": { "goal_realism": 18, "..." : "..." }
    }
  ]
}
```

> reality_score, score_breakdown은 assistant 메시지에만 존재 (nullable)

---

### 5. POST /api/share

**Request:**
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| message_id | string | Y | 메시지 uuid |

**Response (200):**
```json
{
  "summary": "팩폭 요약",
  "score": 76,
  "actions": ["액션1", "액션2", "액션3"]
}
```

**Error (404):**
```json
{ "error": "CARD_NOT_FOUND" }
```

---

### 6. POST /agent/chat (내부)

**Request:**
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| session_id | string | Y | 세션 uuid |
| user_message | string | Y | 사용자 입력 |
| level | string | Y | "mild" \| "spicy" \| "extreme" |
| category | string | Y | "career" \| "love" \| "finance" \| "self" \| "etc" |
| history[] | array | Y | 이전 대화. `[{ "role": "user"\|"assistant", "content": "..." }]` |

**Response:** `Content-Type: text/event-stream`

---

### 7. GET /agent/health

**Response (200):**
```json
{
  "status": "ok | error",
  "model": "gpt-4o",
  "tavily": "ok | error"
}
```

---

### 8. POST kauth.kakao.com/oauth/token

> Content-Type: application/x-www-form-urlencoded

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| grant_type | string | Y | "authorization_code" |
| client_id | string | Y | KAKAO_CLIENT_ID (REST API 키) |
| client_secret | string | Y | KAKAO_CLIENT_SECRET |
| redirect_uri | string | Y | KAKAO_REDIRECT_URI |
| code | string | Y | 카카오 인가 코드 |

**Response:** `{ "access_token": "카카오 Access Token" }`

---

### 9. GET kapi.kakao.com/v2/user/me

| 필드 | 위치 | 필수 | 설명 |
|------|------|------|------|
| Authorization | header | Y | Bearer {카카오_access_token} |

**Response:** `{ "id": 12345 (kakao_id), "properties": { "nickname": "닉네임" } }`

---

### 10. Kakao.Auth.authorize()

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| redirectUri | string | Y | KAKAO_REDIRECT_URI |

> Kakao.init(VITE_KAKAO_JS_KEY) 사전 호출 필요. 리다이렉트 URL의 `?code=` 파라미터로 인가 코드 수신.

---

### 11. POST api.openai.com/v1/chat/completions (추론 + FC)

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| model | string | Y | "gpt-4o" |
| messages[] | array | Y | system 프롬프트 + 대화 히스토리 |
| functions[] | array | Y | search_web, get_statistics, calculate_reality_score, generate_share_card |
| function_call | string | Y | "auto" — AI가 자율 선택 |
| stream | boolean | Y | true |

**Response:** `choices[].delta` — `{ content, function_call }` 스트리밍

---

### 12. POST api.openai.com/v1/chat/completions (crisis_check)

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| model | string | Y | "gpt-4o" |
| messages[] | array | Y | system: 위기 판별 프롬프트 + user: 사용자 입력 |
| stream | boolean | Y | false — 동기 호출 |

**Response:** `choices[].message.content` → `"CRISIS"` 또는 `"SAFE"`

---

### 13. POST api.tavily.com/search

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| api_key | string | Y | TAVILY_API_KEY |
| query | string | Y | 검색 쿼리 |
| search_depth | string | N | "basic" \| "advanced" (기본: basic) |
| max_results | int | N | 최대 결과 수 (기본: 5) |

**Response:**
```json
{
  "results": [
    { "url": "...", "title": "...", "content": "요약 + 본문 (LLM 친화적)" }
  ]
}
```

> 무료 1,000회/월. 대안: Google CSE, Serper API

---

## 3. SSE 이벤트

| 순서 | event | 발행 시점 | data 필드 | Node.js 처리 | 프론트 처리 |
|------|-------|-----------|-----------|-------------|-------------|
| 1 | status | 에이전트 추론 시작/진행 | `step`: "searching" \| "analyzing" \| "generating", `detail`: "채용 정보 검색 중..." | pass-through → 프론트 전달 | 로딩 UI 표시 |
| 2 | section | 각 섹션 시작 시 | `type`: "diagnosis" \| "factcheck" \| "actionplan" | pass-through → 프론트 전달 | 섹션 UI 전환 |
| 3 | token | 섹션 내 텍스트 스트리밍 (section 사이 반복) | `content`: "솔직히" | pass-through + 버퍼 누적 (done 시 전체 텍스트 저장용) | 현재 섹션에 텍스트 append + 자동 스크롤 |
| 4 | score | 현실회피지수 산출 완료 | `total`: 76, `breakdown`: { goal_realism, effort_specificity, external_blame, info_seeking, time_urgency (각 0~20) }, `summary`: "..." | 프론트 전달 + 버퍼 보관 (done 시 messages에 저장) | 도넛/바 차트 + 항목별 브레이크다운 |
| 5 | share_card | score 이후 공유 카드 생성 완료 | `summary`: "팩폭 요약", `score`: 76, `actions`: ["액션1", "액션2", "액션3"] | 프론트 전달 + 버퍼 보관 (done 시 share_cards에 저장) | SNS 공유 카드 렌더링 + 이미지 저장/URL 복사 버튼 |
| 6 | done | SSE 스트림 종료 | `{}` | 버퍼 한 트랜잭션 DB 저장: ① messages INSERT ② reality_score UPDATE ③ share_cards INSERT → SSE 연결 종료 | SSE 종료 + 전송 버튼 활성화 |
| - | crisis | 위기 감지 시 (정상 응답 대체) | `message`: "...", `hotlines`: [자살예방 1393, 정신건강위기 1577-0199, 생명의전화 109] | pass-through (score/share_card 없이 done) | 따뜻한 톤 UI + 핫라인 안내 (팩폭 섹션 없음) |
| - | error | 도구 실패/에러 발생 | `code`: "TOOL_FAILED" \| "MODEL_ERROR" \| "TAVILY_LIMIT", `message`: "검색 도구 실행 실패" | 에러 로깅 (코드/메시지/시간) → 프론트 전달 | 에러 안내 메시지 표시 |

---

## 4. Function Calling

| # | Function | 설명 | 파라미터 | 반환 필드 | 외부 의존 | 실패 시 | 백로그 |
|---|----------|------|----------|-----------|-----------|---------|--------|
| 1 | search_web | Tavily 실시간 웹 검색 | query: string | results[].url, results[].title, results[].content | Tavily API (1,000회/월) | 학습 데이터 폴백 + 안내 메시지 | AG-10 |
| 2 | get_statistics | 공공 데이터 통계 검색 (통계청/고용노동부/한국은행/사람인 등) | category: string, keyword: string | search_web과 동일. 프롬프트에 신뢰 출처 우선 명시 | search_web 내부 활용 | search_web과 동일 | AG-11 |
| 3 | calculate_reality_score | 현실 회피 지수 0~100점 산출 (5항목 각 0~20) | user_message: string, context: string | goal_realism, effort_specificity, external_blame, info_seeking, time_urgency (각 0~20), total (0~100), summary | 없음 (LLM 자체 판단) | 기본 점수 50 반환 | AG-12 |
| 4 | generate_share_card | SNS 공유 카드 생성 | summary: string, score: int, actions: string[] | summary, score, actions[3] | 없음 | share_card 생략, score만 전송 | AG-13 |
