/**
 * 환경변수 검증 (BE-21)
 *
 * 서버 시작 시 .env 파일의 필수 환경변수를 Zod로 검증한다.
 * 하나라도 빠지거나 형식이 틀리면 에러 메시지를 출력하고 즉시 종료한다.
 *
 * 사용법: import { env } from "./lib/env" → env.DATABASE_URL 처럼 접근
 * (process.env 대신 이 모듈을 쓰면 타입 안전 + 누락 방지)
 */
import { z } from "zod/v4";
import dotenv from "dotenv";

// .env 파일을 process.env에 로드
dotenv.config();

// 필수 환경변수 스키마 정의
const envSchema = z.object({
  DATABASE_URL: z.string(),                // PostgreSQL 연결 문자열
  KAKAO_CLIENT_ID: z.string(),             // 카카오 OAuth 앱 키
  KAKAO_CLIENT_SECRET: z.string(),         // 카카오 OAuth 시크릿
  KAKAO_REDIRECT_URI: z.string().url(),    // 카카오 로그인 후 리다이렉트 URL
  JWT_SECRET: z.string().min(8),           // JWT 서명 키 (최소 8자)
  AI_SERVER_URL: z.string().url(),         // AI 서버 주소 (FastAPI 등)
  PORT: z.coerce.number().default(3000),   // 서버 포트 (기본 3000)
  FRONTEND_URL: z.string().optional(),     // 배포된 프론트엔드 URL (CORS용, 선택)
});

// process.env를 스키마로 검증
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // 어떤 환경변수가 빠졌거나 잘못됐는지 구체적으로 출력
  console.error("Missing or invalid environment variables:");
  console.error(parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n"));
  process.exit(1);
}

/** 검증 완료된 환경변수 객체 (타입 안전) */
export const env = parsed.data;
