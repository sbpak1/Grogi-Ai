import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod/v4";
import { env } from "../lib/env";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middlewares/auth.middleware";
import { isPrismaUnavailableError } from "../lib/prisma-errors";

export const authRouter = Router();

const kakaoBodySchema = z.object({
  code: z.string(),
  redirectUri: z.string().url().optional(),
});

// POST /api/auth/kakao — 카카오 인가 코드로 로그인
authRouter.post("/kakao", async (req: Request, res: Response) => {
  const parsed = kakaoBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "INVALID_REQUEST" });
    return;
  }

  const { code, redirectUri } = parsed.data;

  try {
    // 1. 카카오 토큰 교환
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.KAKAO_CLIENT_ID,
      client_secret: env.KAKAO_CLIENT_SECRET,
      redirect_uri: redirectUri || env.KAKAO_REDIRECT_URI,
      code,
    });

    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      console.error("카카오 토큰 교환 실패. 상태:", tokenRes.status, "응답:", errorText);
      res.status(401).json({ error: "INVALID_CODE" });
      return;
    }

    const tokenData = (await tokenRes.json()) as { access_token: string; refresh_token?: string };

    // 2. 카카오 사용자 정보 조회
    const userRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      const errorText = await userRes.text();
      console.error("카카오 유저 정보 조회 실패. 상태:", userRes.status, "응답:", errorText);
      res.status(401).json({ error: "KAKAO_USER_FETCH_FAILED" });
      return;
    }

    const kakaoUser = (await userRes.json()) as {
      id: number;
      properties?: { nickname?: string; profile_image?: string };
      kakao_account?: {
        email?: string;
        profile?: {
          nickname?: string;
          profile_image_url?: string;
          thumbnail_image_url?: string;
        }
      };
    };

    const kakaoId = String(kakaoUser.id);
    const nickname = kakaoUser.properties?.nickname ?? kakaoUser.kakao_account?.profile?.nickname ?? "사용자";

    // Check multiple locations for profile image
    const profileImage =
      kakaoUser.properties?.profile_image ??
      kakaoUser.kakao_account?.profile?.profile_image_url ??
      kakaoUser.kakao_account?.profile?.thumbnail_image_url;

    const email = kakaoUser.kakao_account?.email;

    // 3. DB upsert (있으면 정보 업데이트, 없으면 생성)
    const user = await prisma.user.upsert({
      where: { kakaoId },
      update: {
        nickname,
        profileImage,
        email,
        kakaoAccessToken: tokenData.access_token,
        kakaoRefreshToken: tokenData.refresh_token
      },
      create: {
        kakaoId,
        nickname,
        profileImage,
        email,
        kakaoAccessToken: tokenData.access_token,
        kakaoRefreshToken: tokenData.refresh_token
      },
    });

    // 4. JWT 발급 (24시간)
    const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "24h",
      issuer: "grogi-api",
      audience: "grogi-frontend",
    });

    res.json({
      token,
      user: { id: user.id, kakao_id: user.kakaoId, nickname: user.nickname, profile_image: user.profileImage, email: user.email },
    });
  } catch (err) {
    console.error("카카오 로그인 치명적 실패:", err);
    res.status(500).json({ error: "AUTH_FAILED" });
  }
});

// GET /api/auth/me — 내 정보 조회
authRouter.get("/me", authMiddleware, async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
    });

    if (!user) {
      res.status(404).json({ error: "USER_NOT_FOUND" });
      return;
    }

    res.json({
      id: user.id,
      nickname: user.nickname,
      email: user.email,
      profileImage: user.profileImage,
      createdAt: user.createdAt,
      fontSize: user.fontSize,
      tGauge: user.tGauge,
      expertise: user.expertise,
      responseStyle: user.responseStyle,
      privateMode: user.privateMode,
    });
  } catch (err) {
    console.error("유저 조회 실패:", err);
    res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});
// PATCH /api/auth/profile — 내 정보 업데이트
authRouter.patch("/profile", authMiddleware, async (req: Request, res: Response) => {
  const profileSchema = z.object({
    nickname: z.string().optional(),
    profileImage: z.string().url().optional().or(z.literal("")),
    email: z.string().email().optional().or(z.literal("")),
  });

  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "INVALID_REQUEST", details: parsed.error });
    return;
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: parsed.data,
    });

    res.json({
      id: user.id,
      nickname: user.nickname,
      email: user.email,
      profileImage: user.profileImage,
    });
  } catch (err) {
    console.error("프로필 업데이트 실패:", err);
    res.status(500).json({ error: "UPDATE_FAILED" });
  }
});

