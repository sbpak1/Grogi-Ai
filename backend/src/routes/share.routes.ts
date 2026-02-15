import { Router, Request, Response } from "express";
import { z } from "zod/v4";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middlewares/auth.middleware";

export const shareRouter = Router();

const shareBodySchema = z.object({
  message_id: z.string(),
});

// POST /api/share — 공유 카드 조회 (인증 필요)
shareRouter.post("/", authMiddleware, async (req: Request, res: Response) => {
  const parsed = shareBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "INVALID_REQUEST" });
    return;
  }

  try {
    const card = await prisma.shareCard.findUnique({
      where: { messageId: parsed.data.message_id },
    });

    if (!card) {
      res.status(404).json({ error: "CARD_NOT_FOUND" });
      return;
    }

    res.json({
      summary: card.summary,
      score: card.score,
      actions: card.actions,
    });
  } catch (err) {
    console.error("공유 카드 조회 실패:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// GET /api/share/:id — 공유 카드 공개 조회 (인증 불필요)
shareRouter.get("/:id", async (req: Request, res: Response) => {
  const cardId = req.params.id as string;

  try {
    const card = await prisma.shareCard.findUnique({
      where: { id: cardId },
    });

    if (!card) {
      res.status(404).json({ error: "CARD_NOT_FOUND" });
      return;
    }

    res.json({
      summary: card.summary,
      score: card.score,
      actions: card.actions,
    });
  } catch (err) {
    console.error("공유 카드 조회 실패:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});
