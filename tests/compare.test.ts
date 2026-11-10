// 비교하기 화면 유틸(src/utils/compare.ts) — npm test(tsc 로 옮긴 뒤 node --test). 화면 없이
// 계산(자동 채우기 · 거리 · 등수 · 밴드)은 서버로 옮겼다(2026-11-10 작업 3) — 시험은 backend compare/PolicyTest 와
// 이관 전 계산(scripts/parity/reference/)과의 전수 대조 scripts/parity/check.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { addToCompareUrl, eunNeun, formatCols, formatNum, parseCols, sortResults, topic } from "../src/utils/compare.ts";

const shoe = (id: number, brand: string, lineKey: string, generation: number) => ({ id, brand, lineKey, generation });

test("주소 — 숫자 아님 · 모르는 id · 겹침 버리고 다섯까지, why 는 한 글자", () => {
  const known = new Set([1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(parseCols("1,x,1,99,2,3,4,5,6", "p,l", known).map((c) => c.id), [1, 2, 3, 4, 5]);
  assert.deepEqual(parseCols("1,2", "p,zz", known), [{ id: 1, why: "pick" }, { id: 2, why: "user" }]);
  assert.deepEqual(parseCols(null, null, known), []);
  assert.deepEqual(formatCols([{ id: 1, why: "pick" }, { id: 3, why: "brand" }]), { ids: "1,3", why: "p,b" });
  assert.deepEqual(formatCols([{ id: 1, why: "user" }]), { ids: "1", why: null });
});

test("표시 반올림 · 이름 묶기", () => {
  assert.equal(formatNum("weight", 270.73), "271g");
  assert.equal(formatNum("price", 199000), "199,000원");
  assert.equal(topic(["클라우드고", "클리프톤 10"]), "클라우드고 · 클리프톤 10은");
  assert.equal(topic(["클라우드고"]), "클라우드고는");
});

test("은/는 · 검색 순서(같은 라인은 새 세대 → 옛 세대)", () => {
  assert.equal(eunNeun("클리프톤 10"), "클리프톤 10은");
  assert.equal(eunNeun("고스트 맥스 4"), "고스트 맥스 4는");
  assert.equal(eunNeun("스카이플로우"), "스카이플로우는");
  const list = [shoe(2, "호카", "hoka:clifton", 10), shoe(3, "호카", "hoka:skyflow", 1), shoe(1, "호카", "hoka:clifton", 11)];
  assert.deepEqual(sortResults(list).map((s) => s.id), [1, 2, 3]);
});

test("비교에 담기 — 비었으면 자동 채우기, 있으면 한 칸 더하기(겹침 · 다섯이면 그대로)", () => {
  assert.equal(addToCompareUrl(3, []), "/compare?pick=3");
  assert.equal(addToCompareUrl(3, [{ id: 1, why: "pick" }]), "/compare?ids=1,3&why=p,u");
  assert.equal(addToCompareUrl(1, [{ id: 1, why: "user" }]), "/compare?ids=1");
  const five = [1, 2, 3, 4, 5].map((id) => ({ id, why: "user" as const }));
  assert.equal(addToCompareUrl(6, five), "/compare?ids=1,2,3,4,5");
});
