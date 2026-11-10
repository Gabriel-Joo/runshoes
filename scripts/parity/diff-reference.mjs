#!/usr/bin/env node
// 추천 규칙을 바꿀 때 — 옛 기준 사본과 새 기준 사본을 같은 신발 목록으로 960 조합 돌려 무엇이 바뀌는지 센다(서버 없이).
//   node scripts/parity/diff-reference.mjs --base https://runshoes.ronanlab.dev [--old reference/history/recommend-browser-20261110.mjs]
// 낸다: 바뀐 자리(2,880 중) · 1위가 바뀐 조합 · 순서 무시하고 구성이 바뀐 조합 · 상위 3 에 한 번이라도 든 신발 수.
// 작업 3-1(2026-11-10) 기대값 — 운영 310켤레(11-10): 자리 1,317 · 1위 337 · 구성 502(docs/10_recommend.md).
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("--base", "https://runshoes.ronanlab.dev");
const oldMod = await import(path.resolve(here, arg("--old", "reference/history/recommend-browser-20261110.mjs")));
const newMod = await import(path.resolve(here, arg("--new", "reference/recommend.mjs")));

const toLocale = Number.prototype.toLocaleString;
Number.prototype.toLocaleString = function (locales, opts) { return toLocale.call(this, locales ?? "ko-KR", opts); };

const all = await (await fetch(`${BASE}/api/shoes`)).json();
const ANSWERS = {
  purpose: ["조깅·회복주", "템포·인터벌", "LSD·장거리", "레이스", "트레일"],
  width: ["넓음", "보통", "unknown"],
  stability: ["안정화", "중립화", "중립화-outer", "unknown"],
  cushion: ["high", "mid", "low", "unknown"],
  price: ["low", "mid", "high", "unknown"],
};
let combos = [{}];
for (const [k, vs] of Object.entries(ANSWERS)) combos = combos.flatMap((c) => vs.map((v) => ({ ...c, [k]: v })));

let slots = 0, firsts = 0, sets = 0;
const d0 = new Set(), d1 = new Set();
for (const c of combos) {
  const a = oldMod.recommend(all, c).map((r) => r.id), b = newMod.recommend(all, c).map((r) => r.id);
  a.forEach((id, j) => { if (b[j] !== id) slots++; });
  if (a[0] !== b[0]) firsts++;
  if ([...a].sort().join() !== [...b].sort().join()) sets++;
  a.forEach((id) => d0.add(id)); b.forEach((id) => d1.add(id));
}
console.log(`신발 ${all.length} · 조합 ${combos.length}`);
console.log(`바뀐 자리 ${slots}/${combos.length * 3} · 1위가 바뀐 조합 ${firsts} · 구성이 바뀐 조합 ${sets} · 상위 3 에 한 번이라도 든 신발 ${d0.size} → ${d1.size}`);
