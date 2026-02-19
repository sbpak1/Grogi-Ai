import { Request, Response } from "express";
import { sessionService } from "../services/session.service";

export const sessionController = {
    async create(req: Request, res: Response) {
        const userId = req.userId as string;
        const { privateMode } = req.body;

        try {
            const session = await sessionService.createSession(userId, !!privateMode);
            res.status(201).json({ ...session, session_id: session.id }); // Full object + compatibility key
        } catch (error) {
            console.error("Session creation error:", error);
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

    async togglePrivate(req: Request, res: Response) {
        const id = req.params.id as string;
        const userId = req.userId!;
        const { privateMode } = req.body;

        try {
            const session = await sessionService.updatePrivacy(id, userId, privateMode);
            res.json(session);
        } catch (error) {
            console.error("Session privacy update error:", error);
            res.status(500).json({ error: "세션 공개여부 수정 실패" });
        }
    },

    async remove(req: Request, res: Response) {
        const id = req.params.id as string;
        const userId = req.userId!;
        console.log(`[DELETE] Request for session ${id} from user ${userId}`);

        try {
            await sessionService.softDeleteSession(id, userId);
            console.log(`[DELETE] Successfully deleted session ${id}`);
            res.json({ success: true });
        } catch (error: any) {
            console.error("Session deletion error:", error);
            if (error.code === 'P2025') {
                return res.status(404).json({ error: "세션을 찾을 수 없거나 권한이 없습니다." });
            }
            res.status(500).json({ error: "세션 삭제 실패" });
        }
    },
};
