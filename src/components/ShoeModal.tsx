import { useState, useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import type { Shoe, Term } from "../types";
import TermTooltip from "./TermTooltip";
import ReviewSection from "./ReviewSection";
import ShoeGallery from "./ShoeGallery";
import ReviewSummary from "./ReviewSummary";
import { text, wideLabel, withUnit, yesNo } from "../utils/display";
import { useAuth } from "../auth/useAuth";
import { apiFetch } from "../auth/session";
import "./ShoeModal.css";

// 와이드 모델 ⓘ — 값 넷(V12)을 다 설명한다(2026-11-03 사용자 문구). terms 테이블은 읽기 전용이라(TermCollection) 화면이 직접 가진다
const WIDE_TERM: Term = {
  id: 0,
  key: "wideAvailable",
  name: "와이드 모델",
  short: "넓은 폭(2E·4E) 버전이 따로 나오는지",
  description: "그 신발의 넓은 폭(2E·4E) 버전이 따로 나오는지를 뜻합니다.",
  // 값 이름은 칸에 보이는 값(wideLabel)과 같게 — 말투는 다른 용어처럼 "~입니다"(2026-11-03 사용자)
  values: [
    ["있음", "국내에서 살 수 있습니다."],
    ["국외에만 있음", "해외에는 나오지만 국내 정식 판매는 확인되지 않았습니다. 병행수입으로는 구할 수 있습니다."],
    ["없음", "찾아봤지만 넓은 폭 버전이 없습니다."],
    ["정보 없음", "아직 확인하지 못했습니다."],
  ],
};

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
  // PC — 썸네일 줄 윗선을 설명문 첫 줄 높이에(2026-11-01 사용자). 사진은 칸 위에서 고정된 자리라(ShoeModal.css) 썸네일이 생겨도 움직이지 않는다.
  //   설명문 위치는 요약 · 스펙 · 가격을 받아 오며 바뀌니 정보 칸 크기가 바뀔 때마다 다시 잰다. 설명문이 없으면 CSS 기본값(사진 바로 아래)
  const visualRef = useRef<HTMLDivElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const [thumbsTop, setThumbsTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const visual = visualRef.current, info = infoRef.current;
    if (!visual || !info) return;
    const measure = () => {
      const desc = info.querySelector(".modal__desc"), thumbs = visual.querySelector(".gallery__thumbs");
      if (!desc || !thumbs || !window.matchMedia("(min-width: 768px)").matches) return setThumbsTop(null);
      const top = Math.round(desc.getBoundingClientRect().top - visual.getBoundingClientRect().top);
      setThumbsTop(top > 370 ? top : null);    // 신발(1280 기준 256~365)과 겹칠 만큼 위면 기본값(사진 바로 아래)
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
          <div ref={visualRef} className="modal__visual"
            style={thumbsTop ? ({ "--thumbs-top": `${thumbsTop}px` } as CSSProperties) : undefined}>
            <ShoeGallery image={shoe.image} images={shoe.images} alt={shoe.model} />
          </div>

          <div ref={infoRef} className="modal__info">
            {/* 구역: 머리(번호 · 모델 · 브랜드) 회색 단색 → 본문(스펙 ~ 평점 · 가격) 흰색 → 리뷰 회색 그라데이션 */}
            <div className="modal__head">
              <p className="modal__no">
                NO.{String(shoe.id).padStart(2, "0")} · {shoe.purpose}
              </p>
              <h2 className="modal__model">{shoe.model}</h2>
              {/* 영어 이름(V13)은 브랜드 줄에 가운뎃점으로 — 같은 크기 · 색(2026-11-03 사용자). 없으면 브랜드만 */}
              <p className="modal__brand">{shoe.modelEn ? `${shoe.brand} · ${shoe.modelEn}` : shoe.brand}</p>
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
                <dt>
                  와이드 모델
                  <TermTooltip
                    term={WIDE_TERM}
                    openTerm={openTerm}
                    onToggle={setOpenTerm}
                  />
                </dt>
                <dd>{wideLabel(shoe)}</dd>
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
              {/* "발매가 199,000원" — 평점 줄과 같은 꼴(글자 · 숫자 크기). 출처 · 읽은 날은 관리 화면에만(2026-11-03 사용자 — 그 곳에서 지금 그 값에 파는 것처럼 보였다) */}
              <span className="modal__price">
                {shoe.price === null ? (
                  "가격 정보 없음"
                ) : (
                  <>
                    {shoe.priceKind ?? "발매가"} <strong>{shoe.price.toLocaleString()}</strong>원
                  </>
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
