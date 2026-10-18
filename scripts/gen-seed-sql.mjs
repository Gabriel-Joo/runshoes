#!/usr/bin/env node
// db.json → backend/src/main/resources/db/migration/V2__seed_data.sql (Node, 의존성 없음)
//   node scripts/gen-seed-sql.mjs
// 산출물을 커밋한다. Flyway 가 한 번 적용한 뒤에는 다시 만들지 않는다(checksum — 바꾸면 기동이 실패한다).
// 규칙(V1__schema.sql 과 짝):
//   - id 는 db.json 그대로(terms 의 12 중복도 그대로 — row_no 가 순서를 지킨다)
//   - createdAt: "YYYY-MM-DD" → 'YYYY-MM-DD 00:00:00.000'(UTC 자정), ISO → UTC 로 'YYYY-MM-DD HH:MM:SS.mmm'
//   - reviews: likeCount 키가 없으면 NULL, liked 키가 없으면 FALSE
//   - 문자열: \ → \\, ' → '' (MySQL 기본 sql_mode 는 백슬래시를 이스케이프로 읽는다)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const db = JSON.parse(fs.readFileSync(path.join(root, "db.json"), "utf8"));
const out = path.join(root, "backend/src/main/resources/db/migration/V2__seed_data.sql");

const str = (v) => `'${String(v).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
const val = (v) => (v === null || v === undefined ? "NULL" : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : typeof v === "number" ? String(v) : str(v));
const ts = (s) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `'${s} 00:00:00.000'`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`createdAt 을 못 읽는다: ${s}`);
  return `'${d.toISOString().replace("T", " ").replace("Z", "")}'`;
};
const insert = (table, cols, rows) =>
  `INSERT INTO ${table} (${cols.join(", ")}) VALUES\n` + rows.map((r) => `  (${r.join(", ")})`).join(",\n") + ";\n";

const shoes = db.shoes.map((s) => [
  val(s.id), val(s.brand), val(s.model), val(s.purpose), val(s.stability), val(s.midsole), val(s.weight), val(s.drop),
  val(s.stackHeight), val(s.width), val(s.wideAvailable), val(s.carbon), val(s.price), val(s.image), str(JSON.stringify(s.images)),
  val(s.summary), val(s.description), val(s.rating), val(s.reviewCount), val(s.likeCount), val(s.liked),
]);
const reviews = db.reviews.map((r) => [
  val(r.id), val(r.shoeId), val(r.author), val(r.rating), val(r.content), ts(r.createdAt),
  "likeCount" in r ? val(r.likeCount) : "NULL", "liked" in r ? val(r.liked) : "FALSE",
]);
const terms = db.terms.map((t) => [val(t.id), val(t.key), val(t.name), val(t.short), val(t.description)]);

const sql = [
  `-- 생성: scripts/gen-seed-sql.mjs ← db.json (${db.shoes.length} shoes · ${db.reviews.length} reviews · ${db.terms.length} terms). 손으로 고치지 않는다.`,
  `-- 적용된 뒤에는 다시 만들지 않는다(Flyway checksum). 데이터를 바꾸려면 V3 이후로.`,
  "",
  insert("shoes", ["id", "brand", "model", "purpose", "stability", "midsole", "weight", "drop_mm", "stack_height", "width",
    "wide_available", "carbon", "price", "image", "images", "summary", "description", "rating", "review_count", "like_count", "liked"], shoes),
  insert("reviews", ["id", "shoe_id", "author", "rating", "content", "created_at", "like_count", "liked"], reviews),
  "-- row_no 는 AUTO_INCREMENT — db.json 순서대로 1..13. id 12 가 둘(weight, outsole)인 것은 그대로다",
  insert("terms", ["id", "term_key", "name", "short", "description"], terms),
].join("\n");

fs.writeFileSync(out, sql);
console.log(`→ ${path.relative(root, out)} (shoes ${shoes.length}, reviews ${reviews.length}, terms ${terms.length})`);
