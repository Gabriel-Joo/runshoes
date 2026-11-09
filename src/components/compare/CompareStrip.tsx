import { useEffect, useRef, useState, type RefObject } from "react";
import type { Shoe } from "../../types";
import ShoeImage from "../ShoeImage";
import Barcode from "../Barcode";
import { WHY_LABEL, type Col } from "../../utils/compare";

const tagCode = (id: number) => `RS${String(id).padStart(4, "0")}`;

interface Props {
  cols: Col[];
  shoes: Shoe[];
  scrollRef: RefObject<HTMLDivElement | null>;    // 표를 감싼 칸(1199px 이하에서는 가로로 넘긴다)
  gridRef: RefObject<HTMLDivElement | null>;      // 표(grid) — 열 폭을 그대로 가져온다
  onOpen: (id: number) => void;
  mobile: boolean;                                // 1199px 이하 — 표에 줄 이름 열이 없다
}

interface Place {
  left: number;
  width: number;
  top: number;
  columns: string;   // 표의 grid-template-columns(계산된 px) — 띠의 칸이 표의 열과 같은 자리에 오게
  shift: number;     // 표를 가로로 넘긴 만큼(1199px 이하)
}

/**
 * 카드 줄이 화면 위로 지나가면 헤더 바로 아래에 붙는 작은 띠(2026-11-09 사용자 — 표를 내리면 어떤 신발인지 알 수 없었다).
 * 카드 줄 자체를 sticky 로 두지 않은 까닭: 1199px 이하는 표가 가로 스크롤 칸 안에 있어 세로 sticky 가 듣지 않고,
 * 큰 카드가 그대로 따라오면 화면을 너무 먹는다. 띠는 fixed 로 띄우고 표의 열 폭 · 가로 스크롤 위치를 그대로 따른다.
 */
function CompareStrip({ cols, shoes, scrollRef, gridRef, onOpen, mobile }: Props) {
  const [place, setPlace] = useState<Place | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    const measure = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const box = scrollRef.current, grid = gridRef.current;
        const header = document.querySelector<HTMLElement>(".header");
        const card = grid?.querySelector<HTMLElement>(".ctable__card");
        if (!box || !grid || !card) return setPlace(null);
        const top = header ? header.getBoundingClientRect().bottom : 0;
        const cardBottom = card.getBoundingClientRect().bottom;
        const tableBottom = grid.getBoundingClientRect().bottom;
        // 카드 줄이 헤더 아래로 사라졌고, 표가 아직 화면에 남아 있을 때만
        if (cardBottom > top || tableBottom < top + 90) return setPlace(null);
        const r = box.getBoundingClientRect();
        setPlace({ left: r.left, width: box.clientWidth, top, columns: getComputedStyle(grid).gridTemplateColumns, shift: box.scrollLeft });
      });
    };
    measure();
    const box = scrollRef.current;
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    box?.addEventListener("scroll", measure, { passive: true });
    return () => {
      cancelAnimationFrame(frame.current);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      box?.removeEventListener("scroll", measure);
    };
  }, [scrollRef, gridRef, cols.length]);

  if (!place) return null;
  return (
    <div className="cstrip" style={{ left: place.left, width: place.width, top: place.top }} aria-label="비교 중인 신발">
      <div className="cstrip__row" style={{ gridTemplateColumns: place.columns, transform: `translateX(${-place.shift}px)` }}>
        {!mobile && <div className="cstrip__corner" />}
        {cols.map((c, i) => {
          const s = shoes[i];
          return (
            <button key={c.id} className={`cstrip__item ${c.why === "pick" ? "is-base" : ""}`} onClick={() => onOpen(s.id)} title={`${s.brand} ${s.model}`}>
              {/* 윗줄: 사진 · (이유 / 브랜드), 아랫줄: 모델명(칸 전체 폭, 두 줄까지) · 바코드 */}
              <span className="cstrip__top">
                <span className="cstrip__img"><ShoeImage src={s.image} alt="" /></span>
                <span className="cstrip__meta">
                  <span className="cstrip__why">{WHY_LABEL[c.why]}</span>
                  <small>{s.brand}</small>
                </span>
              </span>
              <strong className="cstrip__model">{s.model}</strong>
              <span className="cstrip__tag"><Barcode value={tagCode(s.id)} height={10} /></span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default CompareStrip;
