import axios from "axios";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";

export const chatService = {
    async getChatHistory(sessionId: string) {
        return await prisma.message.findMany({
            where: { sessionId },
            orderBy: { createdAt: "asc" },
        });
    },

    async saveMessage(sessionId: string, role: string, content: string, realityScore?: number, scoreBreakdown?: any) {
        return await prisma.message.create({
            data: {
                sessionId,
                role,
                content,
                realityScore,
                scoreBreakdown,
            },
        });
    },

    async getAiResponseStream(sessionId: string, userMessage: string, images?: string[], ocr_text?: string) {
        const session = await prisma.session.findUnique({
            where: { id: sessionId },
            include: {
                messages: {
                    orderBy: { createdAt: "asc" },
                    take: 20, // 최근 20개만
                }
            }
        });

        if (!session) throw new Error("Session not found");

        const history = session.messages.map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content
        }));

        // AI 서버에 요청 (SSE 스트리밍)
        const response = await axios.post(
            `${env.AI_SERVER_URL}/agent/chat`,
            {
                session_id: sessionId,
                user_message: userMessage,
                level: session.level,
                category: session.category,
                history: history,
                images: images,
                ocr_text: ocr_text,
            },
            {
                responseType: "stream",
            }
        );

        return response.data;
    },

    async saveShareCard(messageId: string, summary: string, score: number, actions: any) {
        return await prisma.shareCard.create({
            data: {
                messageId,
                summary,
                score,
                actions,
            },
        });
    }
};
