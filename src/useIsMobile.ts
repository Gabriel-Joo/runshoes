import { useEffect, useState } from "react";

/** 화면 폭 구간인가 — 기본은 휴대폰(767px 이하, CSS 의 모바일 구간). 호버 대신 탭 · 시트로 바꿀 때 쓴다 */
export function useIsMobile(query = "(max-width: 767px)"): boolean {
  const [hit, setHit] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setHit(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return hit;
}
