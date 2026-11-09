import type { DragEvent } from "react";
import type { Shoe } from "../../types";
import ShoeImage from "../ShoeImage";
import Barcode from "../Barcode";
import { WHY_LABEL, type Col } from "../../utils/compare";

const tagCode = (id: number) => `RS${String(id).padStart(4, "0")}`;

interface Props {
  col: Col;
  shoe: Shoe;
  onRemove: () => void;
  onRebase: () => void;          // 고른 신발 ↻ — 기준 바꾸기(첫 화면으로)
  onOpen: () => void;
  drop?: {
    active: boolean;
    onDragOver: (e: DragEvent) => void;
    onDragLeave: () => void;
    onDrop: (e: DragEvent) => void;
  };
  className?: string;
}

/**
 * 비교 카드 머리 — 찜 목록 카드 모양. 줄이 늘 같은 자리에 오게(2026-11-09 사용자):
 * 이유(늘 한 줄) → 사진(고정 높이) → 브랜드 → 모델명(한 줄이든 두 줄이든 위에서 시작) → 바코드(카드 맨 아래).
 * 고른 신발은 자동 채우기의 기준이라 빼지 않고 ↻(기준 바꾸기)로 다시 고른다.
 */
function CompareCard({ col, shoe, onRemove, onRebase, onOpen, drop, className = "" }: Props) {
  const base = col.why === "pick";
  const { active, ...dropHandlers } = drop ?? { active: false };
  return (
    <div className={`ctable__card ${base ? "is-base" : ""} ${active ? "is-drop" : ""} ${className}`} {...dropHandlers}>
      <span className="ctable__why">{WHY_LABEL[col.why]}</span>
      {base ? (
        <button className="ctable__x ctable__rebase" onClick={onRebase} aria-label="기준 바꾸기" data-tip="기준 바꾸기">↻</button>
      ) : (
        <button className="ctable__x" onClick={onRemove} aria-label={`${shoe.model} 빼기`}>✕</button>
      )}
      <button className="ctable__link" onClick={onOpen}>
        <span className="ctable__img"><ShoeImage src={shoe.image} alt={shoe.model} /></span>
        <small>{shoe.brand}</small>
        <strong>{shoe.model}</strong>
      </button>
      <span className="ctable__tag">
        <Barcode value={tagCode(shoe.id)} />
        <small>{tagCode(shoe.id)}</small>
      </span>
    </div>
  );
}

export default CompareCard;
