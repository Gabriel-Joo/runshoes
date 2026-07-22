import { useState } from "react";
import type { Shoe, Term } from "../types";
import TermTooltip from "./TermTooltip";
import ReviewSection from "./ReviewSection";
import ShoeImage from "./ShoeImage";
import "./ShoeModal.css";

interface ShoeModalProps {
  shoe: Shoe;
  terms: Term[];
  onClose: () => void;
  onReviewChange: () => void;
}

function ShoeModal({ shoe, terms, onClose, onReviewChange }: ShoeModalProps) {
  const [openTerm, setOpenTerm] = useState<string | null>(null); // ← 이 줄
  const findTerm = (key: string) => terms.find((t) => t.key === key);
  return (
    <div className="modal" onClick={onClose}>
      <div
        className="modal__box"
        onClick={(e) => {
          e.stopPropagation();
          setOpenTerm(null);
        }}
      >
        <button className="modal__close" onClick={onClose} aria-label="닫기">
          ×
        </button>
        <div className="modal__top">
          <div className="modal__visual">
            <ShoeImage src={shoe.image} alt={shoe.model} />
          </div>

          <div className="modal__info">
            <p className="modal__no">
              NO.{String(shoe.id).padStart(2, "0")} · {shoe.purpose}
            </p>
            <h2 className="modal__model">{shoe.model}</h2>
            <p className="modal__brand">{shoe.brand}</p>

            <p className="modal__summary">{shoe.summary}</p>

            <dl className="modal__specs">
              <div>
                <dt>
                  중량
                  <TermTooltip
                    term={findTerm("weight")}
                    openTerm={openTerm}
                    onToggle={setOpenTerm}
                  />
                </dt>
                <dd>
                  {shoe.weight === null ? "정보 없음" : `${shoe.weight}g`}
                </dd>
              </div>
              <div>
                <dt>
                  드롭
                  <TermTooltip
                    term={findTerm("drop")}
                    openTerm={openTerm}
                    onToggle={setOpenTerm}
                  />
                </dt>
                <dd>{shoe.drop === null ? "정보 없음" : `${shoe.drop}mm`}</dd>
              </div>
              <div>
                <dt>
                  스택하이트
                  <TermTooltip
                    term={findTerm("stackHeight")}
                    openTerm={openTerm}
                    onToggle={setOpenTerm}
                  />
                </dt>
                <dd>
                  {shoe.stackHeight === null
                    ? "정보 없음"
                    : `${shoe.stackHeight}mm`}
                </dd>
              </div>
              <div>
                <dt>
                  발볼
                  <TermTooltip
                    term={findTerm("width")}
                    openTerm={openTerm}
                    onToggle={setOpenTerm}
                  />
                </dt>
                <dd>
                  {shoe.width}
                  {shoe.wideAvailable && " · 와이드 있음"}
                </dd>
              </div>
              <div>
                <dt>
                  안정성
                  <TermTooltip
                    term={findTerm(
                      shoe.stability === "안정화" ? "stability" : "neutral",
                    )}
                    openTerm={openTerm}
                    onToggle={setOpenTerm}
                  />
                </dt>
                <dd>{shoe.stability}</dd>
              </div>
              <div>
                <dt>
                  미드솔
                  <TermTooltip
                    term={findTerm("midsole")}
                    openTerm={openTerm}
                    onToggle={setOpenTerm}
                  />
                </dt>
                <dd>{shoe.midsole ?? "정보 없음"}</dd>
              </div>
            </dl>

            <p className="modal__desc">{shoe.description}</p>
            <div className="modal__bottom">
              <span className="modal__rating">
                평점 <strong>{shoe.rating.toFixed(1)}</strong>점
              </span>
              <span className="modal__price">
                {shoe.price === null
                  ? "가격 정보 없음"
                  : `${shoe.price.toLocaleString()}원`}
              </span>
            </div>
          </div>
        </div>

        <ReviewSection shoeId={shoe.id} onReviewChange={onReviewChange} />
      </div>
    </div>
  );
}

export default ShoeModal;
