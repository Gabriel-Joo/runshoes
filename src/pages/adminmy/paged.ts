import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../../auth/session";

/** 관리 API 의 서버 페이지 나누기 응답(api/AdminPage) */
export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
  /** 회원 목록만 — 가입한 해들(최근 먼저, 연도 고르기 칸) */
  years?: number[];
}

/**
 * 관리자 마이페이지의 목록 받기 — path(쿼리까지)가 바뀌면 다시 받는다. reload() 는 같은 주소를 다시(숨기기 · 되살리기 뒤).
 * 실패하면 data 는 null, error 에 문구. 늦게 온 앞 응답이 새 응답을 덮지 않게 이전 요청은 끊는다
 */
export function usePaged<T>(path: string) {
  const [data, setData] = useState<Paged<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    apiFetch(path, { signal: ctrl.signal })
      .then(async (res) => {
        if (res.ok) {
          setData(await res.json());
          setError(null);
          return;
        }
        const body = await res.json().catch(() => null);
        setData(null);
        setError(typeof body?.message === "string" ? body.message : "목록을 불러오지 못했어요. 잠시 뒤 다시 해 주세요.");
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError("서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.");
      });
    return () => ctrl.abort();
  }, [path, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, error, reload };
}

/**
 * 거르기 · 쪽 번호를 주소(?tab=…&from=…&page=…)에 둔다 — 새로 고침 · 뒤로 가기에도 같은 자리(신발 관리 탭과 같은 방식).
 * set 은 바꾼 칸을 넣고 page 를 1 로 되돌린다(page 를 직접 바꿀 때만 그대로)
 */
export function useQuery() {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? "";
  const set = (patch: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    if (!("page" in patch)) p.delete("page");
    setParams(p, { replace: true });
  };
  return { get, set };
}

/** 쿼리 문자열 — 빈 칸은 뺀다 */
export function qs(o: Record<string, string | number | undefined | null>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** 시각 — 브라우저 시간대로 YYYY.MM.DD HH:mm(관리 화면의 수정 이력과 같은 방식). 없으면 "" */
export function when(iso: string | null | undefined, withTime = true) {
  if (!iso) return "";
  const d = new Date(iso);
  const p2 = (n: number) => String(n).padStart(2, "0");
  const day = `${d.getFullYear()}.${p2(d.getMonth() + 1)}.${p2(d.getDate())}`;
  return withTime ? `${day} ${p2(d.getHours())}:${p2(d.getMinutes())}` : day;
}
