import { useState, useEffect } from "react";
import { asset } from "../api";
import type { Term } from "../types";

import "./Hero.css";

// 신발 한 장 위에 용어 셋의 선이 하나씩 쌓이는 설계도.
// 흐름: 신발과 이름만 뜬다 → 01 선이 그어지고 값이 박힌다 → 02 → 03 → 셋이 다 남은 채 머문다 → 처음부터.
// 앞서 그은 선은 지우지 않는다. 아래 띠에는 지금 그어지는 용어의 이름과 풀이가 한 글자씩 박힌다.
// 선은 "어디인지"를, 글은 "무엇인지"를 말한다. 그래서 선과 글자는 처음부터 떠 있지 않다.
const BLANK_MS = 900; // 아무 표시 없는 신발을 보여 주는 시간
const DRAW_MS = 900; // 한 용어의 선이 다 그어지는 데 걸리는 시간
const CHAR_MS = 30; // 한 글자가 박히는 간격
const STEP_HOLD_MS = 3600; // 풀이가 다 박힌 뒤 다음 용어로 가기 전 읽을 틈
const FINAL_HOLD_MS = 5000; // 셋이 다 그어진 그림을 보여 주는 시간
const FADE_MS = 450; // 다시 돌기 전에 선과 글이 걷히는 시간

// 사진: 호카 시엘로 X1 3.0 옆모습(카탈로그 131번, 포트폴리오 포스터와 같은 신발, 원본 1400 x 1000).
// 번호, 용도, 이름, 값 셋은 카탈로그의 이 신발 값이다(2026-11-20). 사진이 고정이라 값도 여기 같이 둔다. 신발을 바꾸면 사진, 값, 선 좌표를 함께 바꾼다.
const SHOE = {
  image: "/images/hero-shoe.webp",
  no: "NO.131",
  purpose: "레이스",
  name: "호카 시엘로 X1 3.0",
};

// 그림판: 사진(0,0 ~ 1400,1000)보다 조금 넓다. 왼쪽 바깥에 스택하이트 화살표, 아래에 용어 이름과 자 눈금이 들어간다.
// 선 좌표는 모두 사진 원본 픽셀 기준이다.
// 신발 이름은 오른쪽 위에 둔다. 옆모습은 뒤꿈치 쪽이 높고 앞코 쪽이 낮아 오른쪽 위가 비기 때문이다.
const BOARD = { x: -100, y: 90, w: 1500, h: 960 };
const left = (x: number) => `${((x - BOARD.x) / BOARD.w) * 100}%`;
const top = (y: number) => `${((y - BOARD.y) / BOARD.h) * 100}%`;

// 용어는 옆모습 사진 위에 자리를 정확히 짚을 수 있는 셋만 둔다: 스택하이트, 미드솔, 카본 플레이트.
// 드롭은 두지 않는다. 발바닥이 놓이는 면은 옆벽 안쪽이라 옆모습에 보이지 않아, 뒤꿈치와 앞꿈치의 높이를 선으로 옳게 그을 수 없다.
// 스택하이트 화살표는 미드솔 윗선 y 545 에서 바닥 y 800 까지다.
// 카본 플레이트는 미드솔 안에 있어 사진에 보이지 않는다. 옆면 무늬를 따라 판이 지나는 자리를 어림해 그은 선이다.
type Line = { d: string; solid?: boolean };
type Mark = {
  key: string; // 용어 사전의 key
  no: string;
  name: string;
  value: string;
  lines: Line[]; // 적힌 차례대로 그어진다
  heads: string[]; // 화살촉. 선이 다 그어지면 뜬다
  dot?: [number, number]; // 이름표로 내려가는 선이 시작하는 동그라미
  label: { x: number; y: number; align: "left" | "center" };
};

