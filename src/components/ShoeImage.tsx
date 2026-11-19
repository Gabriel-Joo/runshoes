import { useState } from 'react'
import { asset } from "../api";
import './ShoeImage.css'

interface ShoeImageProps {
  src: string
  alt: string
}

function ShoeImage({ src, alt }: ShoeImageProps) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <div className="shoeimage shoeimage--empty">
        {/* 운영 신발은 모두 사진이 있다(2026-11-19 공개 API 310켤레). 빈 칸은 받기 실패라 "준비 중"이라 쓰지 않는다. 56px 썸네일에도 들어가게 짧게 */}
        <span>이미지 없음</span>
      </div>
    )
  }

  return (
    <img
      className="shoeimage"
      src={asset(src)}
      alt={alt}
      onError={() => setFailed(true)}
    />
  )
}

export default ShoeImage