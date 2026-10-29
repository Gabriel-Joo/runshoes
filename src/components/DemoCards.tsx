import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { DemoAccount } from "../auth/session";
import Chevron from "./Chevron";

/**
 * 로그인 화면의 체험 카드(2026-10-30 사용자) — 시드 계정 전부가 2줄로 아주 천천히 한쪽으로 흐른다(구름처럼). 한 번에 4열 × 2줄 = 8장.
 * 마우스를 올리면 멈추고, 끌어서 넘기고, 화살표로 한 열씩 옮긴다. 끝없이 이어지게 목록을 두 번 이어 붙인다(뒤의 것은 화면 읽기 · 탭 순서에서 뺀다).
 * 데모 관리자 카드는 흐름 밖에 늘 보인다. 움직임 줄이기 설정이면 흐르지 않는다(화살표 · 끌기는 된다)
 */
const COLUMN = 162;          // 카드 한 열의 폭(카드 154 + 사이 8) — 카드 폭 · 글씨는 그대로(사용자 "지금이 좋다")
const MAX_COLUMNS = 4;
const MIN_COLUMNS = 2;       // 휴대폰
const SPEED = 9;             // 초당 px — 162px 한 열이 18초쯤
const NUDGE_MS = 450;        // 화살표로 한 열 옮기는 시간

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function DemoCards({ cards, busy, onPick }: { cards: DemoAccount[]; busy: boolean; onPick: (c: DemoAccount) => void }) {
  const seeds = cards.filter((c) => c.role === "USER");
  const admin = cards.find((c) => c.role === "DEMO_ADMIN");
  const outerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(MAX_COLUMNS);
  const offset = useRef(0);                         // 흐른 거리(px) — 한 바퀴(loop)를 넘으면 0 으로 돌아온다
  const paused = useRef(false);
  const nudge = useRef<{ from: number; to: number; start: number } | null>(null);
  const drag = useRef({ active: false, startX: 0, startOffset: 0, moved: 0 });
  const [dragging, setDragging] = useState(false);
  const loop = Math.ceil(seeds.length / 2) * COLUMN;  // 2줄이라 열 수 = 사람 수 ÷ 2
  const flows = seeds.length > columns * 2;           // 8장보다 적으면 흐를 것이 없다

  // 보이는 열 수 — 바깥 칸 폭에 들어가는 만큼(4열까지)
  useEffect(() => {
    const el = outerRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const arrows = e.contentRect.width > 480 ? 76 : 0;   // 화살표 둘 + 사이(휴대폰은 화살표를 감춘다 — Auth.css)
      setColumns(Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, Math.floor((e.contentRect.width - arrows + 8) / COLUMN))));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 흐름 — 화면을 그릴 때마다 조금씩(transform 만 바꾼다, React 다시 그리기 없음)
  useEffect(() => {
    if (!flows) return;
    let raf = 0, last = performance.now();
    const still = reducedMotion();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 64) / 1000;
      last = now;
      const n = nudge.current;
      if (n) {
        const t = Math.min((now - n.start) / NUDGE_MS, 1);
        offset.current = n.from + (n.to - n.from) * (1 - (1 - t) ** 3);   // 끝에서 천천히
        if (t === 1) nudge.current = null;
      } else if (!paused.current && !drag.current.active && !still) {
        offset.current += SPEED * dt;
      }
      offset.current = ((offset.current % loop) + loop) % loop;
      if (trackRef.current) trackRef.current.style.transform = `translateX(${-offset.current}px)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [flows, loop]);

  const step = (d: number) => {
    const from = offset.current;
    nudge.current = { from, to: from + d * COLUMN, start: performance.now() };
  };

  // 끌어서 넘기기 — 5px 넘게 끌었으면 손을 뗄 때의 클릭(로그인)은 먹는다
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!flows) return;
    drag.current = { active: true, startX: e.clientX, startOffset: offset.current, moved: 0 };
    nudge.current = null;
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    d.moved = Math.max(d.moved, Math.abs(dx));
    if (d.moved > 5 && !e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
    offset.current = d.startOffset - dx;
  };
  const onPointerUp = () => {
    drag.current.active = false;
    setDragging(false);
  };

  const card = (c: DemoAccount, copy = false) => (
    <button
      key={`${copy ? "b" : "a"}${c.id}`}
      className={`auth__card ${c.role === "DEMO_ADMIN" ? "is-admin" : ""}`}
      onClick={() => drag.current.moved <= 5 && onPick(c)}
      disabled={busy}
      tabIndex={copy ? -1 : undefined}
      aria-hidden={copy || undefined}
    >
      <strong>{c.nickname}</strong>
      <span>{c.role === "DEMO_ADMIN" ? "관리 화면 · 보기 전용" : `리뷰 ${c.reviewCount} · 찜 ${c.likeCount}`}</span>
    </button>
  );

  return (
    <>
      {seeds.length > 0 && (
        <div className="auth__carousel" role="region" aria-roledescription="carousel" aria-label="체험 사용자 계정">
          <button className="auth__arrow" onClick={() => step(-1)} aria-label="이전 계정" disabled={!flows}>
            <Chevron dir="left" />
          </button>
          <div
            className={`auth__viewport ${dragging ? "is-dragging" : ""}`}
            ref={outerRef}
            style={{ width: columns * COLUMN - 8, maxWidth: "100%" }}
            onMouseEnter={() => (paused.current = true)}
            onMouseLeave={() => { paused.current = false; onPointerUp(); }}
            onFocus={() => (paused.current = true)}
            onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && (paused.current = false)}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <div className="auth__track" ref={trackRef}>
              {seeds.map((c) => card(c))}
              {flows && seeds.map((c) => card(c, true))}
            </div>
          </div>
          <button className="auth__arrow" onClick={() => step(1)} aria-label="다음 계정" disabled={!flows}>
            <Chevron dir="right" />
          </button>
        </div>
      )}
      {admin && <div className="auth__admincard">{card(admin)}</div>}
    </>
  );
}

export default DemoCards;
