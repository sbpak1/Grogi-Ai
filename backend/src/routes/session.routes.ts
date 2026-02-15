/**
 * 상담 세션 라우터 (/api/sessions)
 *
 * 사용자별 상담 세션(대화방)을 관리한다.
 */
import { Router } from "express";
import { authMiddleware } from "../middlewares/auth.middleware";
import { sessionController } from "../controllers/session.controller";

export const sessionRouter = Router();

sessionRouter.use(authMiddleware);

sessionRouter.post("/", sessionController.create);
sessionRouter.get("/", sessionController.list);
sessionRouter.get("/:id", sessionController.getDetail);
