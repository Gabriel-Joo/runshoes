// refresh 실패 처리(src/auth/refreshPolicy.ts) — npm test(tsc 로 옮긴 뒤 node --test). 기다림은 가짜 sleep 으로 센다
import { test } from "node:test";
import assert from "node:assert/strict";
import { RETRY_DELAYS_MS, isAuthRejection, retryRefresh } from "../src/auth/refreshPolicy.ts";

/** status 차례대로 실패하다가(없으면) 성공하는 attempt — 부른 횟수와 기다린 간격을 남긴다 */
function scripted(statuses: number[]) {
  const log = { calls: 0, slept: [] as number[] };
  const attempt = async () => {
    const s = statuses[log.calls++];
    if (s === undefined) return "body";
    throw s === 0 ? new TypeError("network") : { status: s };
  };
  const sleep = async (ms: number) => {
    log.slept.push(ms);
  };
  return { log, attempt, sleep };
}

test("401 · 403 만 로그아웃할 까닭", () => {
  assert.equal(isAuthRejection(401), true);
  assert.equal(isAuthRejection(403), true);
  for (const s of [0, 400, 429, 500, 502, 503, 504]) assert.equal(isAuthRejection(s), false, String(s));
});

test("첫 번에 성공하면 기다리지 않는다", async () => {
  const { log, attempt, sleep } = scripted([]);
  assert.deepEqual(await retryRefresh(attempt, RETRY_DELAYS_MS, sleep), { result: "ok", value: "body" });
  assert.deepEqual(log, { calls: 1, slept: [] });
});

test("401 · 403 은 다시 보내지 않고 로그아웃", async () => {
  for (const s of [401, 403]) {
    const { log, attempt, sleep } = scripted([s]);
    assert.deepEqual(await retryRefresh(attempt, RETRY_DELAYS_MS, sleep), { result: "loggedOut" });
    assert.deepEqual(log, { calls: 1, slept: [] });
  }
});

test("502 · 네트워크 오류 뒤 성공하면 세션을 이어 간다", async () => {
  const { log, attempt, sleep } = scripted([502, 0]);
  assert.deepEqual(await retryRefresh(attempt, RETRY_DELAYS_MS, sleep), { result: "ok", value: "body" });
  assert.deepEqual(log, { calls: 3, slept: [1000, 3000] });
});

test("끝까지 503 이면 로그아웃이 아니라 unavailable", async () => {
  const { log, attempt, sleep } = scripted([503, 503, 503, 503]);
  assert.deepEqual(await retryRefresh(attempt, RETRY_DELAYS_MS, sleep), { result: "unavailable" });
  assert.deepEqual(log, { calls: 3, slept: [1000, 3000] });
});

test("재시도 중 401 이 오면 그때 로그아웃", async () => {
  const { log, attempt, sleep } = scripted([502, 401]);
  assert.deepEqual(await retryRefresh(attempt, RETRY_DELAYS_MS, sleep), { result: "loggedOut" });
  assert.deepEqual(log, { calls: 2, slept: [1000] });
});

test("기다림 합은 서버의 재사용 창 10초보다 짧다", () => {
  assert.ok(RETRY_DELAYS_MS.reduce((a, b) => a + b, 0) < 10_000);
});
