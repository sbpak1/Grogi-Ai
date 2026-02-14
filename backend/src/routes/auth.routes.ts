/**
 * 인증 라우터 (/api/auth)
 *
 * 카카오 OAuth 기반 로그인/회원가입을 처리한다.
 *
 * 엔드포인트 (Day 3 구현 예정):
 *   POST /api/auth/kakao  — 카카오 인가 코드로 로그인 (신규 유저면 자동 가입)
 *                            요청: { code: string }  (프론트에서 받은 인가 코드)
 *                            응답: { token: string, user: { id, nickname } }
 *
 *   GET  /api/auth/me     — 내 정보 조회 (authMiddleware 필요)
 *                            헤더: Authorization: Bearer <JWT>
 *                            응답: { id, nickname, createdAt }
 */
import { Router } from "express";

export const authRouter = Router();
