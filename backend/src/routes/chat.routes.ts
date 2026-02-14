/**
 * 채팅 라우터 (/api/chat)
 *
 * 사용자가 보낸 고민 메시지를 AI 서버로 전달하고,
 * AI 응답(조언 + 현실성 점수)을 DB에 저장한 뒤 프론트에 반환한다.
 *
 * 엔드포인트 (Day 3 구현 예정):
 *   POST /api/chat/send  — 메시지 전송
 *                           요청: { sessionId: string, content: string }
 *                           처리: 1) user 메시지 DB 저장
 *                                 2) AI_SERVER_URL로 프록시 요청
 *                                 3) AI 응답(assistant 메시지 + reality_score) DB 저장
 *                           응답: AI 메시지 객체 { content, realityScore, scoreBreakdown }
 */
import { Router } from "express";

export const chatRouter = Router();
