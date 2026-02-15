/**
 * 상담 세션 라우터 (/api/sessions)
 *
 * 사용자별 상담 세션(대화방)을 관리한다.
 * 모든 엔드포인트에 authMiddleware 적용 예정.
 *
 * 엔드포인트 (Day 3 구현 예정):
 *   POST /api/sessions      — 새 상담 세션 생성
 *                              요청: { category: "career"|..., level: "light"|"deep" }
 *                              응답: 생성된 세션 객체
 *
 *   GET  /api/sessions      — 내 세션 목록 조회 (최신순)
 *                              응답: 세션 배열 (마지막 메시지 포함)
 *
 *   GET  /api/sessions/:id  — 세션 상세 + 메시지 히스토리 조회
 *                              응답: 세션 객체 + messages[]
 */
import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { sessionController } from "../controllers/session.controller";

export const sessionRouter = Router();

sessionRouter.use(authMiddleware);

sessionRouter.post("/", sessionController.create);
sessionRouter.get("/", sessionController.list);
sessionRouter.get("/:id", sessionController.getDetail);
