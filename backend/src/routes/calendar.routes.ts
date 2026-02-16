import { Router, Request, Response } from "express";
import { z } from "zod/v4";
import { env } from "../lib/env";
import { authMiddleware } from "../middlewares/auth.middleware";
import { prisma } from "../lib/prisma";

export const calendarRouter = Router();

// 일정 생성 요청 스키마
const createEventSchema = z.object({
    title: z.string(),
    description: z.string().optional(),
    startAt: z.string(), // ISO 8601 format (e.g. "2023-10-27T10:00:00Z")
    endAt: z.string(),
});

// POST /api/calendar/events
calendarRouter.post("/events", authMiddleware, async (req: Request, res: Response) => {
    const parsed = createEventSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: "INVALID_REQUEST", details: parsed.error });
        return;
    }

    const { title, description, startAt, endAt } = parsed.data;

    try {
        const user = await prisma.user.findUnique({ where: { id: req.userId } });

        if (!user || !user.kakaoAccessToken) {
            res.status(401).json({ error: "KAKAO_TOKEN_MISSING" });
            return;
        }

        let accessToken = user.kakaoAccessToken;

        // 1. 일정 전송 시도
        let response = await sendCalendarEvent(accessToken, { title, description, startAt, endAt });

        // 2. 토큰 만료 에러 발생 시 (401)
        if (response.status === 401 && user.kakaoRefreshToken) {
            console.log("카카오 토큰 만료. 갱신 시도...");
            const newTokens = await refreshKakaoToken(user.kakaoRefreshToken);

            if (newTokens) {
                // DB 업데이트
                await prisma.user.update({
                    where: { id: user.id },
                    data: {
                        kakaoAccessToken: newTokens.access_token,
                        kakaoRefreshToken: newTokens.refresh_token || user.kakaoRefreshToken, // refresh token은 갱신 안 될 수도 있음
                    },
                });

                accessToken = newTokens.access_token;
                // 재시도
                response = await sendCalendarEvent(accessToken, { title, description, startAt, endAt });
            } else {
                res.status(401).json({ error: "KAKAO_TOKEN_REFRESH_FAILED" });
                return;
            }
        }

        if (!response.ok) {
            const errorData = await response.json();
            console.error("카카오 캘린더 API 에러:", errorData);
            res.status(response.status).json({ error: "KAKAO_API_ERROR", details: errorData });
            return;
        }

        const data = await response.json();
        res.json({ success: true, data });

    } catch (err) {
        console.error("캘린더 일정 생성 실패:", err);
        res.status(500).json({ error: "INTERNAL_ERROR" });
    }
});

async function sendCalendarEvent(accessToken: string, event: { title: string, description?: string, startAt: string, endAt: string }) {
    // Kakao Talk Calendar: Create Event (Default)
    // POST /v2/api/calendar/create/default
    // Content-Type: application/x-www-form-urlencoded

    // 시간 형식 변환: ISO 8601 -> "yyyy-MM-dd HH:mm:ss" (KST 기준 필요할 수 있음)
    // 카카오 문서는 RFC3339 등을 지원하지만, 여기서는 ISO 문자열 그대로 보냄 (카카오가 알아서 처리해주길 기대하거나 변환 필요)
    // 확인: 카카오 톡캘린더 API는 'time_type'에 따라 포맷이 다름.
    // 여기서는 간단히 title을 'event' 파라미터(JSON string)로 보냄.

    const eventData = {
        title: event.title,
        time: {
            start_at: event.startAt,
            end_at: event.endAt,
            time_zone: "Asia/Seoul",
            all_day: false,
        },
        description: event.description || "",
        reminders: [15, 60], // 15분 전, 1시간 전 알림
        color: "RED",
    };

    const body = new URLSearchParams();
    body.append("calendar_id", "primary");
    body.append("event", JSON.stringify(eventData));

    return fetch("https://kapi.kakao.com/v2/api/calendar/create/event", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: body,
    });
}

async function refreshKakaoToken(refreshToken: string) {
    try {
        const res = await fetch("https://kauth.kakao.com/oauth/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "refresh_token",
                client_id: env.KAKAO_CLIENT_ID,
                client_secret: env.KAKAO_CLIENT_SECRET,
                refresh_token: refreshToken,
            }),
        });

        if (!res.ok) return null;
        return (await res.json()) as { access_token: string; refresh_token?: string };
    } catch (e) {
        console.error("토큰 갱신 중 에러:", e);
        return null;
    }
}