const MARKS: Mark[] = [
  {
    key: "stackHeight",
    no: "01",
    name: "스택하이트",
    value: "38mm",
    // 미드솔 윗선과 바닥선을 왼쪽으로 빼고 그 사이 두께를 세로 화살표로
    lines: [
      { d: "M-80 545 H40", solid: true },
      { d: "M-80 800 H235", solid: true },
      { d: "M-55 553 V792", solid: true },
    ],
    heads: ["M-70 574 L-55 553 L-40 574", "M-70 771 L-55 792 L-40 771"],
    label: { x: -92, y: 842, align: "left" },
  },
  {
    key: "midsole",
    no: "02",
    name: "미드솔",
    value: "PEBA",
    // 미드솔 둘레를 한 바퀴, 그리고 이름표로 내려가는 선
    lines: [
      {
        d: "M32 548 C90 552 170 565 235 580 C330 590 520 592 700 600 C820 604 960 596 1040 580 C1120 562 1200 528 1240 505 C1262 492 1278 478 1286 470 C1296 492 1296 515 1292 535 C1284 572 1262 605 1228 637 C1170 688 1100 728 1050 751 C1000 770 930 790 880 798 C830 804 760 805 700 803 C640 802 590 798 545 792 C520 790 500 792 450 795 C380 800 260 800 200 791 C150 780 118 762 100 742 C60 710 20 650 14 600 C12 575 20 555 32 548 Z",
      },
      { d: "M470 752 V832", solid: true },
    ],
    heads: [],
    dot: [470, 742],
    label: { x: 470, y: 842, align: "center" },
  },
  {
    key: "carbon",
    no: "03",
    name: "카본 플레이트",
    value: "있음",
    // 미드솔 안쪽을 따라 판이 지나는 자리, 그리고 이름표로 내려가는 선
    lines: [
      { d: "M255 592 C285 604 305 613 330 622 C355 631 375 638 400 645 C440 656 465 664 500 672 C540 681 565 686 600 692 C640 699 665 703 700 706 C740 710 765 712 800 712 C840 712 865 710 900 707 C940 703 970 700 1000 694 C1025 688 1045 680 1065 672" },
      { d: "M860 720 V832", solid: true },
    ],
    heads: [],
    dot: [860, 710],
    label: { x: 860, y: 842, align: "center" },
  },
];

// 자 눈금: 신발 아래에 깔리는 설계도 장식. 길이를 재는 눈금이 아니라 단위가 없다
const RULER = { y: 1000, from: -20, to: 1324, gap: 42 };
const TICKS = Array.from({ length: Math.floor((RULER.to - RULER.from) / RULER.gap) + 1 }, (_, i) => i);

// 풀이는 용어 사전(/api/terms) 설명의 첫 문장만 쓴다. 통째로 넣으면 띠에 비해 길다
const firstSentence = (text: string) => text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text;

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

type Scene = {
  active: number; // 아래 띠에 뜨는 용어. -1 이면 띠가 비어 있다
  drawn: number; // 선을 긋기 시작한 용어 수
  labeled: number; // 이름표가 뜬 용어 수
  typed: number; // 지금 용어에서 박힌 글자 수(값, 이름, 풀이 차례)
  fading: boolean; // 다시 돌기 전에 걷히는 중
};
const START: Scene = { active: -1, drawn: 0, labeled: 0, typed: 0, fading: false };

