import { Request, Response } from "express";
import { chatService } from "../services/chat.service";

export const chatController = {
    async send(req: Request, res: Response) {
        const { sessionId, message, images, ocr_text } = req.body;

        try {
            // 1. 사용자 메시지 저장
            await chatService.saveMessage(sessionId, "user", message);

            // 2. AI 서버 스트림 가져오기
            const stream = await chatService.getAiResponseStream(sessionId, message, images, ocr_text);

            // 3. SSE 설정
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
                            // 토큰 조합
                            if (parsed.content) {
                                fullAssistantMessage += parsed.content;
                            }
                            // 점수 및 카드 데이터 캡처
                            if (parsed.reality_score) realityScore = parsed.reality_score;
                            if (parsed.share_card) shareCard = parsed.share_card;
                        } catch (e) {
                            // Not JSON (e.g. status events) or partial JSON
                        }

                        // 프론트엔드로 그대로 전달 (SSE 형식 유지)
                        res.write(line + "\n\n");
                    } else if (line.trim()) {
                        res.write(line + "\n\n");
                    }
                }
            });

            stream.on("end", async () => {
                // 4. AI 응답 최종 저장
                if (fullAssistantMessage) {
                    const savedMsg = await chatService.saveMessage(
                        sessionId,
                        "assistant",
                        fullAssistantMessage,
                        realityScore?.total || 0,
                        realityScore
                    );

                    // 공유 카드 저장
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
                res.write(`data: ${JSON.stringify({ error: "AI 서버 연동 에러" })}\n\n`);
                res.end();
            });

        } catch (error: any) {
            console.error("Chat Controller Error:", error);
            res.status(500).json({ error: error.message || "메시지 전송 실패" });
        }
    },

    async getHistory(req: Request, res: Response) {
        const sessionId = req.params.sessionId as string;
        try {
            const messages = await chatService.getChatHistory(sessionId);
            res.json({ messages });
        } catch (error) {
            res.status(500).json({ error: "히스토리 조회 실패" });
        }
    }
};
