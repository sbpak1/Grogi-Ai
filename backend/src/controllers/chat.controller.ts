import { Request, Response } from "express";
import crypto from "crypto";
import { chatService } from "../services/chat.service";

export const chatController = {
    async send(req: Request, res: Response) {
        const { sessionId, message, messageId, images, ocr_text, pdfs, privateMode } = req.body;

        if (images && images.length > 5) {
            res.status(400).json({ error: "이미지는 최대 5장까지 가능합니다" });
            return;
        }
        if (pdfs && pdfs.length > 3) {
            res.status(400).json({ error: "PDF는 최대 3개까지 가능합니다" });
            return;
        }
        if (pdfs) {
            for (const pdf of pdfs) {
                if (pdf.content && pdf.content.length > 14 * 1024 * 1024) {
                    res.status(400).json({ error: "PDF 파일은 10MB 이하만 가능합니다" });
                    return;
                }
            }
        }
        if (message && message.length > 5000) {
            res.status(400).json({ error: "메시지는 5000자 이하만 가능합니다" });
            return;
        }

        const resolvedSessionId =
            typeof sessionId === "string" && sessionId.trim()
                ? sessionId.trim()
                : crypto.randomUUID();

        // 1. Idempotency Check (Early Return)
        // If messageId is provided, check if it already exists in DB.
        // If it exists, we assume it's a duplicate request (retry) and we should stop.
        // For a full implementation, we might want to return the previous response, but for now, 
        // we'll just prevent reprocessing and return a 200 OK or specific code.
        // However, since this is an SSE stream, we can't easily "replay" the stream. 
        // We will log it and proceed with caution, or if it's strictly a duplicate send, we stop.
        if (messageId) {
            const existing = await chatService.getMessageById(messageId);
            if (existing) {
                console.log(`[chatController] Idempotency check: Message ${messageId} already exists. Returning 200 OK to stop retry.`);
                // Client likely retried, but we already have it. 
                // We can either ignore (and let client receive nothing but success) or send a specific event.
                // For now, let's just end the response to stop further processing.
                res.status(200).json({ message: "Already processed" });
                return;
            }
        }

        try {
            const context = await chatService.ensureSessionForChat(resolvedSessionId, req.userId, !!privateMode);
            if (context.persist) {
                await chatService.saveMessage(resolvedSessionId, "user", message, undefined, undefined, messageId);
            }

            const stream = await chatService.getAiResponseStream(
                resolvedSessionId,
                message,
                images,
                ocr_text,
                req.userId,
                pdfs,
                !!privateMode
            );

            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");
            let fullAssistantMessage = "";
            let realityScore: any = null;
            let shareCard: any = null;
            let doneSentByUpstream = false;

            stream.on("data", (chunk: Buffer) => {
                const lines = chunk.toString().split("\n");
                for (const line of lines) {
                    if (!line.startsWith("data: ")) continue;
                    const dataStr = line.replace("data: ", "").trim();
                    if (!dataStr) continue;
                    if (dataStr === "[DONE]") {
                        doneSentByUpstream = true;
                        continue;
                    }

                    try {
                        const parsed = JSON.parse(dataStr);
                        if (parsed.content) fullAssistantMessage += parsed.content;
                        if (parsed.reality_score) realityScore = parsed.reality_score;
                        if (parsed.share_card) shareCard = parsed.share_card;
                        if (
                            typeof parsed.code === "string" &&
                            parsed.code.toUpperCase().includes("ERROR") &&
                            typeof parsed.message === "string"
                        ) {
                            console.error(`[chatController] Upstream AI error (${parsed.code}): ${parsed.message}`);
                        }
                    } catch {
                        // ignore non-JSON events
                    }
                }
            });

            stream.pipe(res, { end: false });

            stream.on("end", async () => {
                try {
                    if (fullAssistantMessage && context.persist) {
                        const savedMsg = await chatService.saveMessage(
                            resolvedSessionId,
                            "assistant",
                            fullAssistantMessage,
                            realityScore?.total || 0,
                            realityScore
                        );

                        if (shareCard && savedMsg?.id) {
                            await chatService.saveShareCard(
                                savedMsg.id,
                                shareCard.summary,
                                shareCard.score,
                                shareCard.actions
                            );
                        }
                    }
                } catch (persistError) {
                    console.error("Chat persistence error:", persistError);
                }

                if (!doneSentByUpstream) {
                    res.write("data: [DONE]\n\n");
                }
                res.end();
            });

            stream.on("error", (err: any) => {
                console.error("AI Stream Error:", err);
                res.write(`data: ${JSON.stringify({ error: "AI stream error" })}\n\n`);
                if (!doneSentByUpstream) {
                    res.write("data: [DONE]\n\n");
                }
                res.end();
            });

            req.on("close", () => {
                if (!res.writableEnded) {
                    stream.destroy();
                }
            });
        } catch (error: any) {
            console.error("Chat Controller Error:", error);
            res.status(500).json({ error: "메시지 전송에 실패했습니다" });
        }
    },

    async getHistory(req: Request, res: Response) {
        const sessionId = req.params.sessionId as string;
        try {
            const isOwner = await chatService.verifySessionOwner(sessionId, req.userId!);
            if (!isOwner) {
                res.status(403).json({ error: "해당 세션에 접근 권한이 없습니다" });
                return;
            }
            const messages = await chatService.getChatHistory(sessionId);
            res.json({ messages });
        } catch {
            res.status(500).json({ error: "history fetch failed" });
        }
    },
};
