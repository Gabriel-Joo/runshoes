#!/usr/bin/env node
// 비교 · 추천 전수 대조(2026-11-10, 작업 3 · 3-1) — 서버 API 가 기준 사본(reference/)과 같은 답을 내는가. 옛 규칙과의 차이는 diff-reference.mjs
//   node scripts/parity/check.mjs --base http://localhost:3200          # 로컬 Spring
//   node scripts/parity/check.mjs --base https://runshoes.ronanlab.dev   # 운영(읽기만 — 두 API 는 계산만 한다)
// 하는 일:
//   1. 대상 서버의 /api/shoes 를 읽어 reference 로 계산한다(화면이 받던 그 목록 · 그 순서).
//   2. 비교 — 신발마다 ?pick=<id>(자동 채우기 cols · 그 칸들의 값 · 등수 · 밴드 · 말 · 환산 여부), 다섯 켤레씩 ?ids=, 모집단(fields).
//   3. 추천 — 5 × 3 × 4 × 4 × 4 = 960 조합의 상위 3(id · 순서 · score · reasons 의 hit · text).
//   4. 끝에 /api/shoes 를 다시 읽어 그 사이 바뀌었으면(찜 · 평점) 처음부터 다시(3번까지).
// 비교는 === 뿐이다 — 숫자에 허용 오차를 두지 않는다. 하나라도 다르면 목록을 내고 exit 1.
// 가격 문구: 이관 전 toLocaleString() 은 브라우저 언어를 따랐다 — 여기서는 ko-KR 로 고정해 계산한다(서버도 한국 표기).
// 가중치를 고칠 때: reference/ 사본도 같이 고친 뒤 돌려 "의도한 차이"만 남는지 본다.
import * as ref from "./reference/compare.mjs";
import { recommend } from "./reference/recommend.mjs";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg("--base", "http://localhost:3200");
const MAX_SHOW = Number(arg("--show", "20"));

const toLocale = Number.prototype.toLocaleString;
Number.prototype.toLocaleString = function (locales, opts) { return toLocale.call(this, locales ?? "ko-KR", opts); };

const times = { compare: [], recommend: [] };
async function get(path, kind) {
  const t0 = performance.now();
  const res = await fetch(BASE + path);
  const body = await res.json();
  if (kind) times[kind].push(performance.now() - t0);
  if (res.status !== 200) throw new Error(`${path} → ${res.status}`);
  return body;
}

/** === 깊은 비교 — 다른 곳의 경로를 모은다 */
function diff(a, b, p, out) {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return out.push(`${p}: 배열 아님`);
    if (a.length !== b.length) out.push(`${p}: 길이 ${a.length} ≠ ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) diff(a[i], b[i], `${p}[${i}]`, out);
    return;
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[k], b[k], `${p}.${k}`, out);
    return;
  }
  if (a !== b) out.push(`${p}: 기대 ${JSON.stringify(a)} ≠ 서버 ${JSON.stringify(b)}`);
}

const NUM_KEYS = ["weight", "stackHeight", "drop", "price"];

/** reference 로 만든 기대 응답 — 서버 응답과 같은 모양 */
function expectCompare(all, ids, cols) {
  const byId = new Map(all.map((s) => [s.id, s]));
  const pops = Object.fromEntries(NUM_KEYS.map((k) => [k, ref.population(all, k)]));
  const fields = Object.fromEntries(NUM_KEYS.map((k) => [k, { n: pops[k].length, values: [...pops[k]].sort((x, y) => x - y) }]));
  const shoes = ids.map((id) => {
    const s = byId.get(id);
    const row = { id };
    for (const k of NUM_KEYS) {
      const v = ref.numValue(s, k);
      const cell = { value: v ?? null };
      if (v != null) {
        const r = ref.rankIn(pops[k], v);
        Object.assign(cell, { order: r.order, band: r.band, word: ref.BAND_WORD[k][r.band] });
      }
      if (k === "weight") cell.converted = ref.isConverted(s);
      row[k] = cell;
    }
    return row;
  });
  return cols ? { cols, fields, shoes } : { fields, shoes };
}

const ANSWERS = {
  purpose: ["조깅·회복주", "템포·인터벌", "LSD·장거리", "레이스", "트레일"],
  width: ["넓음", "보통", "unknown"],
  stability: ["안정화", "중립화", "중립화-outer", "unknown"],
  cushion: ["high", "mid", "low", "unknown"],
  price: ["low", "mid", "high", "unknown"],
};
const combos = [{}];
for (const [k, vs] of Object.entries(ANSWERS)) combos.splice(0, combos.length, ...combos.flatMap((c) => vs.map((v) => ({ ...c, [k]: v }))));

async function round() {
  const all = await get("/api/shoes");
  const bad = [];
  let compared = 0;
  // 비교 — pick
  for (const s of all) {
    const cols = ref.autofill(s.id, all);
    const got = await get(`/api/compare?pick=${s.id}`, "compare");
    const out = [];
    diff(expectCompare(all, cols.map((c) => c.id), cols), got, `compare?pick=${s.id}`, out);
    bad.push(...out);
    compared++;
  }
  // 비교 — ids(다섯 켤레씩, id 순)
  for (let i = 0; i < all.length; i += 5) {
    const ids = all.slice(i, i + 5).map((s) => s.id);
    const got = await get(`/api/compare?ids=${ids.join(",")}`, "compare");
    const out = [];
    diff(expectCompare(all, ids, null), got, `compare?ids=${ids.join(",")}`, out);
    bad.push(...out);
    compared++;
  }
  // 추천 — 960
  for (const a of combos) {
    const q = new URLSearchParams(a).toString();
    const got = await get(`/api/recommend?${q}`, "recommend");
    const out = [];
    diff({ results: recommend(all, a) }, got, `recommend?${q}`, out);
    bad.push(...out);
  }
  const after = await get("/api/shoes");
  return { changed: JSON.stringify(after) !== JSON.stringify(all), bad, n: { shoes: all.length, compare: compared, recommend: combos.length } };
}

let r;
for (let i = 1; i <= 3; i++) {
  times.compare.length = 0; times.recommend.length = 0;
  r = await round();
  if (!r.changed) break;
  console.log(`대조 중 /api/shoes 가 바뀌었다(찜 · 평점) — 다시(${i}/3)`);
}
const q = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1) : "-"; };
console.log(`대상 ${BASE} — 신발 ${r.n.shoes} · 비교 호출 ${r.n.compare} · 추천 조합 ${r.n.recommend}`);
console.log(`응답 시간(ms, 대조 스크립트에서 잰 왕복) — compare 중앙 ${q(times.compare, 0.5)} · 95% ${q(times.compare, 0.95)} · 최대 ${q(times.compare, 1)} / recommend 중앙 ${q(times.recommend, 0.5)} · 95% ${q(times.recommend, 0.95)} · 최대 ${q(times.recommend, 1)}`);
if (r.changed) { console.log("세 번 모두 대조 중에 목록이 바뀌었다 — 결과를 믿을 수 없다"); process.exit(2); }
if (r.bad.length) {
  console.log(`불일치 ${r.bad.length}곳 — 처음 ${Math.min(MAX_SHOW, r.bad.length)}곳:`);
  r.bad.slice(0, MAX_SHOW).forEach((b) => console.log("  " + b));
  process.exit(1);
}
console.log("불일치 0 — 비교 · 추천 모두 기준 사본(reference/)과 같다");
