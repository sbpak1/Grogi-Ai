/**
 * Prisma 7 설정 파일
 *
 * Prisma 7부터 schema.prisma의 datasource 블록에서 url을 직접 쓸 수 없다.
 * 대신 이 파일에서 마이그레이션용 DB URL을 제공한다.
 *
 * - schema: schema.prisma 파일 위치
 * - migrate.url: prisma migrate dev/deploy 실행 시 사용할 DB 연결 URL
 *
 * 참고: PrismaClient의 런타임 DB 연결은 src/lib/prisma.ts에서 adapter로 처리
 */
import path from "node:path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  earlyAccess: true,
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  migrate: {
    async url() {
      return process.env.DATABASE_URL!;
    },
  },
});
