import { useState } from "react";
import { demoBlocked } from "../auth/demoAdmin";

/** 여러 개 고르기 — 목록이 바뀌면 사라진 id 는 저절로 빠진다(마이페이지 · 관리자 페이지) */
export function useSelection(ids: number[]) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const live = new Set([...picked].filter((id) => ids.includes(id)));
  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = ids.length > 0 && ids.every((id) => live.has(id));
  const toggleAll = () => setPicked(all ? new Set() : new Set(ids));
  return { picked: live, toggle, all, toggleAll, keep: (rest: number[]) => setPicked(new Set(rest)) };
}

/**
 * 한꺼번에 — 기존 API 를 하나씩 차례로 부른다(새 API 없음, 활동 로그도 한 건씩). 데모 관리자 403 이면 거기서 멈춘다.
 * 남은(실패한) id 와 화면 문구를 돌려준다. goneIsDone — 404(이미 없다)도 한 것으로 센다(리뷰 삭제: 다른 탭 · 관리자가 먼저 지웠다, 2026-11-01 사용자).
 *   찜 · 도움 취소는 그대로 — 숨긴 신발의 404 는 찜이 남아 있을 수 있다
 */
export async function runEach(ids: number[], call: (id: number) => Promise<Response | null>, what: string, words: { did: string; couldNot: string }, goneIsDone = false) {
  const failed: number[] = [];
  let done = 0;
  for (let i = 0; i < ids.length; i++) {
    const res = await call(ids[i]).catch(() => null);
    const blocked = res && (await demoBlocked(res));
    if (blocked) return { failed: [...failed, ...ids.slice(i)], message: blocked };
    if (res?.ok || (goneIsDone && res?.status === 404)) done++;
    else failed.push(ids[i]);
  }
  const message = failed.length === 0 ? `${what} ${done}개를 ${words.did}.` : `${ids.length}개 중 ${done}개를 ${words.did}. ${failed.length}개는 ${words.couldNot}.`;
  return { failed, message };
}
