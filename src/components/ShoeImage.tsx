import { useState } from 'react'
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
        <span>이미지 준비 중</span>
      </div>
    )
  }

  return (
    <img
      className="shoeimage"
      src={src}
      alt={alt}
      onError={() => setFailed(true)}
    />
  )
}

export default ShoeImage