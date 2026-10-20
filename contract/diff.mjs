#!/usr/bin/env node
// 녹화 두 벌을 비교한다 — Node 기준선 vs Spring. 시나리오마다 PASS/FAIL, 하나라도 FAIL 이면 exit 1.
//   node contract/diff.mjs contract/baseline/node contract/run/spring
//   node contract/diff.mjs --read-only contract/baseline/node contract/run/prod   (읽기 시나리오 id 30 미만 · Q 만)
//
// 정규화(실질 동등 허용) — docs/SPRING_MIGRATION_PLAN.md Phase 2:
//   createdAt 은 Date.parse 등가, 숫자는 1e-9, liked 부재 = false, 4 ≡ 4.0(JSON 숫자라 원래 같다)
//   객체 키 순서는 보지 않는다. 배열은 순서까지 본다(정렬 동점의 id 순이 계약이다)
// 헤더는 계약에 드는 것만 본다. Location 은 경로만(호스트·스킴은 붙는 길에 따라 바뀐다). Content-Type 은 미디어 타입만
// contract: false 인 시나리오(프런트 미사용 json-server 동작)와 HTML 본문 해시는 보고만 하고 FAIL 로 세지 않는다
import fs from "node:fs";
import path from "node:path";

const readOnly = process.argv.includes("--read-only");
const [a, b] = process.argv.slice(2).filter((v) => v !== "--read-only");
if (!a || !b) { console.error("usage: diff.mjs <기준선 디렉터리> <비교 디렉터리>"); process.exit(2); }

const HEADERS = ["content-type", "location", "cache-control", "access-control-allow-origin", "access-control-expose-headers",
  "access-control-allow-methods", "access-control-allow-headers", "x-total-count"];

const normHeader = (k, v) => {
  if (v === undefined) return undefined;
  if (k === "location") { try { return new URL(v, "http://x").pathname; } catch { return v; } }
  if (k === "content-type") return String(v).split(";")[0].trim().toLowerCase();
  if (k.startsWith("access-control-allow-") && k !== "access-control-allow-origin") return String(v).toUpperCase().split(",").map((s) => s.trim()).sort().join(",");
  return String(v);
};

const isDateKey = (k) => k === "createdAt";
function eq(x, y, p, diffs, key) {
  if (key && isDateKey(key) && typeof x === "string" && typeof y === "string") {
    if (Date.parse(x) !== Date.parse(y)) diffs.push(`${p}: ${x} ≠ ${y}`);
    return;
  }
  if (typeof x === "number" && typeof y === "number") { if (Math.abs(x - y) > 1e-9) diffs.push(`${p}: ${x} ≠ ${y}`); return; }
  if (Array.isArray(x) || Array.isArray(y)) {
    if (!Array.isArray(x) || !Array.isArray(y)) return diffs.push(`${p}: 배열 아님`);
    if (x.length !== y.length) diffs.push(`${p}: 길이 ${x.length} ≠ ${y.length}`);
    for (let i = 0; i < Math.min(x.length, y.length); i++) eq(x[i], y[i], `${p}[${i}]`, diffs);
    return;
  }
  if (x && y && typeof x === "object" && typeof y === "object") {
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
      let xv = x[k], yv = y[k];
      if (k === "liked") { xv = xv ?? false; yv = yv ?? false; }
      if (!(k in x) && k !== "liked") { diffs.push(`${p}.${k}: 기준선에 없음(${JSON.stringify(yv)})`); continue; }
      if (!(k in y) && k !== "liked") { diffs.push(`${p}.${k}: 비교본에 없음(기준선 ${JSON.stringify(xv)})`); continue; }
      eq(xv, yv, `${p}.${k}`, diffs, k);
    }
    return;
  }
  if (x !== y) diffs.push(`${p}: ${JSON.stringify(x)} ≠ ${JSON.stringify(y)}`);
}

const ids = fs.readdirSync(a).filter((f) => f.endsWith(".json") && f !== "index.json" && (!readOnly || f < "30" || f.startsWith("Q"))).sort();
let fail = 0, pass = 0, info = 0;
for (const f of ids) {
  const A = JSON.parse(fs.readFileSync(path.join(a, f)));
  const bf = path.join(b, f);
  if (!fs.existsSync(bf)) { console.log(`MISS ${A.id} ${A.name}`); fail++; continue; }
  const B = JSON.parse(fs.readFileSync(bf));
  const diffs = [];
  if (A.response.status !== B.response.status) diffs.push(`status ${A.response.status} ≠ ${B.response.status}`);
  for (const h of HEADERS) {
    const x = normHeader(h, A.response.headers[h]), y = normHeader(h, B.response.headers[h]);
    if (x !== y) diffs.push(`header ${h}: ${x} ≠ ${y}`);
  }
  if (A.response.body?.$sha256) {
    if (A.response.body.$sha256 !== B.response.body?.$sha256) diffs.push("(HTML 본문 다름 — 빌드마다 바뀌므로 참고만)");
  } else eq(A.response.body, B.response.body, "body", diffs);

  const real = diffs.filter((d) => !d.startsWith("(HTML"));
  const tag = !A.contract ? "INFO" : real.length ? "FAIL" : "PASS";
  if (tag === "FAIL") fail++; else if (tag === "PASS") pass++; else info++;
  console.log(`${tag} ${A.id} ${A.name}`);
  for (const d of diffs.slice(0, 8)) console.log(`     ${d}`);
  if (diffs.length > 8) console.log(`     … ${diffs.length - 8}건 더`);
}
console.log(`\nPASS ${pass} · FAIL ${fail} · INFO ${info}`);
process.exit(fail ? 1 : 0);
