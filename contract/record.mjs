#!/usr/bin/env node
// 시나리오를 차례로 보내 응답(상태코드·헤더·본문)을 파일로 남긴다. Node 20, 의존성 없음.
//
//   node contract/record.mjs --base http://192.168.122.240 --host runshoes.ronanlab.dev --out contract/baseline/node
//   node contract/record.mjs --base http://127.0.0.1:3101 --set summary --mock http://127.0.0.1:3109 --out contract/baseline/node-summary
//   --read-only: 읽기 시나리오(id 30 미만)만 — 되돌리기 어려운 곳(전환 뒤 운영 MySQL)에서
//
// --base 로 붙고 Host 헤더만 --host 로 바꾼다 — Cloudflare 를 거치지 않고 ingress 로 바로 간다(Location 등 헤더가 Cloudflare 에 바뀌지 않게).
// 파일: <out>/<id>.json 하나씩 + <out>/index.json(언제·어디·무엇으로). 비교는 contract/diff.mjs.
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { SCENARIOS, SUMMARY_SCENARIOS } from "./scenarios.mjs";

const argv = process.argv.slice(2);
const readOnly = argv.includes("--read-only");
const args = Object.fromEntries(
  argv.filter((v) => v !== "--read-only").reduce((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1]]] : a), []),
);
const base = new URL(args.base ?? "http://127.0.0.1:3000");
const hostHeader = args.host ?? base.host;
const out = args.out ?? "contract/baseline/node";
const set = (args.set === "summary" ? SUMMARY_SCENARIOS : SCENARIOS).filter((sc) => !readOnly || sc.id < "30");
const vars = { mock: args.mock ?? "http://127.0.0.1:3109" };

// {{이름}} → 문자열, {{이름:num}} → 숫자(JSON 본문의 shoeId 처럼 타입이 중요한 곳)
const fill = (v) => {
  if (typeof v === "string") {
    const m = v.match(/^\{\{(\w+):num\}\}$/);
    if (m) return Number(vars[m[1]]);
    return v.replace(/\{\{(\w+)\}\}/g, (_, k) => {
      if (!(k in vars)) throw new Error(`값이 없다: {{${k}}}`);
      return String(vars[k]);
    });
  }
  if (Array.isArray(v)) return v.map(fill);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, fill(x)]));
  return v;
};

function send(method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request(url, { method, headers, timeout: 15000 }, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, raw: Buffer.concat(chunks) }));
    });
    req.on("timeout", () => req.destroy(new Error("timeout 15s")));
    req.on("error", reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const get = (obj, p) => p.split(".").reduce((o, k) => o?.[k], obj);

fs.mkdirSync(out, { recursive: true });
const index = { recordedAt: new Date().toISOString(), base: base.href, host: hostHeader, set: args.set ?? "main", readOnly, note: args.note ?? "", scenarios: [] };

for (const sc of set) {
  const target = sc.url ? new URL(fill(sc.url)) : new URL(fill(sc.path), base);
  const external = Boolean(sc.url); // mock 제어용 — Host 를 바꾸지 않는다
  const headers = { ...(external ? {} : { Host: hostHeader }), ...(sc.headers ?? {}) };
  const bodyObj = sc.body === undefined ? undefined : fill(sc.body);
  const bodyStr = bodyObj === undefined ? undefined : JSON.stringify(bodyObj);
  if (bodyStr !== undefined) headers["Content-Length"] = Buffer.byteLength(bodyStr);

  const res = await send(sc.method, target, headers, bodyStr);
  const ctype = String(res.headers["content-type"] ?? "");
  const text = res.raw.toString("utf8");
  let body;
  if (ctype.includes("json") || /^\s*[[{]/.test(text)) {
    try { body = JSON.parse(text); } catch { body = { $text: text }; }
  } else {
    body = { $sha256: crypto.createHash("sha256").update(res.raw).digest("hex"), $length: res.raw.length, $head: text.slice(0, 120) };
  }
  for (const [k, p] of Object.entries(sc.capture ?? {})) vars[k] = get({ body, headers: res.headers }, p);

  const rec = {
    id: sc.id, plan: sc.plan ?? null, name: sc.name, contract: sc.contract !== false && !external,
    request: { method: sc.method, path: target.pathname + target.search, headers: sc.headers ?? {}, body: bodyObj ?? null },
    response: { status: res.status, headers: res.headers, body },
  };
  fs.writeFileSync(path.join(out, `${sc.id}.json`), JSON.stringify(rec, null, 2) + "\n");
  index.scenarios.push({ id: sc.id, name: sc.name, status: res.status });
  console.log(`${sc.id} ${sc.method.padEnd(7)} ${rec.request.path.padEnd(42)} → ${res.status}`);
}
index.vars = vars;
fs.writeFileSync(path.join(out, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`→ ${out} (${set.length}건)`);
