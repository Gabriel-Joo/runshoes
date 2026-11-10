/**
 * 비교하기(docs/08_compare.md) — 화면 쪽 유틸만: 주소(?ids · ?why) 읽고 쓰기, 표시 변환(SIZE_MM · 숫자 · 은/는), 검색 결과 순서.
 * 계산(자동 채우기 · 거리 · 등수 · 밴드 · 위치 말 · 환산 여부)은 서버로 옮겼다(2026-11-10 작업 3, compare/ComparePolicy · GET /api/compare).
 * 옮기기 전 계산의 얼린 사본은 scripts/parity/reference/compare.mjs. 시험: tests/compare.test.ts(npm test)
 */
import type { Shoe } from "../types/index.ts";

export const MAX_COLS = 5;   // 비교는 다섯 켤레까지

/** 열마다 붙는 이유 — 주소(?why=)에는 한 글자로 */
export type Why = "pick" | "line" | "brand" | "stability" | "similar" | "user" | "rec";
export const WHY_LABEL: Record<Why, string> = {
  pick: "고른 신발",
  line: "같은 라인",
  brand: "같은 브랜드",
  stability: "안정성 다름",
  similar: "비슷한 신발",
  user: "내가 담은 신발",       // 검색 · 찜 · 상세 모달에서 담은 것(2026-11-09 사용자 — 모든 카드에 이유가 있어야 줄이 맞는다)
  rec: "추천받은 신발",         // 추천받기 결과에서
};
const WHY_CODE: Record<Why, string> = { pick: "p", line: "l", brand: "b", stability: "s", similar: "m", user: "u", rec: "r" };
const CODE_WHY = Object.fromEntries(Object.entries(WHY_CODE).map(([k, v]) => [v, k])) as Record<string, Why>;

export interface Col {
  id: number;
  why: Why;
}

/** ?ids=1,2,3&why=p,l,b — 숫자 아님 · 모르는 id · 겹침은 버리고 다섯 개까지. why 가 모자라거나 모르면 "user"("내가 담은 신발") */
export function parseCols(ids: string | null, why: string | null, known: Set<number>): Col[] {
  const whys = (why ?? "").split(",");
  const out: Col[] = [];
  (ids ?? "").split(",").forEach((raw, i) => {
    const id = Number(raw.trim());
    if (!Number.isInteger(id) || id <= 0 || !known.has(id) || out.some((c) => c.id === id) || out.length >= MAX_COLS) return;
    out.push({ id, why: CODE_WHY[whys[i]?.trim()] ?? "user" });
  });
  return out;
}

/** Col[] → 주소의 ids · why. 모두 "user" 면 why 는 뺀다(읽을 때 없으면 "user") */
export function formatCols(cols: Col[]): { ids: string; why: string | null } {
  return {
    ids: cols.map((c) => c.id).join(","),
    why: cols.some((c) => c.why !== "user") ? cols.map((c) => WHY_CODE[c.why]).join(",") : null,
  };
}

/* ───── 어디쯤인지(08 1-7) ───── */

export type NumKey = "weight" | "stackHeight" | "drop" | "price";

/** 무게를 잰 사이즈 → mm(표시용). 무게 자리는 270mm(M9)로 맞춘 값으로 말한다(V15 weightNorm270, 환산 규칙 01a 1-3a) */
export const SIZE_MM: Record<string, number> = { "M8.5": 265, M9: 270, "M9.5": 275, M10: 280, "M10.5": 285 };
export const BASE_SIZE = "M9";

/** 그래프 설명 — 결론 먼저(2026-11-09 사용자): "무게 280g — 중간이에요" / "…를 가벼운 순으로 세우면 131번째예요." */
export const NUM_TEXT: Record<NumKey, { label: string; pop: string; order: string }> = {
  weight: { label: "무게", pop: "270mm로 맞춘 무게가 있는 신발", order: "가벼운 순" },
  stackHeight: { label: "스택하이트", pop: "스택하이트 값이 있는 신발", order: "낮은 순" },
  drop: { label: "드롭", pop: "드롭 값이 있는 신발", order: "낮은 순" },
  price: { label: "발매가", pop: "발매가를 확인한 신발", order: "낮은 순" },
};

export function formatNum(key: NumKey, v: number): string {
  if (key === "price") return `${v.toLocaleString("ko-KR")}원`;
  if (key === "weight") return `${Math.round(v)}g`;   // 환산값은 소수 — 화면에서만 반올림한다
  return `${v}mm`;
}

/** 끝 글자에 받침이 있나 — 숫자 · 영문은 읽는 소리로 어림 */
function hasJong(word: string): boolean {
  const c = word.trim().slice(-1);
  const code = c.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (/[0-9]/.test(c)) return "0136789".includes(c);
  return /[lmnr]/i.test(c);
}
export const eunNeun = (word: string) => word + (hasJong(word) ? "은" : "는");
export const eulReul = (word: string) => word + (hasJong(word) ? "을" : "를");
/** 이름 여럿을 한 주어로 — "클라우드고 · 클리프톤 10은" (은/는은 끝 이름에만) */
export const topic = (names: string[]) => [...names.slice(0, -1), eunNeun(names[names.length - 1] ?? "")].join(" · ");

/* ───── 검색 결과 순서 ───── */

/** 같은 라인은 붙여서 새 세대 → 옛 세대(브랜드 · 라인 순) */
export function sortResults<T extends Pick<Shoe, "id" | "brand" | "lineKey" | "generation">>(list: T[]): T[] {
  return [...list].sort(
    (a, b) =>
      a.brand.localeCompare(b.brand, "ko") ||
      (a.lineKey ?? `~${a.id}`).localeCompare(b.lineKey ?? `~${b.id}`) ||
      (b.generation ?? 0) - (a.generation ?? 0) ||
      a.id - b.id,
  );
}

/* ───── 다른 화면에서 비교로 넘어갈 때 ───── */

/** 상세 모달 "비교에 담기" — 마지막 구성이 있으면 한 칸 더하고(이미 있거나 다섯이면 그대로), 없으면 그 신발로 자동 채우기 */
export function addToCompareUrl(id: number, last: Col[]): string {
  if (last.length === 0) return `/compare?pick=${id}`;
  const cols = last.some((c) => c.id === id) || last.length >= MAX_COLS ? last : [...last, { id, why: "user" as Why }];
  const f = formatCols(cols);
  return `/compare?ids=${f.ids}${f.why ? `&why=${f.why}` : ""}`;
}
