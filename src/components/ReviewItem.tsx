import { useState } from "react";
import type { Review } from "../types";
import { formatDate } from "../utils/date";

interface ReviewItemProps {
  review: Review;
  isBest?: boolean;
  onUpdate: (id: number, rating: number, content: string) => void;
  onDeleteRequest: (review: Review) => void;
  onLike: (review: Review) => void;
}

function ReviewItem({
  review,
  isBest,
  onUpdate,
  onDeleteRequest,
  onLike,
}: ReviewItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editRating, setEditRating] = useState(review.rating);
  const [editContent, setEditContent] = useState(review.content);

  const startEdit = () => {
    setEditRating(review.rating);
    setEditContent(review.content);
    setIsEditing(true);
  };

  const saveEdit = () => {
    if (!editContent.trim()) {
      alert("내용을 입력해 주세요.");
      return;
    }
    onUpdate(review.id, editRating, editContent);
    setIsEditing(false);
  };

  return (
    <li className={`review__item ${isBest ? "is-best" : ""}`}>
      {isEditing ? (
        <div className="review__edit">
          <div className="review__head">
            <span className="review__author">{review.author}</span>
            <div className="review__rating">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  className={`review__star ${n <= editRating ? "is-on" : ""}`}
                  onClick={() => setEditRating(n)}
                  aria-label={`${n}점`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>

          <textarea
            className="review__textarea"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={3}
          />

          <div className="review__actions">
            <button
              className="review__cancel"
              onClick={() => setIsEditing(false)}
            >
              취소
            </button>
            <button className="review__save" onClick={saveEdit}>
              저장
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="review__head">
            {isBest && <span className="review__badge">베스트 리뷰</span>}
            <span className="review__author">{review.author}</span>
            <span className="review__stars">
              {"★".repeat(review.rating)}
              <em>{"★".repeat(5 - review.rating)}</em>
            </span>
            <div className="review__tools">
              <button className="review__tool" onClick={startEdit}>
                수정
              </button>
              <button
                className="review__tool review__tool--delete"
                onClick={() => onDeleteRequest(review)}
              >
                삭제
              </button>
            </div>
          </div>

          <p className="review__content">{review.content}</p>

          <div className="review__bottom">
            <span className="review__date">{formatDate(review.createdAt)}</span>
            <button
              className={`review__like ${review.liked ? "is-on" : ""}`}
              onClick={() => onLike(review)}
            >
              👍 도움이 돼요 {review.likeCount ?? 0}
            </button>
          </div>
        </>
      )}
    </li>
  );
}

export default ReviewItem;