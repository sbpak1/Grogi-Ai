import { Request, Response } from "express";
import { sessionService } from "../services/session.service";

export const sessionController = {
    async create(req: Request, res: Response) {
        const userId = req.userId!;

        try {
            const session = await sessionService.createSession(userId);
            res.status(201).json({ session_id: session.id });
        } catch (error) {
            res.status(500).json({ error: "세션 생성 실패" });
        }
    },

    async list(req: Request, res: Response) {
        const userId = req.userId!;
        try {
            const sessions = await sessionService.getUserSessions(userId);
            res.json(sessions);
        } catch (error) {
            res.status(500).json({ error: "세션 목록 조회 실패" });
        }
    },

    async getDetail(req: Request, res: Response) {
        const id = req.params.id as string;
        const userId = req.userId!;
        try {
            const session = await sessionService.getSession(id, userId);
            if (!session) return res.status(404).json({ error: "세션을 찾을 수 없습니다" });
            res.json(session);
        } catch (error) {
            res.status(500).json({ error: "세션 조회 실패" });
        }
    },
};
