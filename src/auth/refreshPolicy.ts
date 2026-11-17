/**
 * refresh 가 실패했을 때 무엇을 할지 — session.ts 의 refresh() 가 쓴다. 화면 · fetch 에 기대지 않아 node 시험으로 본다(tests/refreshPolicy.test.ts)
 *
 * - 401 · 403: 서버가 「이 refresh 토큰으로는 안 된다」고 답한 것 — 로그아웃시킨다
 * - 그 밖(네트워크 오류 = 0, 5xx, 429 등): 서버가 잠깐 못 받은 것일 수 있다 — 세션을 그대로 두고 다시 보낸다
 *
 * 다시 보내는 간격은 1초, 3초(모두 세 번, 기다림 합 4초):
 * - 롤링 배포 때 Pod 하나가 빠지고 ingress 가 502 · 503 을 내는 틈은 보통 몇 초다 — 4초 안에 대개 다른 Pod 로 간다
 * - 서버는 회전된 refresh 토큰을 10초 안에 다시 쓰면 동시 요청으로 받아 주고, 10초가 지나면 그 계열을 모두 회수한다(AuthService).
 *   첫 응답이 서버에서는 처리됐는데 오는 길에 사라졌으면 다시 보내는 것이 곧 재사용이므로, 마지막 재시도가 10초 안에 나가야 한다
 * - 더 오래 기다리면 첫 화면(AuthContext 의 ready)이 그만큼 늦게 뜬다
 */
export const RETRY_DELAYS_MS: readonly number[] = [1000, 3000];

export type RefreshResult = "ok" | "loggedOut" | "unavailable";

/** 실패한 응답의 상태(네트워크 오류는 0) → 로그아웃인가 */
export const isAuthRejection = (status: number) => status === 401 || status === 403;

/**
 * attempt 를 부르고, 실패가 로그아웃할 까닭(401 · 403)이 아니면 delays 대로 기다려 다시 부른다.
 * attempt 는 성공하면 값을, 실패하면 { status } 를 던진다
 */
export async function retryRefresh<T>(
  attempt: () => Promise<T>,
  delays: readonly number[] = RETRY_DELAYS_MS,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ result: "ok"; value: T } | { result: "loggedOut" | "unavailable" }> {
  for (let i = 0; ; i++) {
    try {
      return { result: "ok", value: await attempt() };
    } catch (e) {
      const status = typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : 0;
      if (isAuthRejection(status)) return { result: "loggedOut" };
      if (i >= delays.length) return { result: "unavailable" };
      await sleep(delays[i]);
    }
  }
}
