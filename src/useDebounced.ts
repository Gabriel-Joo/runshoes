import { useEffect, useState } from "react";

/** 입력이 ms 동안 멈추면 값을 넘긴다 — 검색창이 글자마다 서버를 부르지 않게 */
export function useDebounced<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}
