import ShoeImage from "./ShoeImage";
import "./ShoeGallery.css";

// 상세 모달의 신발 사진 — 대표 색상 1장(StockX)으로 통일했다(2026-10-24). 썸네일 줄 · 좌우 화살표는 없다
interface ShoeGalleryProps {
  image: string;
  alt: string;
}

function ShoeGallery({ image, alt }: ShoeGalleryProps) {
  return (
    <div className="gallery">
      <div className="gallery__stage">
        <ShoeImage src={image} alt={alt} />
      </div>
    </div>
  );
}

export default ShoeGallery;
