import { REVIEW_MAX, reviewLength } from "./reviewRules";

/** 리뷰 입력 중 남은 글자 수 — 서버와 같은 셈(앞뒤 공백 빼고 코드포인트). 20자 아래로 남으면 강조 */
function ReviewCounter({ value }: { value: string }) {
  const left = REVIEW_MAX - reviewLength(value);
  return (
    <p className={`review__counter ${left <= 20 ? "is-low" : ""}`} aria-live="polite">
      남은 글자 {Math.max(left, 0)}자
    </p>
  );
}

export default ReviewCounter;