function Hero({ terms }: { terms: Term[] }) {
  const [scene, setScene] = useState<Scene>(START);
  const [cycle, setCycle] = useState(0);

  // 용어 사전에 없는 용어는 풀이를 비워 둔다. 지어내지 않는다
  const descs = MARKS.map((mark) => {
    const term = terms.find((t) => t.key === mark.key);
    return term ? firstSentence(term.description) : "";
  });
  const descKey = descs.join("|");

  useEffect(() => {
    const texts = descKey.split("|");
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    const stop = () => timers.forEach(clearTimeout);
    at(0, () => setScene(START));

    // 움직임을 줄여 달라는 설정이면 다 그어진 그림을 그대로 두고 아래 띠의 용어만 천천히 바꾼다
    if (reducedMotion()) {
      MARKS.forEach((_, i) => at(i * 5000, () => setScene({ active: i, drawn: MARKS.length, labeled: MARKS.length, typed: 999, fading: false })));
      at(MARKS.length * 5000, () => setCycle((c) => c + 1));
      return stop;
    }

    let t = BLANK_MS;
    MARKS.forEach((mark, i) => {
      at(t, () => setScene({ active: i, drawn: i + 1, labeled: i, typed: 0, fading: false }));
      t += DRAW_MS;
      at(t, () => setScene((s) => ({ ...s, labeled: i + 1 })));
      const total = mark.value.length + mark.name.length + texts[i].length;
      for (let n = 1; n <= total; n++) at(t + n * CHAR_MS, () => setScene((s) => ({ ...s, typed: n })));
      t += total * CHAR_MS + STEP_HOLD_MS;
    });
    t += FINAL_HOLD_MS - STEP_HOLD_MS;
    at(t, () => setScene((s) => ({ ...s, fading: true })));
    at(t + FADE_MS, () => {
      setScene(START);
      setCycle((c) => c + 1);
    });
    return stop;
  }, [cycle, descKey]);

  const { active, drawn, labeled, typed, fading } = scene;
  const current = active >= 0 ? MARKS[active] : null;
  const bandName = current?.name ?? "";
  const bandDesc = current ? descs[active] : "";
  const afterValue = current ? Math.max(0, typed - current.value.length) : 0;
  const nameTyped = Math.min(afterValue, bandName.length);
  const descTyped = Math.max(0, afterValue - bandName.length);

  return (
    <section className="hero">
      <div className="hero__pane hero__pane--copy">
        <h1 className="hero__title">러닝화, 제대로 읽기</h1>
        <p className="hero__subtitle">스펙은 빠짐없이, 용어는 설명과 함께</p>
      </div>

      <div className="hero__pane hero__pane--visual">
        <div className="hero__stage">
          <div className="hero__board">
            <img
              className="hero__image"
              src={asset(SHOE.image)}
              alt={`${SHOE.name} 옆모습`}
              style={{ left: left(0), top: top(0), width: `${(1400 / BOARD.w) * 100}%` }}
            />

            <svg className="hero__ruler" viewBox={`${BOARD.x} ${BOARD.y} ${BOARD.w} ${BOARD.h}`} aria-hidden="true">
              <path d={`M${RULER.from} ${RULER.y} H${RULER.to}`} />
              {TICKS.map((i) => (
                <path key={i} d={`M${RULER.from + i * RULER.gap} ${RULER.y} v${i % 5 === 0 ? 30 : 18}`} />
              ))}
            </svg>

            <p className="hero__shoe-name" style={{ left: left(1392), top: top(112) }}>
              <span className="hero__shoe-no">
                {SHOE.no} <span>{SHOE.purpose}</span>
              </span>
              <strong>{SHOE.name}</strong>
            </p>

            <div className={`hero__layer ${fading ? "is-fading" : ""}`} aria-hidden="true">
              <svg className="hero__marks" viewBox={`${BOARD.x} ${BOARD.y} ${BOARD.w} ${BOARD.h}`}>
                {MARKS.map((mark, i) => {
                  const step = DRAW_MS / mark.lines.length;
                  return (
                    <g key={mark.key} className={`hero__mark ${i < drawn ? "is-drawn" : ""}`}>
                      {mark.lines.map((line, n) => (
                        <g key={line.d}>
                          {/* 선을 처음부터 끝까지 따라가며 드러내는 가림막 */}
                          <mask id={`hero-mask-${i}-${n}`} maskUnits="userSpaceOnUse" x={BOARD.x} y={BOARD.y} width={BOARD.w} height={BOARD.h}>
                            <path
                              className="hero__reveal"
                              d={line.d}
                              pathLength={1}
                              style={{ animationDuration: `${step}ms`, animationDelay: `${step * n}ms` }}
                            />
                          </mask>
                          <g mask={`url(#hero-mask-${i}-${n})`}>
                            <path className={`hero__line hero__line--halo ${line.solid ? "hero__line--solid" : ""}`} d={line.d} />
                            <path className={`hero__line ${line.solid ? "hero__line--solid" : ""}`} d={line.d} />
                          </g>
                        </g>
                      ))}
                      <g className="hero__head" style={{ animationDelay: `${DRAW_MS - 150}ms` }}>
                        {mark.heads.map((d) => (
                          <g key={d}>
                            <path className="hero__line hero__line--halo hero__line--solid" d={d} />
                            <path className="hero__line hero__line--solid" d={d} />
                          </g>
                        ))}
                        {mark.dot && <circle className="hero__dot" cx={mark.dot[0]} cy={mark.dot[1]} r={11} />}
                      </g>
                    </g>
                  );
                })}
              </svg>

              {MARKS.map((mark, i) => {
                const shown = i < active ? mark.value.length : i === active ? Math.min(typed, mark.value.length) : 0;
                return (
                  <p
                    key={mark.key}
                    className={`hero__label hero__label--${mark.label.align} ${i < labeled ? "is-shown" : ""}`}
                    style={{ left: left(mark.label.x), top: top(mark.label.y) }}
                  >
                    <span className="hero__label-name">
                      <span className="hero__label-no">{mark.no}</span> {mark.name}
                    </span>
                    <span className="hero__label-value">
                      {mark.value.slice(0, shown)}
                      <span className="hero__rest">{mark.value.slice(shown)}</span>
                    </span>
                  </p>
                );
              })}
            </div>
          </div>
        </div>

        <div className="hero__caption">
          {/* 아직 안 박힌 글자도 자리는 잡아 둔다. 글이 박히는 동안 줄바꿈이 흔들리지 않는다 */}
          <span className="hero__term" aria-hidden="true">
            {bandName.slice(0, nameTyped)}
            <span className="hero__rest">{bandName.slice(nameTyped) || " "}</span>
          </span>
          <span className="hero__desc" aria-hidden="true">
            {bandDesc.slice(0, descTyped)}
            <span className="hero__rest">{bandDesc.slice(descTyped)}</span>
          </span>
          {/* 화면 낭독기에는 움직임과 상관없이 용어 셋을 한 번에 준다 */}
          <ul className="hero__sr">
            {MARKS.map((mark, i) => (
              <li key={mark.key}>
                {mark.name} {mark.value}. {descs[i]}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default Hero;
