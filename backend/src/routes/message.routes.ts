import { Router, Request, Response } from "express";
import { z } from "zod/v4";
import { authMiddleware } from "../middlewares/auth.middleware";
import { prisma } from "../lib/prisma";

export const messageRouter = Router();

// 메시지 전송 요청 스키마
const sendMessageSchema = z.object({
    text: z.string(),
});

// POST /api/message/send (나에게 보내기)
messageRouter.post("/send", authMiddleware, async (req: Request, res: Response) => {
    const parsed = sendMessageSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "INVALID_REQUEST", details: parsed.error });
        return;
    }

    const { text } = parsed.data;

    try {
        const user = await prisma.user.findUnique({ where: { id: req.userId } });
        if (!user || !user.kakaoAccessToken) {
            res.status(401).json({ error: "KAKAO_TOKEN_MISSING" });
            return;
        }

        // Kakao Message: Send to Me
        // POST /v2/api/talk/memo/default/send
        const templateObject = {
            object_type: "text",
            text: text,
            link: {
                web_url: "https://grogi.store",
                mobile_web_url: "https://grogi.store" // 필수 필드
            },
            button_title: "Grogi에서 확인"
        };

        const body = new URLSearchParams();
        body.append("template_object", JSON.stringify(templateObject));

        const response = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${user.kakaoAccessToken}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body,
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("카카오 메시지 API 에러:", errorData);
            // 토큰 만료 처리 등은 calendar와 동일하게 해야 하지만, 여기서는 간단히 에러 반환
            // (실제 프로덕션에서는 토큰 갱신 로직을 공통 함수로 빼는 게 좋음)
            res.status(response.status).json({ error: "KAKAO_API_ERROR", details: errorData });
            return;
        }

        res.json({ success: true });

    } catch (err) {
        console.error("메시지 전송 실패:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});
