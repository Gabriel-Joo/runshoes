import { useState, useEffect } from "react";
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
    setIndex(0);
  }, [image]);

  const prev = () => setIndex((i) => (i - 1 + list.length) % list.length);
  const next = () => setIndex((i) => (i + 1) % list.length);

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
        <div className="gallery__thumbs">
          {list.map((src, i) => (
            <button
              key={src}
              className={`gallery__thumb ${i === index ? "is-active" : ""}`}
              onClick={() => setIndex(i)}
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