// PATCH /api/auth/settings — 내 설정 업데이트
authRouter.patch("/settings", authMiddleware, async (req: Request, res: Response) => {
  const settingsSchema = z.object({
    fontSize: z.enum(["small", "medium", "large"]).optional(),
    tGauge: z.enum(["mild", "spicy", "hell"]).optional(),
    expertise: z.enum(["career", "love", "finance", "self", "etc"]).optional(),
    responseStyle: z.enum(["short", "long"]).optional(),
    privateMode: z.boolean().optional(),
  });

  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "INVALID_REQUEST", details: parsed.error });
    return;
  }

  try {
    const user = await prisma.user.update({
      where: { id: req.userId },
      data: parsed.data,
    });

    res.json({
      fontSize: user.fontSize,
      tGauge: user.tGauge,
      expertise: user.expertise,
      responseStyle: user.responseStyle,
      privateMode: user.privateMode,
    });
  } catch (err) {
    console.error("설정 업데이트 실패:", err);
    res.status(500).json({ error: "SETTINGS_UPDATE_FAILED" });
  }
});

// POST /api/auth/dev-login — 개발용 즉시 로그인 (인가 코드 불필요)
authRouter.post("/dev-login", async (_req: Request, res: Response) => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ error: "NOT_FOUND" });
    return;
  }

  try {
    const kakaoId = "dev-local-user";
    const nickname = "테스트 유저";

    let userId = "dev-user-id";

    try {
      const user = await prisma.user.upsert({
        where: { kakaoId },
        update: { nickname },
        create: { kakaoId, nickname },
      });
      userId = user.id;
    } catch (dbErr) {
      if (!isPrismaUnavailableError(dbErr)) throw dbErr;
      console.warn("[dev-login] DB unavailable. Using mock userId.");
    }

    const token = jwt.sign({ userId }, env.JWT_SECRET, {
      algorithm: "HS256",
      expiresIn: "24h",
      issuer: "grogi-api",
      audience: "grogi-frontend",
    });

    res.json({
      token,
      user: { id: userId, kakao_id: kakaoId, nickname: nickname },
    });
  } catch (err) {
    console.error("개발 로그인 실패:", err);
    res.status(500).json({ error: "DEV_AUTH_FAILED" });
  }
});

// DELETE /api/auth/withdrawal — 회원 탈퇴
authRouter.delete("/withdrawal", authMiddleware, async (req: Request, res: Response) => {
  try {
    // 세션, 메시지 등은 DB 수준에서 CASCADE 설정이 되어 있다면 자동으로 삭제됩니다.
    // Prisma schema에서 User-Session-Message 관계에 따로 onDelete: Cascade를 설정하지 않았다면 명시적 삭제가 필요할 수 있습니다.
    // 현재 스키마 확인 결과 @relation(fields, references)만 있고 onDelete 설정이 누락되어 있을 수 있으므로 연쇄 삭제를 수행합니다.

    // 1. 세션 조회 (메시지도 함께 삭제하기 위함)
    const sessions = await prisma.session.findMany({
      where: { userId: req.userId },
      select: { id: true }
    });
    const sessionIds = sessions.map(s => s.id);

    // 2. 연관 데이터 삭제 (Prisma transaction)
    await prisma.$transaction([
      // 메시지의 공유 카드 삭제
      prisma.shareCard.deleteMany({
        where: { message: { sessionId: { in: sessionIds } } }
      }),
      // 메시지 삭제
      prisma.message.deleteMany({
        where: { sessionId: { in: sessionIds } }
      }),
      // 세션 삭제
      prisma.session.deleteMany({
        where: { userId: req.userId }
      }),
      // 사용자 삭제
      prisma.user.delete({
        where: { id: req.userId }
      })
    ]);

    res.json({ success: true, message: "ACCOUNT_WITHDRAWAL_SUCCESS" });
  } catch (err) {
    console.error("회원 탈퇴 실패:", err);
    res.status(500).json({ error: "WITHDRAWAL_FAILED" });
  }
});
