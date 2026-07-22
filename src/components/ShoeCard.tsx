import type { Shoe } from "../types";
import "./ShoeCard.css";

interface ShoeCardProps {
  shoe: Shoe;
  index: number;
  onClick: () => void;
  onToggleLike: () => void;
}

function ShoeCard({ shoe, index, onClick, onToggleLike }: ShoeCardProps) {
  const handleLikeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleLike();
  };

  return (
    <article className="card" onClick={onClick}>
      <div className="card__frame">
        {shoe.carbon && <span className="card__badge">카본 플레이트</span>}

        <button
          className={`card__like ${shoe.liked ? "is-liked" : ""}`}
          onClick={handleLikeClick}
          aria-label={shoe.liked ? "찜 해제" : "찜하기"}
        >
          {shoe.liked ? "♥" : "♡"}
          <em>{shoe.likeCount}</em>
        </button>

        <div className="card__image">
          {shoe.image && <img src={shoe.image} alt={shoe.model} />}
        </div>
      </div>

      <p className="card__no">
        NO.{String(index + 1).padStart(2, "0")} · {shoe.purpose}
      </p>
      <h3 className="card__model">{shoe.model}</h3>
      <p className="card__brand">{shoe.brand}</p>

      <p className="card__summary">{shoe.summary}</p>

      <dl className="card__specs">
        <div>
          <dt>중량</dt>
          <dd>{shoe.weight}g</dd>
        </div>
        <div>
          <dt>드롭</dt>
          <dd>{shoe.drop}mm</dd>
        </div>
        <div>
          <dt>발볼</dt>
          <dd>{shoe.width}</dd>
        </div>
      </dl>

      <div className="card__bottom">
        <span className="card__stability">{shoe.stability}</span>
        <span className="card__rating">
          {shoe.rating.toFixed(1)}
          <em>리뷰 {shoe.reviewCount}</em>
        </span>
      </div>
    </article>
  );
}

export default ShoeCard;
