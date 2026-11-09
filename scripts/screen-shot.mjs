// 헤드리스 크롬(CDP)으로 화면을 움직이며 캡처 · 넘침 검사 — node scripts/screen-shot.mjs plan.json
// 예시 plan: scripts/screen-shot.example.json. 쓰는 법 · 주의는 docs/08_compare.md 5절 "화면 점검 방식".
//
// plan: { width, height, mobile?, scale?, hideScrollbars?, out, steps: [...] }
//   스크롤바는 기본으로 켠다 — 숨기고 재면 스크롤바 폭(약 15px)만큼 넓게 재서 헤더 넘침을 놓쳤다(2026-11-09).
//   out 은 git 밖(세션 임시 폴더)으로 둔다. plan 에 비밀번호를 적었으면 그 plan 도 커밋하지 않는다.
// steps:
//   {go:url, ms?} {wait:ms} {eval:js, log?, ms?} {scrollTo:y}
//   {hover:selector, nth?, scrollBy?, ms?} {click:selector, nth?, scrollBy?, ms?} {type:text, ms?}
//   {overflow:label, skip?}  페이지가 옆으로 넘치는지 — 넘치면 오른쪽 끝을 넘은 요소 5개. skip 은 원래 가로로 넘기는 칸의 선택자(그 안은 빼고 센다)
//   {shot:name, full?}       out/name.png
// 크롬: playwright 의 chrome-headless-shell(CHROME 환경변수로 바꿀 수 있다)
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import WebSocket from "ws";

const plan = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const CHROME = process.env.CHROME
  ?? `${os.homedir()}/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell`;
const port = 9300 + Math.floor(Math.random() * 500);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "screen-shot-"));
const chrome = spawn(CHROME, ["--no-sandbox", ...(plan.hideScrollbars ? ["--hide-scrollbars"] : []), `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
if (plan.out) fs.mkdirSync(plan.out, { recursive: true });

const overflowJs = (skip) => `(() => {
  const d = document.documentElement;
  const out = [...document.querySelectorAll('body *')].filter((e) => {
    const r = e.getBoundingClientRect();
    return r.width && r.right > d.clientWidth + 1 && !(${JSON.stringify(skip ?? "")} && e.closest(${JSON.stringify(skip ?? "x")}));
  }).slice(0, 5).map((e) => (e.className.baseVal ?? e.className) + ' ' + Math.round(e.getBoundingClientRect().right));
  return 'sw ' + d.scrollWidth + ' cw ' + d.clientWidth + ' ' + (d.scrollWidth > d.clientWidth ? 'OVERFLOW ' + JSON.stringify(out) : 'ok');
})()`;

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  pending.set(i, { res, rej });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const logs = [];

try {
  let target;
  for (let t = 0; t < 50 && !target; t++) {
    await sleep(200);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((x) => x.type === "page"); } catch { /* 아직 */ }
  }
  if (!target) throw new Error(`크롬이 뜨지 않았다: ${CHROME}`);
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.on("open", r));
  ws.on("message", (m) => {
    const d = JSON.parse(m);
    if (d.id && pending.has(d.id)) { const p = pending.get(d.id); pending.delete(d.id); d.error ? p.rej(new Error(JSON.stringify(d.error))) : p.res(d.result); }
    if (d.method === "Runtime.exceptionThrown") logs.push("EXC " + JSON.stringify(d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text).slice(0, 300));
    if (d.method === "Runtime.consoleAPICalled" && ["error", "warning"].includes(d.params.type)) logs.push(d.params.type + " " + d.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 300));
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: plan.width, height: plan.height, deviceScaleFactor: plan.scale ?? 1, mobile: !!plan.mobile });
  if (plan.mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
  const center = async (sel, nth = 0) => ev(`(() => { const e = document.querySelectorAll(${JSON.stringify(sel)})[${nth}]; if (!e) return null; e.scrollIntoView({block: "center", behavior: "instant"}); const r = e.getBoundingClientRect(); return {x: r.x + Math.min(r.width/2, 30), y: r.y + Math.min(r.height/2, 12)}; })()`);
  for (const s of plan.steps) {
    if (s.go) { await send("Page.navigate", { url: s.go }); await sleep(s.ms ?? 2500); }
    else if (s.wait) await sleep(s.wait);
    else if (s.eval) { const v = await ev(s.eval); if (s.log) console.log(s.log, JSON.stringify(v)); await sleep(s.ms ?? 300); }
    else if (s.overflow) console.log(s.overflow, await ev(overflowJs(s.skip)));
    else if (s.scrollTo != null) { await ev(`window.scrollTo({top: ${s.scrollTo}, behavior: "instant"})`); await sleep(400); }
    else if (s.hover || s.click) {
      const p = await center(s.hover ?? s.click, s.nth ?? 0);
      if (!p) { console.log("없음:", s.hover ?? s.click); continue; }
      if (s.scrollBy) { await ev(`window.scrollBy(0, ${s.scrollBy})`); await sleep(300); p.y -= s.scrollBy; }
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
      if (s.click) {
        await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1 });
        await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1 });
      }
      await sleep(s.ms ?? 600);
    } else if (s.type) { await send("Input.insertText", { text: s.type }); await sleep(s.ms ?? 1200); }
    else if (s.shot) {
      const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: !!s.full, ...(s.full ? { clip: { x: 0, y: 0, width: plan.width, height: await ev("document.documentElement.scrollHeight"), scale: 1 } } : {}) });
      fs.writeFileSync(`${plan.out}/${s.shot}.png`, Buffer.from(shot.data, "base64"));
      console.log("shot", s.shot);
    }
  }
} catch (e) {
  console.error("ERR", e.message);
  process.exitCode = 1;
} finally {
  if (logs.length) console.log("LOGS\n" + logs.join("\n"));
  ws?.close();
  chrome.kill();
  fs.rmSync(profile, { recursive: true, force: true });
}
