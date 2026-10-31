import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { DemoAccount } from "../auth/session";

/**
 * 로그인 화면의 체험 카드(2026-10-30 사용자) — 시드 계정 전부가 2줄로 천천히 한쪽으로 흐른다(구름처럼). 한 번에 4열 × 2줄 = 8장.
 * 마우스를 올리면 멈추고, 끌면 손을 따라오고, 놓으면 관성으로 미끄러지다 멈춘 뒤 다시 흐른다(화살표는 없다).
 * 끝없이 이어지게 목록을 두 번 이어 붙인다(뒤의 것은 화면 읽기 · 탭 순서에서 뺀다). 움직임 줄이기 설정이면 스스로 흐르지 않는다(끌기는 된다)
 */
const COLUMN = 162;          // 카드 한 열의 폭(카드 154 + 사이 8) — 카드 폭 · 글씨는 그대로
const MAX_COLUMNS = 4;
const MIN_COLUMNS = 2;       // 휴대폰
const SPEED = 13;            // 스스로 흐르는 속도(초당 px) — 9 는 느리다(2026-10-30 사용자 "12~14")
const FRICTION = 3.2;        // 관성이 줄어드는 빠르기(1/초) — 클수록 빨리 멈춘다
const FRICTION_TOUCH = 2.6;  // 손가락은 끄는 거리가 짧아 같은 마찰이면 금방 멈춘다(2026-10-31 사용자 "PC 와 비슷하게")
const STILL_MS = 80;         // 놓기 전에 이만큼 멈춰 있었으면 던진 것이 아니다(관성 없음)
const EASE_BACK = 1.5;       // 멈췄다 다시 흐를 때 속도가 붙는 빠르기(1/초)

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function DemoCards({ cards, busy, onPick }: { cards: DemoAccount[]; busy: boolean; onPick: (c: DemoAccount) => void }) {
  const seeds = cards.filter((c) => c.role === "USER");
  const outerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(MAX_COLUMNS);
  const offset = useRef(0);              // 흐른 거리(px) — 한 바퀴(loop)로 감싼다
  const flow = useRef(0);                // 지금 스스로 흐르는 속도 — 멈췄다 다시 흐를 때 0 → SPEED 로 붙는다
  const fling = useRef(0);               // 놓은 뒤 남은 관성(초당 px)
  const friction = useRef(FRICTION);     // 마지막으로 끈 것이 손가락이면 FRICTION_TOUCH
  const hover = useRef(false);
  const drag = useRef({ active: false, startX: 0, startOffset: 0, moved: 0, samples: [] as { t: number; x: number }[] });
  const [dragging, setDragging] = useState(false);
  const loop = Math.ceil(seeds.length / 2) * COLUMN;  // 2줄이라 열 수 = 사람 수 ÷ 2
  const flows = seeds.length > columns * 2;           // 8장보다 적으면 흐를 것이 없다

  const paint = () => {
    offset.current = ((offset.current % loop) + loop) % loop;
    if (trackRef.current) trackRef.current.style.transform = `translate3d(${-offset.current}px, 0, 0)`;
  };

  // 보이는 열 수 — 바깥 칸 폭에 들어가는 만큼(4열까지)
  useEffect(() => {
    const el = outerRef.current?.parentElement;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setColumns(Math.max(MIN_COLUMNS, Math.min(MAX_COLUMNS, Math.floor((e.contentRect.width + 8) / COLUMN)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 흐름 · 관성 — 화면을 그릴 때마다(transform 만 바꾼다, React 다시 그리기 없음)
  useEffect(() => {
    if (!flows) return;
    let raf = 0, last = performance.now();
    const still = reducedMotion();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 64) / 1000;
      last = now;
      if (!drag.current.active) {
        // 관성 — 지수로 줄어든다
        if (fling.current !== 0) {
          offset.current += fling.current * dt;
          fling.current *= Math.exp(-friction.current * dt);
          if (Math.abs(fling.current) < 4) fling.current = 0;
        }
        // 스스로 흐름 — 마우스가 올라가 있거나 관성이 남았으면 쉬고, 다시 흐를 때는 속도가 천천히 붙는다
        const target = hover.current || still || fling.current !== 0 ? 0 : SPEED;
        flow.current += (target - flow.current) * (1 - Math.exp(-EASE_BACK * dt));
        offset.current += flow.current * dt;
        paint();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // paint 는 loop 만 본다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flows, loop]);

  // 끌기 — 손을 그대로 따라오고(이벤트에서 바로 그린다), 놓으면 마지막 0.1초의 속도로 미끄러진다. 5px 넘게 끌었으면 그 클릭(로그인)은 먹는다.
  // 속도는 마지막 움직임까지로 잰다 — 손가락을 떼는 이벤트는 늦게 와서 거기까지 재면 속도가 작게 나온다. 브라우저가 묶은 움직임(coalesced)도 표본에 넣는다
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!flows) return;
    drag.current = { active: true, startX: e.clientX, startOffset: offset.current, moved: 0, samples: [{ t: e.timeStamp, x: e.clientX }] };
    fling.current = 0;
    flow.current = 0;
    friction.current = e.pointerType === "touch" ? FRICTION_TOUCH : FRICTION;
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    const dx = e.clientX - d.startX;
    d.moved = Math.max(d.moved, Math.abs(dx));
    if (d.moved > 5 && !e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.setPointerCapture(e.pointerId);
    const moves = e.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const m of moves.length ? moves : [e.nativeEvent]) d.samples.push({ t: m.timeStamp, x: m.clientX });
    while (d.samples.length > 2 && e.timeStamp - d.samples[0].t > 100) d.samples.shift();
    offset.current = d.startOffset - dx;
    paint();
  };
  // 손가락은 처음 닿은 카드(button)가 저절로 잡고(implicit capture) 있다가, 위에서 칸으로 옮길 때 카드 쪽 lostpointercapture 가 올라온다 —
  // 그것을 '놓음'으로 보면 5px 만에 끌기가 끝난다(2026-10-31, 터치가 덜 미끄러진 원인). 칸 자신의 것만 본다
  const onPointerUp = (e?: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    setDragging(false);
    const first = d.samples[0], lastS = d.samples[d.samples.length - 1];
    const ms = lastS.t - first.t;
    const still = (e?.timeStamp ?? lastS.t) - lastS.t;
    if (d.moved > 5 && ms > 0 && ms < 200 && still < STILL_MS) fling.current = Math.max(-3000, Math.min(3000, (-(lastS.x - first.x) / ms) * 1000));
  };

  const card = (c: DemoAccount, copy = false) => (
    <button
      key={`${copy ? "b" : "a"}${c.id}`}
      className="auth__card"
      onClick={() => drag.current.moved <= 5 && onPick(c)}
      disabled={busy}
      tabIndex={copy ? -1 : undefined}
      aria-hidden={copy || undefined}
    >
      <strong>{c.nickname}</strong>
      <span>{`리뷰 ${c.reviewCount} · 찜 ${c.likeCount}`}</span>
    </button>
  );

  if (seeds.length === 0) return null;
  return (
    <div className="auth__carousel" role="region" aria-roledescription="carousel" aria-label="체험 사용자 계정">
      <div
        className={`auth__viewport ${dragging ? "is-dragging" : ""}`}
        ref={outerRef}
        style={{ width: columns * COLUMN - 8, maxWidth: "100%" }}
        onMouseEnter={() => (hover.current = true)}
        onMouseLeave={() => (hover.current = false)}
        onFocus={() => (hover.current = true)}
        onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && (hover.current = false)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onLostPointerCapture={(e) => e.target === e.currentTarget && onPointerUp(e)}
      >
        <div className="auth__track" ref={trackRef}>
          {seeds.map((c) => card(c))}
          {flows && seeds.map((c) => card(c, true))}
        </div>
      </div>
    </div>
  );
}

export default DemoCards;
