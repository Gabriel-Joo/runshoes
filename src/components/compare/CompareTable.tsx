import { useEffect, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from "react";
import type { Shoe, Term } from "../../types";
import CompareCard from "./CompareCard";
import TermTooltip from "../TermTooltip";
import CompareDist from "./CompareDist";
import { NONE, text, wideLabel, yesNo } from "../../utils/display";
import { WIDE_TERM, stabilityTerm } from "../../utils/terms";
import { BAND_WORD, MAX_COLS, SIZE_MM, formatNum, numValue, population, rankIn, type Col, type NumKey } from "../../utils/compare";


type RowKey = "purpose" | "stability" | "width" | "wide" | NumKey | "carbon" | "midsole" | "rating" | "likes";
interface Row {
  key: RowKey;
  label: string;
  term?: string;        // terms 의 key(ⓘ) — "wide" · "stabilityPair" 는 화면이 만든다
}
interface Group {
  title: string;
  tint: boolean;        // 값이 다른 줄에 옅은 틸 — 발에 맞나 · 주행감만(평가 · 가격은 늘 달라 의미가 없다)
  rows: Row[];
}
const GROUPS: Group[] = [
  { title: "기본", tint: false, rows: [{ key: "purpose", label: "용도" }, { key: "stability", label: "안정성", term: "stabilityPair" }] },
  { title: "발에 맞나", tint: true, rows: [{ key: "width", label: "발볼", term: "width" }, { key: "wide", label: "와이드 모델", term: "wide" }] },
  {
    title: "주행감",
    tint: true,
    rows: [
      { key: "weight", label: "무게", term: "weight" },
      { key: "stackHeight", label: "스택하이트", term: "stackHeight" },
      { key: "drop", label: "드롭", term: "drop" },
      { key: "carbon", label: "카본 플레이트", term: "carbon" },
      { key: "midsole", label: "미드솔", term: "midsole" },
    ],
  },
  { title: "평가", tint: false, rows: [{ key: "rating", label: "평점" }, { key: "likes", label: "찜" }] },
  { title: "가격", tint: false, rows: [{ key: "price", label: "발매가" }] },
];
const NUM_KEYS: NumKey[] = ["weight", "stackHeight", "drop", "price"];
const isNum = (k: RowKey): k is NumKey => (NUM_KEYS as string[]).includes(k);

/** 줄의 값이 같은지 볼 때 쓰는 글 — 무게는 기준 사이즈까지 */
function plain(s: Shoe, k: RowKey): string {
  switch (k) {
    case "purpose": return s.purpose;
    case "stability": return s.stability;
    case "width": return text(s.width);
    case "wide": return wideLabel(s);
    case "carbon": return yesNo(s.carbon);
    case "midsole": return text(s.midsole);
    case "weight": return `${s.weight}/${s.weightSize}`;
    case "rating": return `${s.rating}/${s.reviewCount}`;
    case "likes": return String(s.likeCount);
    default: return String(s[k]);
  }
}

interface Props {
  cols: Col[];
  shoes: Shoe[];                 // cols 순서 그대로
  all: Shoe[];                   // 모집단(310켤레)
  terms: Term[];
  guest: boolean;
  mobile: boolean;
  onRemove: (index: number) => void;
  onRebase: () => void;          // 고른 신발 ↻ — 첫 화면으로 돌아가 기준을 다시 고른다
  onAdd: () => void;
  onDrop: (id: number, at: number | null) => void;   // at — 그 열을 바꾼다 · null 이면 더한다
  onOpen: (id: number, reviews: boolean) => void;
}

/** 머리는 찜 목록 카드 모양(사진 · 브랜드 · 모델 · 바코드), 아래는 줄 이름이 왼쪽에 있는 표(08 1-5) */
function CompareTable({ cols, shoes, all, terms, guest, mobile, onRemove, onRebase, onAdd, onDrop, onOpen }: Props) {
  const [open, setOpen] = useState<{ id: number; key: NumKey } | null>(null);
  const [openTerm, setOpenTerm] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<number | "add" | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);   // 표(값) — 1199px 이하에서 가로로 넘긴다
  const gridRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);     // 카드 줄 — 헤더 아래에 붙는다(sticky)
  const [headCols, setHeadCols] = useState<string | undefined>();

  /*
   * 카드 줄 고정(2026-11-09 사용자 — 표를 내리면 어떤 신발인지 알 수 없었다, "+ 추가"도 같이).
   * 카드 줄을 표와 다른 칸(자기 가로 스크롤 칸)으로 떼어 그 칸을 sticky 로 — 가로 스크롤 칸 "안"의 것은 세로 sticky 가 듣지 않지만,
   * 가로 스크롤 칸 "자체"는 듣는다. 두 칸의 가로 위치를 서로 맞추고, 열 폭은 표에서 재서 카드 줄에 그대로 준다.
   */
  useEffect(() => {
    const body = scrollRef.current, head = headRef.current, grid = gridRef.current;
    if (!body || !head || !grid) return;
    const syncCols = () => setHeadCols(getComputedStyle(grid).gridTemplateColumns);
    const fromBody = () => { if (head.scrollLeft !== body.scrollLeft) head.scrollLeft = body.scrollLeft; };
    const fromHead = () => { if (body.scrollLeft !== head.scrollLeft) body.scrollLeft = head.scrollLeft; };
    const ro = new ResizeObserver(syncCols);
    ro.observe(grid);
    body.addEventListener("scroll", fromBody, { passive: true });
    head.addEventListener("scroll", fromHead, { passive: true });
    return () => {
      ro.disconnect();
      body.removeEventListener("scroll", fromBody);
      head.removeEventListener("scroll", fromHead);
    };
  }, [cols.length, mobile]);
  const canAdd = cols.length < MAX_COLS;
  const pad = MAX_COLS - cols.length;
  const pops = Object.fromEntries(NUM_KEYS.map((k) => [k, population(all, k)])) as Record<NumKey, number[]>;
  const termOf = (key?: string): Term | undefined =>
    key === "wide" ? WIDE_TERM : key === "stabilityPair" ? stabilityTerm(terms) : terms.find((t) => t.key === key);

  const dragProps = (at: number | "add") => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes("text/x-shoe")) return;
      e.preventDefault();
      setDropAt(at);
    },
    onDragLeave: () => setDropAt((v) => (v === at ? null : v)),
    onDrop: (e: DragEvent) => {
      const id = Number(e.dataTransfer.getData("text/x-shoe"));
      setDropAt(null);
      if (id) {
        e.preventDefault();
        onDrop(id, at === "add" ? null : at);
      }
    },
  });

  const cell = (s: Shoe, k: RowKey): ReactNode => {
    if (k === "weight") {
      const mm = s.weightSize ? SIZE_MM[s.weightSize] : undefined;
      const v = numValue(s, "weight");
      return (
        <>
          {s.weight == null ? <span className="ctable__none">{NONE}</span> : `${s.weight}g`}
          {s.weight != null && <span className="ctable__sub">{mm ? `${mm}mm 기준` : "기준 모름"}</span>}
          {v != null && <span className="ctable__badge">{BAND_WORD.weight[rankIn(pops.weight, v).band]}</span>}
        </>
      );
    }
    if (isNum(k)) {
      const v = numValue(s, k);
      if (v == null) return <span className="ctable__none">{NONE}</span>;
      return (
        <>
          {formatNum(k, v)}
          <br />
          <span className="ctable__badge">{BAND_WORD[k][rankIn(pops[k], v).band]}</span>
        </>
      );
    }
    if (k === "rating") {
      return (
        <>
          ★ {s.rating.toFixed(1)} ·{" "}
          {s.reviewCount > 0 ? (
            <button className="ctable__reviews" onClick={() => onOpen(s.id, true)}>리뷰 {s.reviewCount}</button>
          ) : (
            "리뷰 0"
          )}
        </>
      );
    }
    if (k === "likes") return s.likeCount;
    const v = plain(s, k);
    return v === NONE ? <span className="ctable__none">{NONE}</span> : v;
  };

  return (
    <div className="ctable__wrap">
      <div ref={headRef} className="ctable__headwrap">
      <div className="ctable ctable--head" style={{ "--n": cols.length + (canAdd ? 1 : 0), gridTemplateColumns: headCols } as CSSProperties}>
        <div className="ctable__corner" />
        {cols.map((c, i) => (
          <CompareCard key={c.id} col={c} shoe={shoes[i]} onRemove={() => onRemove(i)} onRebase={onRebase}
            onOpen={() => onOpen(shoes[i].id, false)} drop={{ active: dropAt === i, ...dragProps(i) }} />
        ))}
        {canAdd && (
          <button className={`ctable__add ${dropAt === "add" ? "is-drop" : ""}`} onClick={onAdd} {...dragProps("add")}>
            <b>+</b>추가
            <span>{guest ? "검색해서 추가하세요" : mobile ? "검색 · 내 찜" : <>검색하거나<br />내 찜에서 끌어 오세요</>}</span>
          </button>
        )}
        {!mobile && Array.from({ length: Math.max(0, pad - 1) }, (_, i) => <div key={`gap${i}`} className="ctable__gap" />)}
      </div>
      </div>
      <div ref={scrollRef} className="ctable__scroll">
      <div ref={gridRef} className="ctable" style={{ "--n": cols.length + (canAdd ? 1 : 0) } as CSSProperties}>

        {GROUPS.map((g) => (
          <div key={g.title} className="ctable__group">
            <h3 className="ctable__grp">{g.title}</h3>
            {g.rows.map((row) => {
              const diff = g.tint && new Set(shoes.map((s) => plain(s, row.key))).size > 1 ? "is-diff" : "";
              const term = termOf(row.term);
              const sizes = new Set(shoes.map((s) => s.weightSize ?? "?"));
              return (
                <div key={row.key} className="ctable__row">
                  <div className={`ctable__lab ${diff}`}>
                    <span className="ctable__labtext">
                      {row.label}
                      {term && (
                        <span onMouseEnter={() => !mobile && setOpenTerm(term.key)} onMouseLeave={() => !mobile && setOpenTerm(null)}>
                          <TermTooltip term={term} openTerm={openTerm} onToggle={setOpenTerm} />
                        </span>
                      )}
                    </span>
                  </div>
                  {shoes.map((s, i) => {
                    const num = isNum(row.key) && (row.key === "weight" ? s.weight != null : numValue(s, row.key) != null);
                    const here = open?.id === s.id && open.key === row.key;
                    return (
                      <div
                        key={s.id}
                        className={`ctable__val ${diff} ${num ? "is-num" : ""} ${here ? "is-open" : ""}`}
                        onMouseEnter={num && !mobile ? () => setOpen({ id: s.id, key: row.key as NumKey }) : undefined}
                        onMouseLeave={num && !mobile ? () => setOpen(null) : undefined}
                        onClick={num ? () => setOpen(here ? null : { id: s.id, key: row.key as NumKey }) : undefined}
                      >
                        {cell(s, row.key)}
                        {here && !mobile && (
                          <CompareDist shoe={s} field={row.key as NumKey} pop={pops[row.key as NumKey]} others={shoes.filter((o) => o.id !== s.id)}
                            sheet={false} right={i >= 2 && i === cols.length - 1} onClose={() => setOpen(null)} />
                        )}
                      </div>
                    );
                  })}
                  {Array.from({ length: mobile ? (canAdd ? 1 : 0) : pad }, (_, i) => <div key={`pad${i}`} className="ctable__val is-pad" />)}
                  {row.key === "weight" && sizes.size > 1 && (
                    <>
                      <div className="ctable__note" style={{ gridColumn: `1 / span ${cols.length + 1}` }}>
                        기준 사이즈가 달라서 무게를 그대로 비교하기 어려워요
                      </div>
                      {!mobile && Array.from({ length: pad }, (_, i) => <div key={`np${i}`} className="ctable__val is-pad" />)}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
      </div>
      {open && mobile && (() => {
        const s = shoes.find((x) => x.id === open.id);
        if (!s) return null;
        return (
          <>
            <div className="cdist__dim" onClick={() => setOpen(null)} />
            <CompareDist shoe={s} field={open.key} pop={pops[open.key]} others={shoes.filter((o) => o.id !== s.id)} sheet right={false} onClose={() => setOpen(null)} />
          </>
        );
      })()}
    </div>
  );
}

export default CompareTable;
