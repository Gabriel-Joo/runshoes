import { useEffect, useState } from "react";

/**
 * 429 뒤 기다리는 시간 — 서버가 준 retryAfter(초) 동안 버튼을 끄고, 문구의 "N분"을 남은 시간으로 줄여 보인다.
 * 브라우저에 저장하지 않는다 — 새로고침하면 서버가 다시 알려 준다(docs/AUTH_RATELIMIT_DESIGN.md 5절)
 */
export function useCooldown() {
  const [until, setUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!until) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);

  const left = until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
  return {
    active: left > 0,
    /** 서버 문구의 "N분"을 남은 분(올림)으로 */
    message: (serverMessage: string) => serverMessage.replace(/\d+분/, `${Math.ceil(left / 60)}분`),
    start: (seconds: number) => {
      const t = Date.now();
      setNow(t);
      setUntil(t + seconds * 1000);
    },
  };
}
