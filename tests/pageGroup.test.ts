// 관리 목록 쪽 번호 묶음(src/utils/pageGroup.ts) — npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { pageGroup, pageSize } from "../src/utils/pageGroup.ts";

test("몇 개씩 — 20 · 50 · 100 만, 나머지는 20", () => {
  assert.deepEqual(["", "50", "100", "30", "x", "1000"].map(pageSize), [20, 50, 100, 20, 20, 20]);
});

test("첫 묶음 — 1~5, 앞으로 못 간다", () => {
  assert.deepEqual(pageGroup(1, 90), { start: 1, end: 5, pages: [1, 2, 3, 4, 5], first: true, lastGroup: false });
  assert.deepEqual(pageGroup(5, 90).pages, [1, 2, 3, 4, 5]);
});

test("› 다음 묶음은 6~10", () => {
  assert.deepEqual(pageGroup(6, 90).pages, [6, 7, 8, 9, 10]);
  assert.equal(pageGroup(10, 90).first, false);
});

test("마지막 묶음은 있는 만큼만, 뒤로 못 간다", () => {
  assert.deepEqual(pageGroup(89, 90), { start: 86, end: 90, pages: [86, 87, 88, 89, 90], first: false, lastGroup: true });
  assert.deepEqual(pageGroup(27, 27), { start: 26, end: 27, pages: [26, 27], first: false, lastGroup: true });
});

test("쪽이 다섯 이하 — 한 묶음이라 양쪽 다 막힌다", () => {
  assert.deepEqual(pageGroup(2, 3), { start: 1, end: 3, pages: [1, 2, 3], first: true, lastGroup: true });
});
