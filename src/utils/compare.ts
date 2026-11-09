/**
 * 비교하기(docs/08_compare.md) — 화면과 떨어진 계산만. 시험: tests/compare.test.ts(npm test)
 * 점수는 매기지 않는다 — 자동 채우기의 "가까움"은 후보를 고르는 데만 쓰고 화면에 내지 않는다.
 */
import type { Shoe } from "../types/index.ts";

export const MAX_COLS = 5;   // 비교는 다섯 켤레까지
export const AUTO_COLS = 4;  // 하나를 고르면 네 켤레까지 채운다

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

/** ?ids=1,2,3&why=p,l,b — 숫자 아님 · 모르는 id · 겹침은 버리고 다섯 개까지. why 가 모자라거나 모르면 "user"(표시 없음) */
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

/** Col[] → 주소의 ids · why. 표시할 이유가 하나도 없으면 why 는 뺀다 */
export function formatCols(cols: Col[]): { ids: string; why: string | null } {
  return {
    ids: cols.map((c) => c.id).join(","),
    why: cols.some((c) => c.why !== "user") ? cols.map((c) => WHY_CODE[c.why]).join(",") : null,
  };
}

type Spec = Pick<Shoe, "id" | "brand" | "purpose" | "stability" | "stackHeight" | "drop" | "weight" | "carbon" | "lineKey" | "isCurrent">;

function stdev(xs: number[]): number {
  if (xs.length === 0) return 1;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1;
}

/** 스펙이 얼마나 가까운가 — 스택 + 드롭 × 0.7 + 무게(각각 전체 표준편차로 나눔), 카본이 서로 다르면 +2, 한쪽이 비면 그 칸은 1 */
export function makeDistance(all: Spec[]) {
  const sd = {
    stackHeight: stdev(all.map((s) => s.stackHeight).filter((v): v is number => v != null)),
    drop: stdev(all.map((s) => s.drop).filter((v): v is number => v != null)),
    weight: stdev(all.map((s) => s.weight).filter((v): v is number => v != null)),
  };
  return (a: Spec, b: Spec) => {
    let d = 0;
    for (const [k, w] of [["stackHeight", 1], ["drop", 0.7], ["weight", 1]] as const) {
      const x = a[k], y = b[k];
      d += w * (x == null || y == null ? 1 : Math.abs(x - y) / sd[k]);
    }
    if (a.carbon != null && b.carbon != null && a.carbon !== b.carbon) d += 2;
    return d;
  };
}

/**
 * 하나를 고르면 네 켤레까지(08 1-3): 고른 신발 → 같은 라인의 다른 세대 → 같은 브랜드 · 같은 안정성 1 →
 * 다른 브랜드 · 안정성이 다른 신발 1 → 다른 브랜드 · 같은 안정성 → (모자라면) 다른 브랜드 아무거나 → 아무거나.
 * 후보는 같은 용도 · 다른 라인 · 현행만(검색은 전체 — 여기만 현행). 다른 브랜드는 브랜드마다 하나.
 */
export function autofill(pickId: number, all: Spec[]): Col[] {
  const pick = all.find((s) => s.id === pickId);
  if (!pick) return [];
  const out: Col[] = [{ id: pick.id, why: "pick" }];
  if (pick.lineKey) {
    all.filter((s) => s.lineKey === pick.lineKey && s.id !== pick.id).forEach((s) => out.push({ id: s.id, why: "line" }));
  }
  const dist = makeDistance(all);
  const pool = all
    .filter((s) => s.id !== pick.id && (!pick.lineKey || s.lineKey !== pick.lineKey) && s.isCurrent && s.purpose === pick.purpose)
    .sort((a, b) => dist(pick, a) - dist(pick, b) || a.id - b.id);
  const used = new Set(out.map((c) => c.id));
  const brands = new Set([pick.brand]);
  const take = (ok: (s: Spec) => boolean, why: Why) => {
    if (out.length >= AUTO_COLS) return false;
    const s = pool.find((x) => !used.has(x.id) && ok(x));
    if (!s) return false;
    used.add(s.id);
    brands.add(s.brand);
    out.push({ id: s.id, why });
    return true;
  };
  take((s) => s.brand === pick.brand && s.stability === pick.stability, "brand");
  take((s) => !brands.has(s.brand) && s.stability !== pick.stability, "stability");
  while (take((s) => !brands.has(s.brand) && s.stability === pick.stability, "similar"));
  while (take((s) => !brands.has(s.brand), "similar"));
  while (take(() => true, "similar"));
  return out.slice(0, AUTO_COLS);
}

/* ───── 어디쯤인지(08 1-7) ───── */

export type NumKey = "weight" | "stackHeight" | "drop" | "price";

/** 무게를 잰 사이즈 → mm. 무게 자리는 270mm(M9)끼리만 말한다 */
export const SIZE_MM: Record<string, number> = { "M8.5": 265, M9: 270, "M9.5": 275, M10: 280, "M10.5": 285 };
export const BASE_SIZE = "M9";

/** 그 칸의 "자리를 말할 수 있는" 값 — 무게는 270mm 로 잰 것만 */
export function numValue(s: Pick<Shoe, NumKey | "weightSize">, key: NumKey): number | null {
  if (key === "weight") return s.weightSize === BASE_SIZE ? s.weight : null;
  return s[key];
}

/** 모집단 — 그 칸의 값이 있는 신발(무게는 270mm 로 잰 것) */
export function population(all: Pick<Shoe, NumKey | "weightSize">[], key: NumKey): number[] {
  return all.map((s) => numValue(s, key)).filter((v): v is number => v != null);
}

export interface Rank {
  less: number;   // 이 값보다 작은 신발 수
  same: number;   // 같은 값(자기 포함)
  more: number;   // 큰 신발 수
  order: number;  // 작은 순으로 세웠을 때 몇 번째(1부터)
  band: "low" | "mid" | "high";   // 하위 25% · 가운데 · 상위 25% — 동점은 가운데 순위로
}

export function rankIn(arr: number[], v: number): Rank {
  const less = arr.filter((a) => a < v).length;
  const same = arr.filter((a) => a === v).length;
  const more = arr.length - less - same;
  const p = arr.length ? (less + same / 2) / arr.length : 0.5;
  return { less, same, more, order: less + 1, band: p < 0.25 ? "low" : p > 0.75 ? "high" : "mid" };
}

export const BAND_WORD: Record<NumKey, Record<Rank["band"], string>> = {
  weight: { low: "가벼운 편", mid: "중간", high: "무거운 편" },
  stackHeight: { low: "낮은 편", mid: "중간", high: "높은 편" },
  drop: { low: "낮은 편", mid: "중간", high: "높은 편" },
  price: { low: "낮은 편", mid: "중간", high: "높은 편" },
};

/** 그래프 설명 — 결론 먼저(2026-11-09 사용자): "무게 280g — 중간이에요" / "…를 가벼운 순으로 세우면 131번째예요." */
export const NUM_TEXT: Record<NumKey, { label: string; pop: string; order: string }> = {
  weight: { label: "무게", pop: "270mm 기준 무게가 있는 신발", order: "가벼운 순" },
  stackHeight: { label: "스택하이트", pop: "스택하이트 값이 있는 신발", order: "낮은 순" },
  drop: { label: "드롭", pop: "드롭 값이 있는 신발", order: "낮은 순" },
  price: { label: "발매가", pop: "발매가를 확인한 신발", order: "낮은 순" },
};

export function formatNum(key: NumKey, v: number): string {
  if (key === "price") return `${v.toLocaleString("ko-KR")}원`;
  return `${v}${key === "weight" ? "g" : "mm"}`;
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
