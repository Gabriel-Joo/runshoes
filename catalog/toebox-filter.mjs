// 토박스(발볼) 근거 문장 제외 필터 — 리뷰 본문(width.csv → fill) · 웹 검색 근거에 같은 기준을 쓴다(2026-10-24 사용자 승인)
//   빼는 것: 표 라벨("Toebox: Tight") · 비교급("wider than v3") · 질문 · 조건문으로 시작하는 문장 · 리뷰어 자기 발 · 자기 신발 이야기 · 브랜드 일반론 · "rear of the forefoot"(미드풋 쪽)
//   다른 신발 이야기는 비교급("than the Pegasus")과 주소 단위 otherShoe · otherGen 이 거른다.
export const LABEL = /^\s*toe ?box(?: width| fit)?\s*:\s*\w+\.?\s*$/i;
export const COMPARATIVE = /\b(wider|narrower|roomier|snugger|tighter|more ?so than|than (the|its|other|most|brands?))\b/i;
export const QUESTION = /\?/;
export const CONDITIONAL = /^\s*(so,?\s+)?(if|would|should|could)\b/i;
// 리뷰어의 발 · 습관 이야기만("my wide feet" · "as someone who runs in wide toeboxes"). 이 신발에 대한 반응("I can expand my toes")은 근거다
export const SELF = /\b(my (wide|narrow|flat|bony|duck) (feet|foot)|my (feet|foot) (are|is) (wide|narrow)|as someone (who|with)|someone who (runs|wears)|i have (wide|narrow|flat) (feet|foot)|my own (feet|foot|shoes)|for my (average|slightly|wide|narrow|regular|normal)\b|like mine)\b/i;
// 브랜드 · 신발 일반론("New Balance shoes are so accommodating") — 이 모델 이야기가 아니다
export const GENERAL = /\bshoes (are|tend to be|tend to run|usually|generally)\b/i;
export const REAR = /rear of the forefoot/i;

// 본문 인용은 문장이 아니라 앞뒤 창(약 220자)이다 — 토박스 · 포어풋 낱말이 든 절만 잘라 본다(옆 항목의 "lighter than version 27" 같은 비교급을 끌어오지 않게)
const KW = /toe ?-?box|forefoot/i;
export function toeboxClause(t) {
  const m = t.match(KW); if (!m) return t;
  const i = m.index;
  const start = Math.max(t.lastIndexOf('. ', i), t.lastIndexOf('! ', i), t.lastIndexOf('? ', i), t.lastIndexOf('; ', i), t.lastIndexOf(': ', i)) + 1;
  const ends = ['. ', '! ', '? ', '; ', ' -->'].map((x) => t.indexOf(x, i)).filter((x) => x >= 0);
  const end = ends.length ? Math.min(...ends) + 1 : t.length;
  return t.slice(Math.max(start, i - 60), Math.min(end, i + m[0].length + 60)).trim();
}

// q: 인용 문장(앞의 "넓음: " 같은 판정 머리말은 떼고 준다)
export const badToeboxQuote = (q) => { const c = toeboxClause(q); return [LABEL, COMPARATIVE, QUESTION, CONDITIONAL, SELF, GENERAL, REAR].some((re) => re.test(c)); };
