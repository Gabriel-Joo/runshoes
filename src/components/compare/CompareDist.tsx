import { useLayoutEffect, useRef } from "react";
import type { Shoe } from "../../types";
import { BAND_WORD, eunNeun, formatNum, NUM_TEXT, numValue, rankIn, SIZE_MM, type NumKey } from "../../utils/compare";

const W = 268, H = 64, BINS = 24;

interface Props {
  shoe: Shoe;
  field: NumKey;
  pop: number[];             // 그 칸의 모집단(무게는 270mm 로 잰 것)
  others: Shoe[];            // 같이 비교 중인 다른 신발
  sheet: boolean;            // 휴대폰 — 아래에서 올라오는 시트
  right: boolean;            // 오른쪽 끝 열 — 왼쪽으로 펼친다
  onClose: () => void;
}

/**
 * 어디쯤인지 — 회색 막대(모집단) · 틸(이 신발) · 진한 코랄(같이 보는 신발). 글은 결론 먼저(08 1-7).
 * 화면 밖으로 나가면 위로(아래쪽 줄) · 왼쪽으로(오른쪽 끝) 뒤집는다.
 */
function CompareDist({ shoe, field, pop, others, sheet, right, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || sheet) return;
    el.classList.remove("is-up");
    const r = el.getBoundingClientRect();
    if (r.bottom > window.innerHeight - 8) el.classList.add("is-up");
    if (r.right > window.innerWidth - 8) el.classList.add("is-right");
  });
  const cls = `cdist ${sheet ? "is-sheet" : ""} ${right ? "is-right" : ""}`;
  const v = numValue(shoe, field);

  // 무게 — 270mm 로 재지 않은 신발은 그래프 대신 까닭만
  if (field === "weight" && v == null) {
    const mm = shoe.weightSize ? SIZE_MM[shoe.weightSize] : undefined;
    return (
      <div ref={ref} className={cls} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="무게 설명">
        {sheet && <button className="cdist__close" onClick={onClose} aria-label="닫기">×</button>}
        <h4 className="cdist__title">무게 {shoe.weight}g</h4>
        <p className="cdist__text">
          {mm ? `${mm}mm 신발로 잰 무게예요.` : "몇 mm 신발로 잰 무게인지 알 수 없어요."} 다른 신발 대부분은 270mm로 재서, 같은 그래프에 놓으면 공정하지 않아 뺐어요.
        </p>
      </div>
    );
  }
  if (v == null || pop.length === 0) return null;

  const lo = Math.min(...pop), hi = Math.max(...pop), span = hi - lo || 1;
  const counts = Array<number>(BINS).fill(0);
  pop.forEach((a) => counts[Math.min(BINS - 1, Math.floor(((a - lo) / span) * BINS))]++);
  const max = Math.max(...counts), bw = W / BINS, x = (a: number) => ((a - lo) / span) * W;
  const otherVals = others.map((s) => numValue(s, field)).filter((a): a is number => a != null);
  const skipped = field === "weight" ? others.filter((s) => numValue(s, "weight") == null).map((s) => s.model) : [];
  const short = (a: number) => formatNum(field, a);   // 가격도 "159,000원" 그대로(2026-11-09 사용자 — "159천원"은 쓰지 않는다)
  const edge = field === "price" ? 80 : 60;            // 끝 값과 이 신발 값이 겹치면 끝 값을 뺀다(가격 글자가 길다)
  const half = field === "price" ? 38 : 24;
  const r = rankIn(pop, v), t = NUM_TEXT[field], word = BAND_WORD[field][r.band];

  return (
    <div ref={ref} className={cls} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`${t.label} 분포`}>
      {sheet && <button className="cdist__close" onClick={onClose} aria-label="닫기">×</button>}
      <h4 className="cdist__title">{t.label} {formatNum(field, v)} — {word}이에요</h4>
      <svg viewBox={`0 0 ${W} ${H + 26}`} className="cdist__svg" aria-hidden="true">
        {counts.map((c, i) => (
          <rect key={i} x={i * bw + 1} y={H - (c / max) * (H - 6)} width={bw - 2} height={(c / max) * (H - 6)} className="cdist__bar" />
        ))}
        {otherVals.map((a, i) => <line key={i} x1={x(a)} x2={x(a)} y1={4} y2={H} className="cdist__other" />)}
        <line x1={x(v)} x2={x(v)} y1={0} y2={H} className="cdist__me" />
        <path d={`M${x(v) - 5} ${H + 9} L${x(v) + 5} ${H + 9} L${x(v)} ${H + 3}Z`} className="cdist__mark" />
        {x(v) > edge && <text x={0} y={H + 22} className="cdist__axis">{short(lo)}</text>}
        {x(v) < W - edge && <text x={W} y={H + 22} className="cdist__axis" textAnchor="end">{short(hi)}</text>}
        <text x={Math.min(Math.max(x(v), half), W - half)} y={H + 22} className="cdist__axis is-me" textAnchor="middle">{short(v)}</text>
      </svg>
      <div className="cdist__legend">
        <span className="is-me">{shoe.model}</span>
        {otherVals.length > 0 && <span className="is-other">같이 보는 신발</span>}
      </div>
      <p className="cdist__text">
        {t.pop} {pop.length}켤레를 {t.order}으로 세우면 <b>{r.order}번째</b>예요.
      </p>
      {skipped.length > 0 && (
        <p className="cdist__note">{skipped.map(eunNeun).join(", ")} 270mm로 잰 무게가 아니라 그래프에 넣지 않았어요.</p>
      )}
    </div>
  );
}

export default CompareDist;
