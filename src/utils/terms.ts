import type { Term } from "../types";

// 와이드 모델 ⓘ — 값 넷(V12)을 다 설명한다(2026-11-03 사용자 문구). terms 테이블은 읽기 전용이라(TermCollection) 화면이 직접 가진다
export const WIDE_TERM: Term = {
  id: 0,
  key: "wideAvailable",
  name: "와이드 모델",
  short: "넓은 폭(2E·4E) 버전이 따로 나오는지",
  description: "그 신발의 넓은 폭(2E·4E) 버전이 따로 나오는지를 뜻합니다.",
  // 값 이름은 칸에 보이는 값(wideLabel)과 같게 — 말투는 다른 용어처럼 "~입니다"(2026-11-03 사용자)
  values: [
    ["있음", "국내에서 살 수 있습니다."],
    ["국외에만 있음", "해외에는 나오지만 국내에서는 살 수 없습니다. 해외 직구로만 구할 수 있습니다."],
    ["없음", "찾아봤지만 넓은 폭 버전이 없습니다."],
    ["정보 없음", "아직 확인하지 못했습니다."],
  ],
};

/** 안정성 ⓘ(비교하기) — 열마다 값이 달라 중립화 · 안정화를 값마다 같이 보인다. 설명은 terms 그대로 */
export function stabilityTerm(terms: Term[]): Term | undefined {
  const neutral = terms.find((t) => t.key === "neutral"), stable = terms.find((t) => t.key === "stability");
  if (!neutral || !stable) return undefined;
  return {
    id: 0,
    key: "stabilityPair",
    name: "안정성",
    short: "",
    description: "발이 안쪽으로 무너지는 과내전을 잡아 주는지에 따라 나눕니다.",
    values: [[neutral.name, neutral.description], [stable.name, stable.description]],
  };
}
