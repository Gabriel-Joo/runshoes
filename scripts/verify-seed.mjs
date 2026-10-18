#!/usr/bin/env node
// Flyway 가 넣은 MySQL 데이터가 db.json 과 같은지 — Phase 1 게이트(API 가 없어 contract/diff.mjs 대신).
//   docker exec -i runshoes-mysql-dev mysql --default-character-set=utf8mb4 -urunshoes -prunshoes -N -B runshoes < scripts/verify-seed.sql | node scripts/verify-seed.mjs
// 줄마다 "<table>\t<JSON 객체>"(verify-seed.sql). 비교 규칙은 contract/diff.mjs 와 같다:
//   createdAt 은 Date.parse 등가, 숫자는 1e-9, liked 없음 = false. 키가 없는 것(reviews.likeCount 2건)은 NULL 이어야 한다.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = JSON.parse(fs.readFileSync(path.join(root, "db.json"), "utf8"));
const got = { shoes: [], reviews: [], terms: [] };
for (const line of fs.readFileSync(0, "utf8").split("\n").filter(Boolean)) {
  const [t, j] = line.split("\t");
  got[t].push(JSON.parse(j));
}

let bad = 0;
const same = (a, b, k) => {
  if (k === "createdAt") return Date.parse(a) === Date.parse(b);
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-9;
  return JSON.stringify(a) === JSON.stringify(b);
};
for (const t of ["shoes", "reviews", "terms"]) {
  const want = db[t], have = got[t];
  if (want.length !== have.length) { console.log(`FAIL ${t}: 행 ${want.length} ≠ ${have.length}`); bad++; continue; }
  let diffs = 0;
  want.forEach((w, i) => {
    const h = have[i];
    for (const k of new Set([...Object.keys(w), ...Object.keys(h)])) {
      let wv = w[k], hv = h[k];
      if (k === "liked") wv = wv ?? false;
      if (k === "likeCount" && !(k in w)) wv = null;   // 키 없음 → NULL 로 들어가야 한다(응답에서는 다시 키를 뺀다)
      if (!same(wv, hv, k)) { if (diffs++ < 5) console.log(`  ${t}[${i}] id=${w.id} ${k}: ${JSON.stringify(wv)} ≠ ${JSON.stringify(hv)}`); }
    }
  });
  console.log(`${diffs ? "FAIL" : "PASS"} ${t}: ${have.length}행, 다른 필드 ${diffs}`);
  if (diffs) bad++;
}
process.exit(bad ? 1 : 0);
