import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod/v4";
import { env } from "../lib/env";
import { prisma } from "../lib/prisma";
import { authMiddleware } from "../middlewares/auth.middleware";

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

export const authRouter = Router();

const kakaoBodySchema = z.object({
  code: z.string(),
});

// POST /api/auth/kakao — 카카오 인가 코드로 로그인
authRouter.post("/kakao", async (req: Request, res: Response) => {
  const parsed = kakaoBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "INVALID_REQUEST" });
    return;
  }

  const { code } = parsed.data;

  try {
    // 1. 카카오 토큰 교환
    console.log("카카오 토큰 교환 시작. code:", code);
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      client_id: env.KAKAO_CLIENT_ID,
      client_secret: env.KAKAO_CLIENT_SECRET,
      redirect_uri: env.KAKAO_REDIRECT_URI,
      code,
    });
    console.log("토큰 요청 파라미터:", params.toString());

    const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });

    if (!tokenRes.ok) {
      const errorText = await tokenRes.text();
      console.error("카카오 토큰 교환 실패. 상태:", tokenRes.status, "응답:", errorText);
      res.status(401).json({ error: "INVALID_CODE", details: errorText });
      return;
    }

    const tokenData = (await tokenRes.json()) as { access_token: string; refresh_token?: string };
    console.log("카카오 토큰 데이터 수신 완료.");

    // 2. 카카오 사용자 정보 조회
    const userRes = await fetch("https://kapi.kakao.com/v2/user/me", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userRes.ok) {
      const errorText = await userRes.text();
      console.error("카카오 유저 정보 조회 실패. 상태:", userRes.status, "응답:", errorText);
      res.status(401).json({ error: "KAKAO_USER_FETCH_FAILED", details: errorText });
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
    console.log("카카오 유저 데이터 수신:", JSON.stringify(kakaoUser));

    const kakaoId = String(kakaoUser.id);
    const nickname = kakaoUser.properties?.nickname ?? kakaoUser.kakao_account?.profile?.nickname ?? "사용자";

    // Check multiple locations for profile image
    const profileImage =
      kakaoUser.properties?.profile_image ??
      kakaoUser.kakao_account?.profile?.profile_image_url ??
      kakaoUser.kakao_account?.profile?.thumbnail_image_url;

    const email = kakaoUser.kakao_account?.email;

    console.log(`[AUTH] Extracted Data - kakaoId: ${kakaoId}, nickname: ${nickname}, profileImage: ${profileImage}, email: ${email}`);

    // 3. DB upsert (있으면 정보 업데이트, 없으면 생성)
    console.log(`[AUTH] Upserting user for kakaoId: ${kakaoId}, nickname: ${nickname}`);
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
    console.log(`[AUTH] User session created: userId=${user.id} for kakaoId=${kakaoId}`);

    // 4. JWT 발급 (24시간)
    const token = jwt.sign({ userId: user.id }, env.JWT_SECRET, {
      expiresIn: "24h",
    });

    res.json({
      token,
      user: { id: user.id, kakao_id: user.kakaoId, nickname: user.nickname, profile_image: user.profileImage, email: user.email },
    });
  } catch (err) {
    console.error("카카오 로그인 치명적 실패:", err);
    res.status(500).json({ error: "AUTH_FAILED", message: err instanceof Error ? err.message : String(err) });
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

// POST /api/auth/dev-login — 개발용 즉시 로그인 (인가 코드 불필요)
authRouter.post("/dev-login", async (_req: Request, res: Response) => {
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
      expiresIn: "24h",
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
