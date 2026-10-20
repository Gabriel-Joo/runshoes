/** 리뷰 입력 규칙 — 서버 api/ReviewRules 와 같다 */
export function contentError(v: string) {
  const n = [...v.trim()].length;
  if (n < 10) return "내용을 10자 이상 써 주세요.";
  if (n > 1000) return "1,000자까지 쓸 수 있어요.";
  return null;
}

/** 서버 상태코드 → 화면 문구(리뷰 API 의 오류 본문은 json-server 처럼 {}) */
export const reviewFailure: Record<number, string> = {
  401: "로그인이 끝났어요. 다시 로그인해 주세요.",
  403: "내가 쓴 리뷰만 고칠 수 있어요.",
  409: "이 신발에는 이미 리뷰를 썼어요.",
};
