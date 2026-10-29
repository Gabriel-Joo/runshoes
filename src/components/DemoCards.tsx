import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { DemoAccount } from "../auth/session";

const INTERVAL_MS = 3500;

/**
 * 한 화면에 보이는 카드 수 — 카드 폭(162px, 2026-10-30 사용자 "지금이 좋다")은 그대로 두고 보이는 칸 폭에 들어가는 만큼, 5장까지.
 * 데스크톱 5장(시드 30명이 6번에 한 바퀴), 휴대폰은 2장(조금 좁아진다)
 */
const CARD_WIDTH = 162;
const MAX_PER_VIEW = 5;
const MIN_PER_VIEW = 2;   // 휴대폰 — 한 장이면 카드가 칸 폭만큼 늘어난다

function usePerView() {
  const ref = useRef<HTMLDivElement>(null);
  const [per, setPer] = useState(MAX_PER_VIEW);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setPer(Math.max(MIN_PER_VIEW, Math.min(MAX_PER_VIEW, Math.floor(e.contentRect.width / CARD_WIDTH)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, per] as const;
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * 로그인 화면의 체험 카드(2026-10-30 사용자) — 시드 계정 전부를 슬라이드로 돌린다. 마우스를 올리거나 카드에 초점이 가면 멈추고, 화살표로 넘긴다.
 * 데모 관리자는 슬라이드 밖에 늘 보인다. 카드를 누르면 바로 로그인(onPick)
 */
function DemoCards({ cards, busy, onPick }: { cards: DemoAccount[]; busy: boolean; onPick: (c: DemoAccount) => void }) {
  const seeds = cards.filter((c) => c.role === "USER");
  const admin = cards.find((c) => c.role === "DEMO_ADMIN");
  const [viewportRef, per] = usePerView();
  const last = Math.max(seeds.length - per, 0);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const at = Math.min(index, last);   // 화면 폭이 바뀌어 보이는 수가 달라져도 끝을 넘지 않게

  const go = (d: number) => setIndex((i) => {
    const cur = Math.min(i, last);
    return cur + d > last ? 0 : cur + d < 0 ? last : cur + d;   // 끝에서 처음으로 돈다
  });

  useEffect(() => {
    if (paused || last === 0 || reducedMotion()) return;
    const t = setInterval(() => go(1), INTERVAL_MS);
    return () => clearInterval(t);
    // go 는 last 만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, last]);

  const card = (c: DemoAccount) => (
    <button key={c.id} className={`auth__card ${c.role === "DEMO_ADMIN" ? "is-admin" : ""}`} onClick={() => onPick(c)} disabled={busy}>
      <strong>{c.nickname}</strong>
      <span>{c.role === "DEMO_ADMIN" ? "관리 화면 · 보기 전용" : `리뷰 ${c.reviewCount} · 찜 ${c.likeCount}`}</span>
    </button>
  );

  return (
    <>
      {seeds.length > 0 && (
        <div
          className="auth__carousel"
          role="region"
          aria-roledescription="carousel"
          aria-label="체험 사용자 계정"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setPaused(false)}
        >
          <button className="auth__arrow" onClick={() => go(-1)} aria-label="이전 계정">
            ‹
          </button>
          <div className="auth__viewport" ref={viewportRef}>
            <div className="auth__track" style={{ "--per": per, transform: `translateX(-${(at * 100) / per}%)` } as CSSProperties}>
              {seeds.map((c) => (
                <div className="auth__slide" key={c.id}>
                  {card(c)}
                </div>
              ))}
            </div>
          </div>
          <button className="auth__arrow" onClick={() => go(1)} aria-label="다음 계정">
            ›
          </button>
        </div>
      )}
      {admin && <div className="auth__admincard">{card(admin)}</div>}
    </>
  );
}

export default DemoCards;
