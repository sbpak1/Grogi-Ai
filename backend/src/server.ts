/**
 * 서버 시작점 (엔트리 포인트)
 *
 * 실행 흐름:
 *   1. env.ts → .env 파일 로드 + 환경변수 검증 (실패 시 여기서 프로세스 종료)
 *   2. app.ts → Express 앱 생성 (CORS, JSON 파서, 라우터 연결)
 *   3. 여기서 → 지정된 PORT로 HTTP 서버 시작
 *
 * 개발: npm run dev  (tsx watch — 파일 변경 시 자동 재시작)
 * 프로덕션: npm start (tsc 빌드 후 node dist/server.js)
 */
import { app } from "./app";
import { env } from "./lib/env";

app.listen(env.PORT, () => {
  console.log(`Server running on http://localhost:${env.PORT}`);
});
