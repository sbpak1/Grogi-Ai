/**
 * 공통 타입 정의
 *
 * 프론트/백엔드가 공유하는 API 응답 형식과
 * 도메인에서 쓰는 리터럴 타입들을 모아둔다.
 */

/** 모든 API 응답의 공통 wrapper (성공 시 data, 실패 시 error) */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

/** 채팅 메시지 발신자 (사용자 / AI 어시스턴트) */
export type MessageRole = "user" | "assistant";
