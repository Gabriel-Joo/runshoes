import { useState, useEffect, useRef } from "react";
import { asset } from "../api";
import ShoeImage from "./ShoeImage";
import "./ShoeGallery.css";

interface ShoeGalleryProps {
  image: string;
  images?: string[];
  alt: string;
}

function ShoeGallery({ image, images, alt }: ShoeGalleryProps) {
  const list = images && images.length > 0 ? images : [image];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = thumbsRef.current;
    if (!el) return;

    const thumb = el.children[index] as HTMLElement | undefined;
    if (thumb) {
      thumb.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }
  }, [index]);

  const prev = () => setIndex((i) => (i - 1 + list.length) % list.length);
  const next = () => setIndex((i) => (i + 1) % list.length);

  const thumbsRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({
    active: false,
    startX: 0,
    startScroll: 0,
    moved: 0,
  });
  const [dragging, setDragging] = useState(false);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = thumbsRef.current;
    if (!el) return;

    dragRef.current = {
      active: true,
      startX: e.clientX,
      startScroll: el.scrollLeft,
      moved: 0,
    };
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const el = thumbsRef.current;
    const drag = dragRef.current;
    if (!el || !drag.active) return;

    const distance = e.clientX - drag.startX;
    drag.moved = Math.abs(distance);
    el.scrollLeft = drag.startScroll - distance;
  };

  const onPointerUp = () => {
    dragRef.current.active = false;
    setDragging(false);
  };

  return (
    <div className="gallery">
      <div className="gallery__stage">
        <div
          className="gallery__track"
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {list.map((src) => (
            <div className="gallery__slide" key={src}>
              <ShoeImage src={src} alt={alt} />
            </div>
          ))}
        </div>

        {list.length > 1 && (
          <>
            <button
              className="gallery__arrow gallery__arrow--prev"
              onClick={prev}
              aria-label="이전 이미지"
            >
              ‹
            </button>
            <button
              className="gallery__arrow gallery__arrow--next"
              onClick={next}
              aria-label="다음 이미지"
            >
              ›
            </button>
          </>
        )}
      </div>

      {list.length > 1 && (
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
              key={src}
              className={`gallery__thumb ${i === index ? "is-active" : ""}`}
              onClick={() => {
                if (dragRef.current.moved > 5) return;
                setIndex(i);
              }}
              aria-label={`${i + 1}번 이미지 보기`}
            >
              <img src={asset(src)} alt="" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default ShoeGallery;
