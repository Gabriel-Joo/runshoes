/** 마지막 비교 구성 — 이 브라우저에만(로그인 없이 쓴다). 읽고 쓰기가 실패해도 화면은 주소로 그린다(08 1-1) */
import { formatCols, parseCols, type Col } from "./compare";

const KEY = "runshoes.compare.last";

export function readLastCompare(known?: Set<number>): Col[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null") as { ids?: string; why?: string | null } | null;
    if (!raw?.ids) return [];
    const ids = raw.ids.split(",").map(Number);
    return parseCols(raw.ids, raw.why ?? null, known ?? new Set(ids));
  } catch {
    return [];
  }
}

export function writeLastCompare(cols: Col[]) {
  try {
    if (cols.length === 0) return;      // 다 빼도 "이어서 보기"는 남긴다
    localStorage.setItem(KEY, JSON.stringify(formatCols(cols)));
  } catch {
    /* 저장 못 해도 상관없다 */
  }
}
