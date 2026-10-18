#!/usr/bin/env node
// 고정 응답 Ollama — 요약(summary) 시나리오를 GPU 없이 녹화·비교하려고 쓴다. 의존성 없음.
//   node contract/mock-ollama.mjs 3109
// POST /api/generate → {"response": "<고정 JSON 문자열>"} (실패 모드면 500)
// 제어: POST /__reset(호출 수 0, 정상 모드) · POST /__fail(500 모드) · GET /__calls · GET /__last(마지막 요청 본문)
import http from "node:http";

const port = Number(process.argv[2] ?? 3109);
let calls = 0, fail = false, last = null;
const FIXED = '{"positive": "쿠션이 좋다는 의견이 많습니다.", "negative": "발볼이 좁다는 의견이 있습니다."}';

http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const send = (code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.url === "/__reset") { calls = 0; fail = false; last = null; return send(200, { ok: true }); }
    if (req.url === "/__fail") { fail = true; return send(200, { ok: true }); }
    if (req.url === "/__calls") return send(200, { calls });
    if (req.url === "/__last") return send(200, { last });
    if (req.url === "/api/generate" && req.method === "POST") {
      calls++; last = JSON.parse(body || "{}");
      return fail ? send(500, { error: "mock failure" }) : send(200, { model: last.model, response: FIXED, done: true });
    }
    send(404, {});
  });
}).listen(port, "127.0.0.1", () => console.log(`mock-ollama :${port}`));
