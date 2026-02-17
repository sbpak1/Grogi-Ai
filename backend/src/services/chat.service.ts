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
    async verifySessionOwner(sessionId: string, userId: string): Promise<boolean> {
        try {
            const session = await prisma.session.findUnique({
                where: { id: sessionId },
                select: { userId: true },
            });
            if (!session) return true; // 세션이 아직 없으면 생성 예정이므로 통과
            return session.userId === userId;
        } catch {
            return true; // DB 에러 시 fallback (mock 세션 모드)
        }
    },

    async ensureSessionForChat(sessionId: string, userId?: string, privateMode: boolean = false) {
        try {
            if (!userId) {
                throw new Error("인증된 사용자만 채팅할 수 있습니다");
            }

            const resolvedUserId = userId;

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
                    persist: !existing.privateMode, // privateMode가 true면 persist를 false로 설정
                } as ChatSessionContext;
            }

            // 부모 세션이 DB에 없는데 프라이빗 요청이면 DB 생성 없이 모크 세션 사용
            if (privateMode) {
                console.log(`[chatService] Bypassing DB for private session: ${sessionId}`);
                return toMockContext(getOrCreateMockSession(sessionId));
            }

            const created = await prisma.session.create({
                data: {
                    id: sessionId,
                    userId: resolvedUserId,
                    category: "etc",
                    level: "spicy",
                    privateMode: false, // 여기선 항상 false (프라이빗은 위에서 걸러짐)
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
                persist: !created.privateMode, // privateMode가 true면 persist를 false로 설정
            } as ChatSessionContext;
        } catch (error: any) {
            const unavailable = isPrismaUnavailableError(error);
            const userMissing = error.code === "P2003" && error.meta?.modelName === "Session";

            if (!unavailable && !userMissing) throw error;

            if (userMissing) {
                console.warn(`[chatService] User ${userId} not found in DB for session ${sessionId}. Falling back to non-persistent session mode.`);
            } else {
                console.warn("[chatService] DB unavailable. Falling back to non-persistent session mode.");
            }
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
            const message = await prisma.message.create({
                data: {
                    sessionId,
                    role,
                    content,
                    realityScore,
                    scoreBreakdown,
                },
            });

            // 첫 번째 사용자 메시지인 경우 세션 제목 업데이트 (LLM 기반)
            if (role === "user") {
                const messageCount = await prisma.message.count({ where: { sessionId } });
                if (messageCount === 1) {
                    // AI 서버에 제목 생성 요청
                    const aiBaseUrl = env.AI_SERVER_URL.replace(/\/+$/, "");
                    try {
                        const titleRes = await axios.post(`${aiBaseUrl}/agent/title`, { message: content });
                        const llmTitle = titleRes.data?.title;
                        if (llmTitle) {
                            await prisma.session.update({
                                where: { id: sessionId },
                                data: { title: llmTitle },
                            });
                        }
                    } catch (err) {
                        console.error("Failed to generate LLM title, falling back to slice:", err);
                        const fallbackTitle = content.length > 20 ? content.substring(0, 20) + "..." : content;
                        await prisma.session.update({
                            where: { id: sessionId },
                            data: { title: fallbackTitle },
                        }).catch(e => console.error("Fallback title update failed:", e));
                    }
                }
            }

            return message;
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
        userId?: string,
        pdfs?: Array<{ filename: string; content: string }>,
        privateMode: boolean = false
    ) {
        const session = (await this.ensureSessionForChat(sessionId, userId, privateMode)) as ChatSessionContext;
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
                pdfs,
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
