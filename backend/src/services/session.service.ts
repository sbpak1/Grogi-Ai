import { prisma } from "../lib/prisma";

export const sessionService = {
    async createSession(userId: string, category: string, level: string) {
        return await prisma.session.create({
            data: {
                userId,
                category,
                level,
            },
        });
    },

    async getSession(sessionId: string, userId: string) {
        return await prisma.session.findFirst({
            where: {
                id: sessionId,
                userId,
            },
            include: {
                messages: {
                    orderBy: { createdAt: "asc" },
                },
            },
        });
    },

    async getUserSessions(userId: string) {
        return await prisma.session.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" },
            include: {
                messages: {
                    take: 1,
                    orderBy: { createdAt: "desc" },
                },
            },
        });
    },
};
