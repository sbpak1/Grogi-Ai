/**
 * Express 앱 설정
 *
 * 미들웨어 적용 순서:
 *   1. CORS — 프론트엔드 origin만 허용 (localhost:5173 + 배포 URL)
 *   2. JSON 파서 — request body를 자동으로 JSON 파싱
 *   3. 라우터 — /api/* 경로별 라우터 연결
 */
import express from "express";
import cors from "cors";
import { env } from "./lib/env";
import { authRouter } from "./routes/auth.routes";
import { sessionRouter } from "./routes/session.routes";
import { chatRouter } from "./routes/chat.routes";
import { shareRouter } from "./routes/share.routes";
import { messageRouter } from "./routes/message.routes";

const app = express();

// ─── CORS 설정 ─────────────────────────────────
// 기본: Vite 로컬 개발 서버 (localhost:5173)
// 배포 시: grogi.store + .env의 FRONTEND_URL 추가
const allowedOrigins = [
  "http://localhost:5173",
  "https://grogi.store",
  "https://www.grogi.store",
];
if (env.FRONTEND_URL) {
  allowedOrigins.push(env.FRONTEND_URL);
}

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true, // 쿠키/Authorization 헤더 허용
  })
);

// ─── 공통 미들웨어 ──────────────────────────────
app.use(express.json({ limit: '15mb' })); // PDF base64 포함 대용량 요청 허용

// ─── 헬스 체크 ──────────────────────────────────
// GET / → 서버 생존 확인용 (배포 후 모니터링에 사용)
app.get("/", (_req, res) => {
  res.json({ status: "ok", service: "grogi-ai-backend" });
});

// ─── API 라우터 ─────────────────────────────────
app.use("/api/auth", authRouter);       // 카카오 로그인, 내 정보
app.use("/api/sessions", sessionRouter); // 상담 세션 CRUD
app.use("/api/chat", chatRouter);       // AI 채팅 메시지 전송
app.use("/api/share", shareRouter);     // 공유 카드 생성/조회
app.use("/api/message", messageRouter);   // 카카오 메시지 전송 (나에게 보내기)

export { app };
