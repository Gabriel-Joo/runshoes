#!/usr/bin/env node
// 시나리오를 차례로 보내 응답(상태코드·헤더·본문)을 파일로 남긴다. Node 20, 의존성 없음.
//
//   node contract/record.mjs --base http://192.168.122.240 --host runshoes.ronanlab.dev --out contract/baseline/node
//   node contract/record.mjs --base http://127.0.0.1:3101 --set summary --mock http://127.0.0.1:3109 --out contract/baseline/node-summary
//   --set search: 검색 시나리오(Q01~, 전부 읽기) — 기준선은 Spring 녹화 contract/baseline/spring-search
//   --set v3 · summary-v3: 로그인(V3) 뒤 계약 — 기준선 contract/baseline/spring-v3 · spring-v3-summary. 비밀번호는 env 로
//     SEED_USER_PASSWORD · ADMIN_PASSWORD(앱을 띄울 때 준 값, contract/run-spring-local.sh 가 매번 새로 만든다)
//   --read-only: 읽기 시나리오(id 30 미만 · Q · R)만 — 되돌리기 어려운 곳(전환 뒤 운영 MySQL)에서
//
// 기록에는 비밀번호 · JWT · refresh 쿠키를 남기지 않는다(<가림>). 시나리오의 expect 와 상태코드가 다르면 표시하고 끝에 exit 1.
//
// --base 로 붙고 Host 헤더만 --host 로 바꾼다 — Cloudflare 를 거치지 않고 ingress 로 바로 간다(Location 등 헤더가 Cloudflare 에 바뀌지 않게).
// 파일: <out>/<id>.json 하나씩 + <out>/index.json(언제·어디·무엇으로). 비교는 contract/diff.mjs.
import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { SCENARIOS, SUMMARY_SCENARIOS, SEARCH_SCENARIOS, V3_SCENARIOS, AUTH_SCENARIOS, SUMMARY_V3_SCENARIOS, V4_SCENARIOS } from "./scenarios.mjs";

const argv = process.argv.slice(2);
const readOnly = argv.includes("--read-only");
const args = Object.fromEntries(
  argv.filter((v) => v !== "--read-only").reduce((a, v, i, all) => (v.startsWith("--") ? [...a, [v.slice(2), all[i + 1]]] : a), []),
);
const base = new URL(args.base ?? "http://127.0.0.1:3000");
const hostHeader = args.host ?? base.host;
const out = args.out ?? "contract/baseline/node";
const SETS = { main: SCENARIOS, summary: SUMMARY_SCENARIOS, search: SEARCH_SCENARIOS, v3: [...V3_SCENARIOS, ...AUTH_SCENARIOS], "summary-v3": SUMMARY_V3_SCENARIOS, v4: V4_SCENARIOS };
const set = SETS[args.set ?? "main"].filter((sc) => !readOnly || sc.id < "30" || /^[QR]/.test(sc.id));
const vars = { mock: args.mock ?? "http://127.0.0.1:3109", seedPassword: process.env.SEED_USER_PASSWORD, adminPassword: process.env.ADMIN_PASSWORD };
const SECRET_VARS = new Set(["seedPassword", "adminPassword"]);

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
// "cookie.runshoes_refresh" — Set-Cookie 의 값
const capture = (body, headers, p) => {
  if (!p.startsWith("cookie.")) return get({ body, headers }, p);
  const name = p.slice(7) + "=";
  const c = [].concat(headers["set-cookie"] ?? []).find((v) => v.startsWith(name));
  return c ? c.slice(name.length).split(";")[0] : undefined;
};
// 기록에 남기지 않는 것 — 비밀번호(요청), JWT(응답 accessToken · 다른 곳의 eyJ…), refresh 쿠키 값
const JWT = /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/;
const redact = (v, key) => {
  if (key && /password/i.test(key) && typeof v === "string") return "<가림>";
  if (typeof v === "string" && JWT.test(v)) return "<jwt>";
  if (Array.isArray(v)) return v.map((x) => redact(x));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redact(x, k)]));
  return v;
};
const redactCookies = (h) => (h["set-cookie"] ? { ...h, "set-cookie": [].concat(h["set-cookie"]).map((c) => c.replace(/^([^=]+)=[^;]*/, (m, n) => `${n}=${m.length > n.length + 1 ? "<가림>" : ""}`)) } : h);
let unexpected = 0;

fs.mkdirSync(out, { recursive: true });
const index = { recordedAt: new Date().toISOString(), base: base.href, host: hostHeader, set: args.set ?? "main", readOnly, note: args.note ?? "", scenarios: [] };

for (const sc of set) {
  const target = sc.url ? new URL(fill(sc.url)) : new URL(fill(sc.path), base);
  const external = Boolean(sc.url); // mock 제어용 — Host 를 바꾸지 않는다
  const headers = { ...(external ? {} : { Host: hostHeader }), ...fill(sc.headers ?? {}) };
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
  for (const [k, p] of Object.entries(sc.capture ?? {})) vars[k] = capture(body, res.headers, p);

  const rec = {
    id: sc.id, plan: sc.plan ?? null, name: sc.name, contract: sc.contract !== false && !external,
    ...(sc.expect ? { expect: sc.expect } : {}), ...(sc.volatile ? { volatile: sc.volatile } : {}),
    request: { method: sc.method, path: target.pathname + target.search, headers: sc.headers ?? {}, body: redact(sc.body === undefined ? null : sc.body) },
    response: { status: res.status, headers: redactCookies(res.headers), body: redact(body) },
  };
  if (sc.expect && sc.expect !== res.status) unexpected++;
  fs.writeFileSync(path.join(out, `${sc.id}.json`), JSON.stringify(rec, null, 2) + "\n");
  index.scenarios.push({ id: sc.id, name: sc.name, status: res.status });
  console.log(`${sc.id} ${sc.method.padEnd(7)} ${rec.request.path.padEnd(42)} → ${res.status}${sc.expect && sc.expect !== res.status ? `  ≠ 기대 ${sc.expect}` : ""}`);
}
index.vars = Object.fromEntries(Object.entries(vars).filter(([k, v]) => !SECRET_VARS.has(k) && !(typeof v === "string" && (JWT.test(v) || /^[\w-]{43}$/.test(v)))));
fs.writeFileSync(path.join(out, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`→ ${out} (${set.length}건)${unexpected ? ` — 기대와 다른 상태코드 ${unexpected}건` : ""}`);
if (unexpected) process.exit(1);
