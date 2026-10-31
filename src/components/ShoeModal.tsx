import { useState, useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { Shoe, Term } from "../types";
import TermTooltip from "./TermTooltip";
import ReviewSection from "./ReviewSection";
import ShoeGallery from "./ShoeGallery";
import ReviewSummary from "./ReviewSummary";
import { text, withUnit, yesNo } from "../utils/display";
import { useAuth } from "../auth/useAuth";
import { apiFetch } from "../auth/session";
import "./ShoeModal.css";

interface ShoeModalProps {
  shoe: Shoe;
  terms: Term[];
  onClose: () => void;
  onReviewChange: () => void;
}

function ShoeModal({ shoe, terms, onClose, onReviewChange }: ShoeModalProps) {
  const [reviewVersion, setReviewVersion] = useState(0);
  const handleReviewChange = () => {
    setReviewVersion((v) => v + 1);
    onReviewChange();
  };
  const [openTerm, setOpenTerm] = useState<string | null>(null); // ← 이 줄
  useEffect(() => {
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    document.body.style.paddingRight = `${scrollbarWidth}px`;

    return () => {
      document.body.style.overflow = "";
      document.body.style.paddingRight = "";
    };
  }, []);
  // 조회 기록 — 로그인했을 때만(같은 신발 30분에 한 번은 서버가 거른다). 실패해도 화면과 상관없다
  const { status, user } = useAuth();
  useEffect(() => {
    if (status !== "user") return;
    apiFetch("/activity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "shoe.view", shoeId: shoe.id }),
    }).catch(() => {});
  }, [shoe.id, status, user?.id]);
  const findTerm = (key: string) => terms.find((t) => t.key === key);
  // PC — 썸네일 줄 윗선을 설명문 첫 줄 높이에(2026-11-01 사용자). 사진 칸 높이 = 설명문 위치 - 썸네일 위 간격.
  //   설명문 위치는 요약 · 스펙 · 가격을 받아 오며 바뀌니 오른쪽 정보 칸 크기가 바뀔 때마다 다시 잰다
  const visualRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const [stageH, setStageH] = useState<number | null>(null);
  useLayoutEffect(() => {
    const visual = visualRef.current, info = infoRef.current;
    if (!visual || !info) return;
    const measure = () => {
      const desc = info.querySelector(".modal__desc"), thumbs = visual.querySelector<HTMLElement>(".gallery__thumbs");
      if (!desc || !thumbs || !window.matchMedia("(min-width: 768px)").matches) return setStageH(null);
      const gap = parseFloat(getComputedStyle(thumbs).marginTop) || 0;
      const h = Math.round(desc.getBoundingClientRect().top - visual.getBoundingClientRect().top - gap);
      setStageH(h > 120 ? h : null);    // 너무 낮으면(설명문이 거의 맨 위) 예전처럼 칸 전체
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(info);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, [shoe.id]);
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
          <div ref={visualRef} className={`modal__visual${stageH ? " is-aligned" : ""}`}
            style={stageH ? ({ "--stage-h": `${stageH}px` } as CSSProperties) : undefined}>
            <ShoeGallery image={shoe.image} images={shoe.images} alt={shoe.model} />
          </div>

          <div ref={infoRef} className="modal__info">
            {/* 구역: 머리(번호 · 모델 · 브랜드) 회색 단색 → 본문(스펙 ~ 평점 · 가격) 흰색 → 리뷰 회색 그라데이션 */}
            <div className="modal__head">
              <p className="modal__no">
                NO.{String(shoe.id).padStart(2, "0")} · {shoe.purpose}
              </p>
              <h2 className="modal__model">{shoe.model}</h2>
              <p className="modal__brand">{shoe.brand}</p>
            </div>

            <div className="modal__body">
            {shoe.summary && <p className="modal__summary">{shoe.summary}</p>}

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
                <dd>{withUnit(shoe.weight, "g")}</dd>
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
                <dd>{withUnit(shoe.drop, "mm")}</dd>
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
                <dd>{withUnit(shoe.stackHeight, "mm")}</dd>
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
                <dd>{text(shoe.width)}</dd>
              </div>
              <div>
                <dt>와이드 모델</dt>
                <dd>{yesNo(shoe.wideAvailable)}</dd>
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
                <dd>{text(shoe.stability)}</dd>
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
                <dd>{text(shoe.midsole)}</dd>
              </div>
              <div>
                <dt>
                  카본 플레이트
                  <TermTooltip
                    term={findTerm("carbon")}
                    openTerm={openTerm}
                    onToggle={setOpenTerm}
                  />
                </dt>
                <dd>{yesNo(shoe.carbon)}</dd>
              </div>
            </dl>
            {shoe.description && <p className="modal__desc">{shoe.description}</p>}
            <div className="modal__bottom">
              <span className="modal__rating">
                평점 <strong>{shoe.rating.toFixed(1)}</strong>점
              </span>
              <span className="modal__price">
                {shoe.price === null
                  ? "가격 정보 없음"
                  : `${shoe.price.toLocaleString()}원`}
                {shoe.price !== null && shoe.priceSource && shoe.priceCheckedAt && (
                  <small className="modal__price-basis">
                    {shoe.priceSource} {shoe.priceCheckedAt.replace(/-/g, "/")} 기준
                  </small>
                )}
              </span>
            </div>
            </div>
          </div>
        </div>
        <div className="modal__reviews">
          <ReviewSummary key={reviewVersion} shoeId={shoe.id} />
          <ReviewSection shoeId={shoe.id} onReviewChange={handleReviewChange} />
        </div>
      </div>
    </div>
  );
}

export default ShoeModal;
