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

/** 상담 세션 카테고리 (진로, 인간관계, 건강, 재정, 기타) */
export type SessionCategory = "career" | "relationship" | "health" | "finance" | "other";

/** 상담 깊이 (가벼운 고민 / 깊은 고민) */
export type SessionLevel = "light" | "deep";

/** 채팅 메시지 발신자 (사용자 / AI 어시스턴트) */
export type MessageRole = "user" | "assistant";
