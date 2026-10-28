// 모를 수 있는 값의 표시 — null 은 "정보 없음"으로 통일한다(칸을 숨기지 않는다). 카드 · 상세가 같은 문구를 쓴다
export const NONE = "정보 없음";

export const withUnit = (v: number | null | undefined, unit: string) => (v === null || v === undefined ? NONE : `${v}${unit}`);
export const text = (v: string | null | undefined) => (v === null || v === undefined || v === "" ? NONE : v);
// 있음 · 없음 · 정보 없음 — false 와 null 을 섞지 않는다(없다고 확인한 것과 모르는 것은 다르다)
export const yesNo = (v: boolean | null | undefined) => (v === true ? "있음" : v === false ? "없음" : NONE);
