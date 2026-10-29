import { DEMO_ADMIN_MESSAGE } from "../auth/demoAdmin";

/** 리뷰 입력 규칙 — 서버 api/ReviewRules 와 같다(10~300자, 2026-10-30) */
export const REVIEW_MAX = 300;

/** 글자 수 — 서버처럼 앞뒤 공백을 빼고 코드포인트로 센다(이모지 하나 = 1자) */
export const reviewLength = (v: string) => [...v.trim()].length;

export function contentError(v: string) {
  const n = reviewLength(v);
  if (n < 10) return "내용을 10자 이상 써 주세요.";
  if (n > REVIEW_MAX) return `${REVIEW_MAX}자까지 쓸 수 있어요.`;
  return null;
}

/** 입력 중 300자를 넘으면 뒤를 자른다 — maxLength 는 UTF-16 단위라 이모지가 섞이면 덜 받는다 */
export function clampReview(v: string) {
  const over = reviewLength(v) - REVIEW_MAX;
  return over > 0 ? [...v].slice(0, -over).join("") : v;
}

/** 서버 상태코드 → 화면 문구(리뷰 API 의 오류 본문은 json-server 처럼 {}) */
export const reviewFailure: Record<number, string> = {
  401: "로그인이 끝났어요. 다시 로그인해 주세요.",
  403: "내가 쓴 리뷰만 고칠 수 있어요.",
  409: "이 신발에는 이미 리뷰를 썼어요.",
};

/** 실패 응답 → 화면 문구. 데모 관리자 403 은 서버 문구(본문 {code:"demo_admin"}) */
export async function reviewError(res: Response, fallback: string) {
  if (res.status === 403) {
    const body = await res.clone().json().catch(() => null);
    if (body?.code === "demo_admin") return body.message ?? DEMO_ADMIN_MESSAGE;
  }
  return reviewFailure[res.status] ?? fallback;
}
