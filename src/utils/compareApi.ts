/**
 * 비교 · 추천 계산은 서버가 한다(2026-11-10, 작업 3 — GET /api/compare · /api/recommend, docs/05_api_contract.md).
 * 화면은 받은 등수 · 밴드 · 말 · 점수 · 이유를 그리기만 한다. 신발 카드(사진 · 찜)는 /api/shoes 로 그린다.
 */
import { API } from "../api";
import type { Col, NumKey } from "./compare";

/** 칸 하나 — 등수를 말할 수 없으면(무게 기준 모름 · 값 없음) value 만 null */
export interface StatCell {
  value: number | null;
  order?: number;
  band?: "low" | "mid" | "high";
  word?: string;            // "가벼운 편" · "중간" · "무거운 편" …(서버가 정한다 — 화면과 챗봇이 같은 말)
  converted?: boolean;      // 무게만 — 270mm 로 환산한 값인가
}
export type StatRow = { id: number } & Record<NumKey, StatCell>;
export interface CompareStats {
  cols?: Col[];                                               // ?pick= 일 때 — 자동 채우기
  fields: Record<NumKey, { n: number; values: number[] }>;   // 모집단(오름차순) — 그래프 막대
  shoes: StatRow[];
}

export async function fetchCompare(q: { ids: number[] } | { pick: number }, signal?: AbortSignal): Promise<CompareStats> {
  const qs = "pick" in q ? `pick=${q.pick}` : `ids=${q.ids.join(",")}`;
  const res = await fetch(`${API}/compare?${qs}`, { signal });
  if (!res.ok) throw new Error(`compare ${res.status}`);
  return res.json();
}

export interface Reason {
  hit: boolean;
  text: string;
}
export interface RecommendResult {
  id: number;
  score: number;
  reasons: Reason[];
}

export async function fetchRecommend(answers: Record<string, string>, signal?: AbortSignal): Promise<RecommendResult[]> {
  const res = await fetch(`${API}/recommend?${new URLSearchParams(answers)}`, { signal });
  if (!res.ok) throw new Error(`recommend ${res.status}`);
  return (await res.json()).results;
}
