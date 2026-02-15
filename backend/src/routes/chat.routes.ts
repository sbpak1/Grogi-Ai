import { Router, Request, Response } from "express";
import { z } from "zod/v4";
import { env } from "../lib/env";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middlewares/auth.middleware";

export const chatRouter = Router();

chatRouter.use(authMiddleware);

const chatBodySchema = z.object({
  session_id: z.string(),
  message: z.string().min(1),
});

// POST /api/chat — 메시지 전송 + AI 응답 SSE 스트리밍
chatRouter.post("/", async (req: Request, res: Response) => {
  const parsed = chatBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "INVALID_REQUEST" });
    return;
  }

  const { session_id, message } = parsed.data;

  try {
    // 1. 세션 조회 + 본인 확인
    const session = await prisma.session.findUnique({
      where: { id: session_id },
    });

    if (!session) {
      res.status(404).json({ error: "SESSION_NOT_FOUND" });
      return;
    }

    if (session.userId !== req.userId) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    // 2. 유저 메시지 DB 저장
    await prisma.message.create({
      data: { sessionId: session_id, role: "user", content: message },
    });

    // 3. 대화 히스토리 조회
    const history = await prisma.message.findMany({
      where: { sessionId: session_id },
      orderBy: { createdAt: "asc" },
      select: { role: true, content: true },
    });

    // 4. SSE 헤더 설정
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // 5. AI 서버 요청
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    let aiRes: globalThis.Response;
    try {
      aiRes = await fetch(`${env.AI_SERVER_URL}/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id,
          user_message: message,
          history: history.slice(0, -1), // 방금 저장한 유저 메시지 제외 (이미 user_message로 전달)
        }),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      clearTimeout(timeout);
      if (err instanceof Error && err.name === "AbortError") {
        res.write(`event: error\ndata: ${JSON.stringify({ code: "TIMEOUT", message: "AI 서버 응답 시간 초과" })}\n\n`);
      } else {
        res.write(`event: error\ndata: ${JSON.stringify({ code: "AI_UNREACHABLE", message: "AI 서버에 연결할 수 없습니다" })}\n\n`);
      }
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    if (!aiRes.ok || !aiRes.body) {
      clearTimeout(timeout);
      res.write(`event: error\ndata: ${JSON.stringify({ code: "AI_ERROR", message: "AI 서버 오류" })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    // 6. SSE 이벤트 파싱 + 릴레이
    let contentBuffer = "";
    let scoreBuffer: { total?: number; breakdown?: unknown; summary?: string } = {};
    let shareCardBuffer: { summary?: string; score?: number; actions?: unknown } | null = null;
    let isCrisis = false;

    const reader = aiRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        let currentEvent = "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith("data: ")) {
            const dataStr = line.slice(6);

            // 클라이언트에 relay
            if (currentEvent) {
              res.write(`event: ${currentEvent}\ndata: ${dataStr}\n\n`);
            } else {
              res.write(`data: ${dataStr}\n\n`);
            }

            // 버퍼링
            try {
              const data = JSON.parse(dataStr);
              switch (currentEvent) {
                case "token":
                  contentBuffer += data.content ?? "";
                  break;
                case "score":
                  scoreBuffer = { total: data.total, breakdown: data.breakdown, summary: data.summary };
                  break;
                case "share_card":
                  shareCardBuffer = { summary: data.summary, score: data.score, actions: data.actions };
                  break;
                case "crisis":
                  isCrisis = true;
                  contentBuffer = data.message ?? "";
                  break;
                case "done":
                  // DB 저장은 아래에서 처리
                  break;
              }
            } catch {
              // JSON 파싱 실패 시 무시 (token content가 plain text일 수도 있음)
              if (currentEvent === "token") {
                contentBuffer += dataStr;
              }
            }

            currentEvent = "";
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        res.write(`event: error\ndata: ${JSON.stringify({ code: "TIMEOUT", message: "AI 응답 시간 초과" })}\n\n`);
      }
    } finally {
      clearTimeout(timeout);
    }

    // 7. done → DB 트랜잭션 저장
    if (contentBuffer) {
      try {
        await prisma.$transaction(async (tx: any) => {
          const assistantMsg = await tx.message.create({
            data: {
              sessionId: session_id,
              role: "assistant",
              content: contentBuffer,
              realityScore: scoreBuffer.total ?? null,
              scoreBreakdown: scoreBuffer.breakdown ?? undefined,
            },
          });

          if (shareCardBuffer && !isCrisis) {
            await tx.shareCard.create({
              data: {
                messageId: assistantMsg.id,
                summary: shareCardBuffer.summary ?? "",
                score: shareCardBuffer.score ?? scoreBuffer.total ?? 0,
                actions: shareCardBuffer.actions ?? [],
              },
            });
          }
        });
      } catch (err) {
        console.error("AI 응답 DB 저장 실패:", err);
      }
    }

    // 프론트엔드 호환용 종료 시그널
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error("채팅 처리 실패:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "INTERNAL_ERROR" });
    } else {
      res.end();
    }
  }
});

// GET /api/chat/:sessionId — 대화 히스토리 조회
chatRouter.get("/:sessionId", async (req: Request, res: Response) => {
  const sessionId = req.params.sessionId as string;

  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      res.status(404).json({ error: "SESSION_NOT_FOUND" });
      return;
    }

    if (session.userId !== req.userId) {
      res.status(403).json({ error: "FORBIDDEN" });
      return;
    }

    const messages = await prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: "asc" },
    });

    res.json({
      session: { id: session.id },
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        reality_score: m.realityScore,
        score_breakdown: m.scoreBreakdown,
        createdAt: m.createdAt,
      })),
    });
  } catch (err) {
    console.error("히스토리 조회 실패:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});
