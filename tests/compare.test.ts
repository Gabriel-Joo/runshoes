// 비교하기 계산(src/utils/compare.ts) — npm test(tsc 로 옮긴 뒤 node --test). 화면 없이
import { test } from "node:test";
import assert from "node:assert/strict";
import { addToCompareUrl, autofill, eunNeun, formatCols, numValue, parseCols, population, rankIn, sortResults } from "../src/utils/compare.ts";

const base = { purpose: "조깅·회복주", stability: "중립화", stackHeight: 40, drop: 8, weight: 270, carbon: false, isCurrent: true, generation: 1 };
const shoe = (id: number, o: Partial<typeof base> & { brand: string; lineKey: string; weightSize?: string | null; price?: number | null }) =>
  ({ ...base, weightSize: "M9", price: null, id, ...o });

const all = [
  shoe(1, { brand: "호카", lineKey: "hoka:clifton", generation: 11 }),
  shoe(2, { brand: "호카", lineKey: "hoka:clifton", generation: 10, isCurrent: false, weightSize: "M9.5" }),
  shoe(3, { brand: "호카", lineKey: "hoka:skyflow", stackHeight: 39 }),
  shoe(4, { brand: "아식스", lineKey: "asics:pulse", stackHeight: 41 }),
  shoe(5, { brand: "아식스", lineKey: "asics:gt2000", stability: "안정화", stackHeight: 38 }),
  shoe(6, { brand: "브룩스", lineKey: "brooks:ghost", stackHeight: 36, drop: 10 }),
  shoe(7, { brand: "나이키", lineKey: "nike:old", isCurrent: false }),          // 현행 아님 — 자동 채우기에서 빠진다
  shoe(8, { brand: "나이키", lineKey: "nike:race", purpose: "레이스", carbon: true }), // 다른 용도
];

test("자동 채우기 — 고른 신발 · 같은 라인 · 같은 브랜드 · 안정성 다름", () => {
  assert.deepEqual(autofill(1, all), [
    { id: 1, why: "pick" }, { id: 2, why: "line" }, { id: 3, why: "brand" }, { id: 5, why: "stability" },
  ]);
});

test("자동 채우기 — 같은 라인이 없으면 다른 브랜드로 넷을 채우고, 현행 · 같은 용도만", () => {
  const cols = autofill(6, all);
  assert.equal(cols.length, 4);
  assert.deepEqual(cols[0], { id: 6, why: "pick" });
  assert.ok(cols.some((c) => c.why === "stability" && c.id === 5));
  assert.ok(!cols.some((c) => c.id === 7 || c.id === 8));
  // 다른 브랜드는 먼저 아직 없는 브랜드에서(호카) — 브랜드가 다 떨어지면 그때 겹친다
  assert.equal(all.find((s) => s.id === cols[2].id)!.brand, "호카");
});

test("자동 채우기 — 후보가 모자라면 있는 만큼, 없는 id 는 빈 배열", () => {
  assert.deepEqual(autofill(8, all), [{ id: 8, why: "pick" }]);
  assert.deepEqual(autofill(99, all), []);
});

test("주소 — 숫자 아님 · 모르는 id · 겹침 버리고 다섯까지, why 는 한 글자", () => {
  const known = new Set([1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(parseCols("1,x,1,99,2,3,4,5,6", "p,l", known).map((c) => c.id), [1, 2, 3, 4, 5]);
  assert.deepEqual(parseCols("1,2", "p,zz", known), [{ id: 1, why: "pick" }, { id: 2, why: "user" }]);
  assert.deepEqual(parseCols(null, null, known), []);
  assert.deepEqual(formatCols([{ id: 1, why: "pick" }, { id: 3, why: "brand" }]), { ids: "1,3", why: "p,b" });
  assert.deepEqual(formatCols([{ id: 1, why: "user" }]), { ids: "1", why: null });
});

test("무게 자리는 270mm 로 잰 것끼리만", () => {
  assert.equal(numValue(all[1], "weight"), null);
  assert.equal(numValue(all[0], "weight"), 270);
  assert.equal(population(all, "weight").length, all.length - 1);
  assert.deepEqual(population(all, "price"), []);
});

test("자리 — 하위 25% · 가운데 · 상위 25%, 동점은 가운데 순위", () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8];
  assert.equal(rankIn(arr, 1).band, "low");
  assert.equal(rankIn(arr, 4).band, "mid");
  assert.equal(rankIn(arr, 8).band, "high");
  assert.deepEqual(rankIn([5, 5, 5, 5], 5), { less: 0, same: 4, more: 0, order: 1, band: "mid" });
  assert.equal(rankIn(arr, 3).order, 3);
});

test("은/는 · 검색 순서(같은 라인은 새 세대 → 옛 세대)", () => {
  assert.equal(eunNeun("클리프톤 10"), "클리프톤 10은");
  assert.equal(eunNeun("고스트 맥스 4"), "고스트 맥스 4는");
  assert.equal(eunNeun("스카이플로우"), "스카이플로우는");
  assert.deepEqual(sortResults([all[1], all[2], all[0]]).map((s) => s.id), [1, 2, 3]);
});

test("비교에 담기 — 비었으면 자동 채우기, 있으면 한 칸 더하기(겹침 · 다섯이면 그대로)", () => {
  assert.equal(addToCompareUrl(3, []), "/compare?pick=3");
  assert.equal(addToCompareUrl(3, [{ id: 1, why: "pick" }]), "/compare?ids=1,3&why=p,u");
  assert.equal(addToCompareUrl(1, [{ id: 1, why: "user" }]), "/compare?ids=1");
  const five = [1, 2, 3, 4, 5].map((id) => ({ id, why: "user" as const }));
  assert.equal(addToCompareUrl(6, five), "/compare?ids=1,2,3,4,5");
});
