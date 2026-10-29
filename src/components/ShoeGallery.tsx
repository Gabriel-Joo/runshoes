import { useEffect, useRef, useState, type PointerEvent } from "react";
import { asset } from "../api";
import ShoeImage from "./ShoeImage";
import "./ShoeGallery.css";

/**
 * 상세 모달의 신발 사진. 이미지가 2장 이상이면 좌우 화살표 · 썸네일 줄(끌어서 넘김)이 보인다 — 1장이면 사진만(2026-10-30 사용자, 카탈로그 확장 때 지운 것을 되살렸다).
 * 목록은 [image, ...images] 에서 겹치는 것을 뺀 것 — 첫 장이 대표(관리 폼과 같은 규칙)
 * 화살표는 사진 칸 좌우 여백(.modal__visual padding) 안에, 썸네일 줄은 아래 — 흰 구역 그대로(머리 · 리뷰의 회색 그라데이션과 겹치지 않는다)
 */
interface ShoeGalleryProps {
  image: string;
  images?: string[];
  alt: string;
}

function ShoeGallery({ image, images, alt }: ShoeGalleryProps) {
  const list = [...new Set([image, ...(images ?? [])].filter(Boolean))];
  const many = list.length > 1;
  const [index, setIndex] = useState(0);
  const at = Math.min(index, Math.max(list.length - 1, 0));
  const thumbsRef = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, startX: 0, startScroll: 0, moved: 0 });
  const [dragging, setDragging] = useState(false);

  // 고른 썸네일이 줄 밖이면 가운데로
  useEffect(() => {
    const thumb = thumbsRef.current?.children[at] as HTMLElement | undefined;
    thumb?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [at]);

  const prev = () => setIndex((i) => (Math.min(i, list.length - 1) - 1 + list.length) % list.length);
  const next = () => setIndex((i) => (Math.min(i, list.length - 1) + 1) % list.length);

  const onPointerDown = (e: PointerEvent) => {
    const el = thumbsRef.current;
    if (!el) return;
    drag.current = { active: true, startX: e.clientX, startScroll: el.scrollLeft, moved: 0 };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent) => {
    const el = thumbsRef.current, d = drag.current;
    if (!el || !d.active) return;
    const distance = e.clientX - d.startX;
    d.moved = Math.abs(distance);
    el.scrollLeft = d.startScroll - distance;
  };
  const onPointerUp = () => {
    drag.current.active = false;
    setDragging(false);
  };

  return (
    <div className={`gallery ${many ? "has-many" : ""}`}>
      <div className="gallery__stage">
        <div className="gallery__viewport">
          <div className="gallery__track" style={{ transform: `translateX(-${at * 100}%)` }}>
            {(list.length ? list : [""]).map((src, i) => (
              <div className="gallery__slide" key={`${i}:${src}`} aria-hidden={i !== at}>
                <ShoeImage src={src} alt={alt} />
              </div>
            ))}
          </div>
        </div>
        {many && (
          <>
            <button className="gallery__arrow gallery__arrow--prev" onClick={prev} aria-label="이전 이미지">
              ‹
            </button>
            <button className="gallery__arrow gallery__arrow--next" onClick={next} aria-label="다음 이미지">
              ›
            </button>
          </>
        )}
      </div>

      {many && (
        <div
          className={`gallery__thumbs ${dragging ? "is-dragging" : ""}`}
          ref={thumbsRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          {list.map((src, i) => (
            <button
              key={`${i}:${src}`}
              className={`gallery__thumb ${i === at ? "is-active" : ""}`}
              onClick={() => drag.current.moved <= 5 && setIndex(i)}
              aria-label={`${i + 1}번 이미지 보기`}
              aria-current={i === at}
            >
              <img src={asset(src)} alt="" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ShoeGallery;
