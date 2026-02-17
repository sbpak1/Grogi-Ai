/**
 * JWT 인증 미들웨어
 *
 * 보호된 API 라우트 앞에 이 미들웨어를 넣으면,
 * Authorization 헤더의 Bearer 토큰을 검증하고
 * 디코딩된 userId를 req.userId에 담아준다.
 *
 * 사용 예시:
 *   router.get("/me", authMiddleware, meController);
 *   → req.userId로 로그인 사용자 ID 접근 가능
 *
 * 실패 시:
 *   - 토큰 없음 → 401 "인증 토큰이 필요합니다"
 *   - 토큰 만료/변조 → 401 "유효하지 않은 토큰입니다"
 */
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "../lib/env";

/** JWT 토큰 내부에 담기는 페이로드 구조 */
interface JwtPayload {
  userId: string;
}

// Express의 Request 타입을 확장해서 userId 필드를 추가
// → authMiddleware 통과 후 req.userId로 접근 가능
declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  // 1. Authorization 헤더에서 "Bearer xxx" 형식 확인
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "인증 토큰이 필요합니다" });
    return;
  }

  try {
    // 2. "Bearer " 접두사(7글자) 제거 후 토큰만 추출
    const token = header.slice(7);
    // 3. JWT_SECRET으로 서명 검증 + 디코딩
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
      issuer: "grogi-api",
      audience: "grogi-frontend",
    }) as JwtPayload;
    // 4. 검증 성공 → req에 userId 저장 후 다음 핸들러로
    req.userId = payload.userId;
    next();
  } catch {
    // 토큰 만료(TokenExpiredError) 또는 변조(JsonWebTokenError)
    res.status(401).json({ error: "유효하지 않은 토큰입니다" });
  }
}
