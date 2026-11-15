/** 관리 목록의 쪽 번호 묶음(2026-11-15 사용자) — 화면 부품은 pages/adminmy/parts.tsx 의 Pager */

/** 한 쪽에 몇 개 — 서버 AdminPage 의 size(1~100). 첫 값이 기본(2026-11-15 사용자) */
export const PAGE_SIZES = [20, 50, 100];

/** 주소의 size — 고를 수 있는 값이 아니면 기본 */
export function pageSize(v: string) {
  return PAGE_SIZES.includes(Number(v)) ? Number(v) : PAGE_SIZES[0];
}

/** 한 묶음에 보이는 쪽 번호 수 */
export const PAGE_GROUP = 5;

/** page 가 든 묶음 — 1~5, 6~10 …. 마지막 묶음은 있는 만큼만. first · lastGroup 은 ‹‹ ‹ · › ›› 를 막을지 */
export function pageGroup(page: number, last: number) {
  const start = Math.floor((page - 1) / PAGE_GROUP) * PAGE_GROUP + 1;
  const end = Math.min(start + PAGE_GROUP - 1, last);
  return { start, end, pages: Array.from({ length: end - start + 1 }, (_, i) => start + i), first: start === 1, lastGroup: end >= last };
}
