import axios from "axios";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";

export const chatService = {
    async ensureSessionForChat(sessionId: string, userId?: string) {
        let resolvedUserId = userId;

        if (!resolvedUserId) {
            const devUser = await prisma.user.upsert({
                where: { kakaoId: "dev-local-user" },
                update: {},
                create: {
                    kakaoId: "dev-local-user",
                    nickname: "Dev User",
                },
            });
            resolvedUserId = devUser.id;
        }

        const existing = await prisma.session.findUnique({
            where: { id: sessionId },
            include: {
                messages: {
                    orderBy: { createdAt: "asc" },
                    take: 20,
                },
            },
        });

        if (existing) return existing;

        return await prisma.session.create({
            data: {
                id: sessionId,
                userId: resolvedUserId,
                category: "etc",
                level: "spicy",
            },
            include: {
                messages: {
                    orderBy: { createdAt: "asc" },
                    take: 20,
                },
            },
        });
    },

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

    async getAiResponseStream(
        sessionId: string,
        userMessage: string,
        images?: string[],
        ocr_text?: string,
        userId?: string
    ) {
        const session = await this.ensureSessionForChat(sessionId, userId);

        const history = session.messages.map((m: { role: string; content: string }) => ({
            role: m.role,
            content: m.content,
        }));

        const response = await axios.post(
            `${env.AI_SERVER_URL}/agent/chat`,
            {
                session_id: sessionId,
                user_message: userMessage,
                level: session.level,
                category: session.category,
                history,
                images,
                ocr_text,
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
    },
};
