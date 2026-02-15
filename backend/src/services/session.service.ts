import { prisma } from "../lib/prisma";

function isPrismaUnavailableError(error: any) {
    if (!error) return false;
    const code = String(error.code || "");
    const message = String(error.message || "");
    return (
        code === "P2021" ||
        code === "P1001" ||
        code === "ECONNREFUSED" ||
        message.includes("does not exist") ||
        message.includes("ECONNREFUSED")
    );
}

export const sessionService = {
    async createSession(userId: string) {
        const data = {
            userId,
            category: "etc",
            level: "spicy",
        };
        try {
            return await prisma.session.create({ data });
        } catch (error) {
            if (!isPrismaUnavailableError(error)) throw error;
            console.warn("[sessionService] DB unavailable. Using mock session.");
            return {
                id: `mock-session-${Date.now()}`,
                ...data,
                createdAt: new Date(),
            };
        }
    },

    async getSession(sessionId: string, userId: string) {
        try {
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
        } catch (error) {
            if (!isPrismaUnavailableError(error)) throw error;
            return {
                id: sessionId,
                userId,
                category: "etc",
                level: "spicy",
                messages: [],
                createdAt: new Date(),
            };
        }
    },

    async getUserSessions(userId: string) {
        try {
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
        } catch (error) {
            if (!isPrismaUnavailableError(error)) throw error;
            return [];
        }
    },
};
