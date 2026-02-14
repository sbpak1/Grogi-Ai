/**
 * 공유 카드 라우터 (/api/share)
 *
 * AI 응답 메시지를 SNS 공유용 카드로 변환한다.
 * 공유 카드는 1:1로 message에 연결된다 (message_id UNIQUE).
 *
 * 엔드포인트 (Day 3 구현 예정):
 *   POST /api/share      — 공유 카드 생성 (authMiddleware 필요)
 *                           요청: { messageId: string }
 *                           처리: 해당 메시지의 요약/점수/액션을 카드로 변환
 *                           응답: 생성된 ShareCard 객체
 *
 *   GET  /api/share/:id  — 공유 카드 조회 (비로그인도 가능 — 공개 링크)
 *                           응답: { summary, score, actions }
 */
import { Router } from "express";

export const shareRouter = Router();
