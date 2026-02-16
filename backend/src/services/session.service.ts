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

function isUserNotFoundError(error: any) {
    if (!error) return false;
    const code = String(error.code || "");
    const message = String(error.message || "");
    return (
        code === "P2003" &&
        (message.includes("user_id") || message.includes("ForeignKeyConstraintViolation"))
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
            const unavailable = isPrismaUnavailableError(error);
            const userMissing = isUserNotFoundError(error);

            if (!unavailable && !userMissing) throw error;

            if (userMissing) {
                console.error(`[sessionService] User ${userId} not found in DB.`);
            } else {
                console.error("[sessionService] DB unavailable.");
            }
            throw error;
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
