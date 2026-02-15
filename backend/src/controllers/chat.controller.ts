import { Request, Response } from "express";
import { chatService } from "../services/chat.service";

export const chatController = {
    async send(req: Request, res: Response) {
        const { sessionId, message, images, ocr_text } = req.body;
        const resolvedSessionId =
            typeof sessionId === "string" && sessionId.trim()
                ? sessionId.trim()
                : `dev-${Date.now()}`;

        try {
            await chatService.ensureSessionForChat(resolvedSessionId, req.userId);
            await chatService.saveMessage(resolvedSessionId, "user", message);

            const stream = await chatService.getAiResponseStream(
                resolvedSessionId,
                message,
                images,
                ocr_text,
                req.userId
            );

            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");

            let fullAssistantMessage = "";
            let realityScore: any = null;
            let shareCard: any = null;

            stream.on("data", (chunk: Buffer) => {
                const lines = chunk.toString().split("\n");
                for (const line of lines) {
                    if (line.startsWith("data: ")) {
                        const dataStr = line.replace("data: ", "").trim();
                        if (!dataStr) continue;

                        try {
                            const parsed = JSON.parse(dataStr);
                            if (parsed.content) fullAssistantMessage += parsed.content;
                            if (parsed.reality_score) realityScore = parsed.reality_score;
                            if (parsed.share_card) shareCard = parsed.share_card;
                        } catch {
                            // ignore non-JSON status events
                        }

                        res.write(line + "\n\n");
                    } else if (line.trim()) {
                        res.write(line + "\n\n");
                    }
                }
            });

            stream.on("end", async () => {
                if (fullAssistantMessage) {
                    const savedMsg = await chatService.saveMessage(
                        resolvedSessionId,
                        "assistant",
                        fullAssistantMessage,
                        realityScore?.total || 0,
                        realityScore
                    );

                    if (shareCard) {
                        await chatService.saveShareCard(
                            savedMsg.id,
                            shareCard.summary,
                            shareCard.score,
                            shareCard.actions
                        );
                    }
                }
                res.write("data: [DONE]\n\n");
                res.end();
            });

            stream.on("error", (err: any) => {
                console.error("AI Stream Error:", err);
                res.write(`data: ${JSON.stringify({ error: "AI stream error" })}\n\n`);
                res.end();
            });
        } catch (error: any) {
            console.error("Chat Controller Error:", error);
            res.status(500).json({ error: error.message || "message send failed" });
        }
    },

    async getHistory(req: Request, res: Response) {
        const sessionId = req.params.sessionId as string;
        try {
            const messages = await chatService.getChatHistory(sessionId);
            res.json({ messages });
        } catch {
            res.status(500).json({ error: "history fetch failed" });
        }
    },
};
