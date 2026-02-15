import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middlewares/auth.middleware";

export const sessionRouter = Router();

sessionRouter.use(authMiddleware);

// POST /api/sessions — 새 세션 생성 (파라미터 없음)
sessionRouter.post("/", async (req: Request, res: Response) => {
  try {
    const session = await prisma.session.create({
      data: { userId: req.userId! },
    });

    res.json({ session_id: session.id });
  } catch (err) {
    console.error("세션 생성 실패:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// GET /api/sessions — 내 세션 목록 (최신순)
sessionRouter.get("/", async (req: Request, res: Response) => {
  try {
    const sessions = await prisma.session.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: "desc" },
    });

    const result = await Promise.all(
      sessions.map(async (s) => {
        const lastMessage = await prisma.message.findFirst({
          where: { sessionId: s.id },
          orderBy: { createdAt: "desc" },
          select: { content: true, role: true, createdAt: true },
        });
        return {
          id: s.id,
          createdAt: s.createdAt,
          lastMessage: lastMessage ?? null,
        };
      })
    );

    res.json(result);
  } catch (err) {
    console.error("세션 목록 조회 실패:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// GET /api/sessions/:id — 세션 상세 + 메시지 히스토리
sessionRouter.get("/:id", async (req: Request, res: Response) => {
  const sessionId = req.params.id as string;

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
      session: { id: session.id, createdAt: session.createdAt },
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
    console.error("세션 상세 조회 실패:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});
