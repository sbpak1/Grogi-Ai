/**
 * PrismaClient 싱글턴
 *
 * Prisma 7에서는 DB 드라이버 어댑터를 직접 전달해야 한다.
 * PostgreSQL → @prisma/adapter-pg 사용.
 *
 * 싱글턴 패턴:
 *   개발 시 tsx watch가 파일 변경마다 모듈을 다시 로드하는데,
 *   그때마다 새 PrismaClient가 생기면 DB 커넥션이 계속 쌓인다.
 *   globalThis에 캐싱해서 개발 환경에서도 커넥션 1개만 유지한다.
 *
 * 사용법: import { prisma } from "./lib/prisma" → prisma.user.findMany() 등
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

// globalThis에 prisma를 캐싱하기 위한 타입 단언
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

/** DATABASE_URL로 PostgreSQL 어댑터를 만들어 PrismaClient 생성 */
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL!;
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

// 이미 생성된 인스턴스가 있으면 재사용, 없으면 새로 생성
export const prisma = globalForPrisma.prisma || createPrismaClient();

// 개발 환경에서만 globalThis에 캐싱 (프로덕션은 매번 새로 만들어도 OK — 프로세스가 1회만 시작됨)
if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
