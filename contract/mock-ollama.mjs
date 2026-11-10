#!/usr/bin/env node
// 고정 응답 Ollama — 요약(summary) 시나리오를 GPU 없이 녹화·비교하려고 쓴다. 의존성 없음.
//   node contract/mock-ollama.mjs 3109
// POST /api/generate → {"response": "<고정 JSON 문자열>"} (실패 모드면 500)
// 제어: POST /__reset(호출 수 0, 정상 모드, 지연 0) · POST /__fail(500 모드) · POST /__delay?ms=N(응답을 N ms 늦춤 — 요약 배치가 겹칠 때 · 도는 사이 리뷰 쓰기)
//       GET /__calls · GET /__last(마지막 요청 본문) · GET /__maxActive(동시에 받은 요청 수의 최대 — 배치는 1이어야 한다)
import http from "node:http";

const port = Number(process.argv[2] ?? 3109);
let calls = 0, fail = false, last = null, delay = 0, active = 0, maxActive = 0;
const FIXED = '{"positive": "쿠션이 좋다는 의견이 많습니다.", "negative": "발볼이 좁다는 의견이 있습니다."}';

http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.url === "/__reset") { calls = 0; fail = false; last = null; delay = 0; maxActive = 0; return send(200, { ok: true }); }
    if (req.url.startsWith("/__delay")) { delay = Number(new URL(req.url, "http://x").searchParams.get("ms") ?? 0); return send(200, { ok: true, delay }); }
    if (req.url === "/__maxActive") return send(200, { maxActive });
    if (req.url === "/__fail") { fail = true; return send(200, { ok: true }); }
    if (req.url === "/__calls") return send(200, { calls });
    if (req.url === "/__last") return send(200, { last });
    if (req.url === "/api/generate" && req.method === "POST") {
      calls++; last = JSON.parse(body || "{}");
      active++; maxActive = Math.max(maxActive, active);
      return setTimeout(() => { active--; fail ? send(500, { error: "mock failure" }) : send(200, { model: last.model, response: FIXED, done: true }); }, delay);
    }
    send(404, {});
  });
}).listen(port, "127.0.0.1", () => console.log(`mock-ollama :${port}`));
