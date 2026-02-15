/**
 * 채팅 라우터 (/api/chat)
 *
 * 사용자가 보낸 고민 메시지를 AI 서버로 전달하고,
 * AI 응답(조언 + 현실성 점수)을 DB에 저장한 뒤 프론트에 반환한다.
 */
import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { chatController } from "../controllers/chat.controller";

export const chatRouter = Router();

chatRouter.use(authMiddleware);

chatRouter.get("/:sessionId", chatController.getHistory);
chatRouter.post("/", chatController.send);
