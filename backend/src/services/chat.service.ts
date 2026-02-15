import axios from "axios";
import { prisma } from "../lib/prisma";
import { env } from "../lib/env";

type ChatSessionContext = {
    id: string;
    category: string;
    level: string;
    messages: Array<{ role: string; content: string }>;
    persist: boolean;
};

type MockStoredMessage = {
    id: string;
    sessionId: string;
    role: string;
    content: string;
    realityScore?: number;
    scoreBreakdown?: any;
    createdAt: Date;
};

type MockStoredSession = {
    id: string;
    category: string;
    level: string;
    messages: MockStoredMessage[];
};

const mockSessionStore = new Map<string, MockStoredSession>();

function getOrCreateMockSession(sessionId: string): MockStoredSession {
    const existing = mockSessionStore.get(sessionId);
    if (existing) return existing;

    const created: MockStoredSession = {
        id: sessionId,
        category: "etc",
        level: "spicy",
        messages: [],
    };
    mockSessionStore.set(sessionId, created);
    return created;
}

function toMockContext(session: MockStoredSession): ChatSessionContext {
    return {
        id: session.id,
        category: session.category,
        level: session.level,
        messages: session.messages.map((m) => ({ role: m.role, content: m.content })),
        persist: false,
    };
}

function appendMockMessage(
    sessionId: string,
    role: string,
    content: string,
    realityScore?: number,
    scoreBreakdown?: any
): MockStoredMessage {
    const session = getOrCreateMockSession(sessionId);
    const msg: MockStoredMessage = {
        id: `mock-msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        sessionId,
        role,
        content,
        realityScore,
        scoreBreakdown,
        createdAt: new Date(),
    };
    session.messages.push(msg);

    // 메모리 사용량 제한: 최근 60개 메시지만 유지
    if (session.messages.length > 60) {
        session.messages.splice(0, session.messages.length - 60);
    }

    return msg;
}

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

function isMessageSessionForeignKeyError(error: any) {
    if (!error) return false;
    const code = String(error.code || "");
    const modelName = String(error.meta?.modelName || "");
    const message = String(error.message || "");
    const constraint = String(error.meta?.constraint || "");

    return (
        code === "P2003" &&
        modelName === "Message" &&
        (constraint.includes("messages_session_id_fkey") ||
            message.includes("messages_session_id_fkey") ||
            message.includes("Foreign key constraint violated"))
    );
}

export const chatService = {
    async ensureSessionForChat(sessionId: string, userId?: string) {
        try {
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

            if (existing) {
                return {
                    id: existing.id,
                    category: existing.category || "etc",
                    level: existing.level || "spicy",
                    messages: existing.messages.map((m) => ({ role: m.role, content: m.content })),
                    persist: true,
                } as ChatSessionContext;
            }

            const created = await prisma.session.create({
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

            return {
                id: created.id,
                category: created.category || "etc",
                level: created.level || "spicy",
                messages: [],
                persist: true,
            } as ChatSessionContext;
        } catch (error: any) {
            if (!isPrismaUnavailableError(error)) throw error;
            console.warn("[chatService] DB unavailable. Falling back to non-persistent session mode.");
            return toMockContext(getOrCreateMockSession(sessionId));
        }
    },

    async getChatHistory(sessionId: string) {
        try {
            return await prisma.message.findMany({
                where: { sessionId },
                orderBy: { createdAt: "asc" },
            });
        } catch (error: any) {
            if (!isPrismaUnavailableError(error)) throw error;
            return getOrCreateMockSession(sessionId).messages.map((m) => ({
                id: m.id,
                sessionId: m.sessionId,
                role: m.role,
                content: m.content,
                realityScore: m.realityScore,
                scoreBreakdown: m.scoreBreakdown,
                createdAt: m.createdAt,
            }));
        }
    },

    async saveMessage(sessionId: string, role: string, content: string, realityScore?: number, scoreBreakdown?: any) {
        try {
            return await prisma.message.create({
                data: {
                    sessionId,
                    role,
                    content,
                    realityScore,
                    scoreBreakdown,
                },
            });
        } catch (error: any) {
            if (isMessageSessionForeignKeyError(error)) {
                console.warn(`[chatService] Session ${sessionId} is not persisted. Saving message to in-memory fallback.`);
                return appendMockMessage(sessionId, role, content, realityScore, scoreBreakdown);
            }
            if (!isPrismaUnavailableError(error)) throw error;
            return appendMockMessage(sessionId, role, content, realityScore, scoreBreakdown);
        }
    },

    async getAiResponseStream(
        sessionId: string,
        userMessage: string,
        images?: string[],
        ocr_text?: string,
        userId?: string
    ) {
        const session = (await this.ensureSessionForChat(sessionId, userId)) as ChatSessionContext;
        const aiBaseUrl = env.AI_SERVER_URL.replace(/\/+$/, "");

        const history = session.messages.map((m) => ({
            role: m.role,
            content: m.content,
        }));

        const response = await axios.post(
            `${aiBaseUrl}/agent/chat`,
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
        try {
            return await prisma.shareCard.create({
                data: {
                    messageId,
                    summary,
                    score,
                    actions,
                },
            });
        } catch (error: any) {
            if (!isPrismaUnavailableError(error)) throw error;
            return null;
        }
    },
};
