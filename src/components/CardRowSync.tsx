import { useEffect } from "react";

// 같은 줄에 뜬 카드끼리 모델명 · 요약 칸 높이를 맞춘다(2026-11-09 사용자 — "세 줄 고정은 빈 줄이 생긴다, 한 줄에 뜬 카드끼리만").
//   세 개가 한 줄이면 셋 중 가장 긴 것에, 두 개면 둘끼리, 혼자면 제 길이대로 — 아래 스펙 · 평점 줄이 그 줄 안에서 같은 높이에 온다.
//   카드가 페이지마다 다른 틀(목록 그리드 · 베스트 · 맞춤추천의 감싼 칸)에 들어 있어 CSS subgrid 로는 닿지 않는다 — 화면에 뜬 위치(top)로 줄을 가른다.
const PARTS = [".card__model", ".card__summary"];

function sync() {
  const cards = Array.from(document.querySelectorAll<HTMLElement>(".card"));
  if (!cards.length) return;
  for (const sel of PARTS) {
    const els = cards.map((c) => c.querySelector<HTMLElement>(sel));
    els.forEach((el) => el && (el.style.minHeight = ""));
    // 앞 칸(모델명)을 맞춘 뒤에 줄을 다시 읽는다 — 카드 top 은 그대로라 줄 구성은 같다
    const rows = new Map<number, HTMLElement[]>();
    cards.forEach((card, i) => {
      const el = els[i];
      if (!el || card.offsetParent === null) return; // 숨은 카드
      const top = Math.round(card.getBoundingClientRect().top + window.scrollY);
      const row = rows.get(top) ?? [];
      row.push(el);
      rows.set(top, row);
    });
    for (const row of rows.values()) {
      if (row.length < 2) continue;
      const max = Math.max(...row.map((el) => el.getBoundingClientRect().height));
      row.forEach((el) => (el.style.minHeight = `${max}px`));
    }
  }
}

function CardRowSync() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(sync);
    };
    schedule();
    // 폭이 바뀌면 한 줄의 카드 수와 줄바꿈이 바뀐다
    const ro = new ResizeObserver(schedule);
    ro.observe(document.documentElement);
    // 목록이 바뀌면(필터 · 정렬 · 페이지 이동 · 데이터 도착) 다시 — 우리가 바꾸는 style 은 attributes 라 보지 않는다
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
    document.fonts?.ready.then(schedule);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
    };
  }, []);
  return null;
}

export default CardRowSync;
