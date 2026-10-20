import { useState } from "react";
import { Link } from "react-router-dom";
import type { Review } from "../types";
import { formatDate } from "../utils/date";
import { contentError } from "./reviewRules";

interface ReviewItemProps {
  review: Review;
  isBest?: boolean;
  /** 수정 — 작성자만. 지우기 — 작성자 또는 admin(서버가 403 으로 다시 막는다) */
  canEdit: boolean;
  canDelete: boolean;
  /** 공감: login = 로그인 안 함(누르면 로그인으로), mine = 내 리뷰(못 누른다), ok */
  likeState: "login" | "mine" | "ok";
  loginTo: string;
  /** 성공하면 null, 실패하면 화면 문구 */
  onUpdate: (id: number, rating: number, content: string) => Promise<string | null>;
  onDeleteRequest: (review: Review) => void;
  onLike: (review: Review) => void;
}

function ReviewItem({
  review,
  isBest,
  canEdit,
  canDelete,
  likeState,
  loginTo,
  onUpdate,
  onDeleteRequest,
  onLike,
}: ReviewItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editRating, setEditRating] = useState(review.rating);
  const [editContent, setEditContent] = useState(review.content);
  const [editError, setEditError] = useState<string | null>(null);

  const startEdit = () => {
    setEditRating(review.rating);
    setEditContent(review.content);
    setIsEditing(true);
  };

  const saveEdit = async () => {
    const err = contentError(editContent) ?? (await onUpdate(review.id, editRating, editContent));
    setEditError(err);
    if (!err) setIsEditing(false);
  };

  const likeLabel = `👍 도움이 돼요 ${review.likeCount ?? 0}`;

  return (
    <li id={`review-${review.id}`} className={`review__item ${isBest ? "is-best" : ""}`}>
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
            onChange={(e) => {
              setEditContent(e.target.value);
              setEditError(null);
            }}
            rows={3}
            maxLength={1000}
            aria-invalid={Boolean(editError)}
          />
          {editError && (
            <p className="review__error" role="alert">
              {editError}
            </p>
          )}

          <div className="review__actions">
            <button
              className="review__cancel"
              onClick={() => {
                setIsEditing(false);
                setEditError(null);
              }}
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
            {(canEdit || canDelete) && (
              <div className="review__tools">
                {canEdit && (
                  <button className="review__tool" onClick={startEdit}>
                    수정
                  </button>
                )}
                {canDelete && (
                  <button className="review__tool review__tool--delete" onClick={() => onDeleteRequest(review)}>
                    삭제
                  </button>
                )}
              </div>
            )}
          </div>

          <p className="review__content">{review.content}</p>

          <div className="review__bottom">
            <span className="review__date">{formatDate(review.createdAt)}</span>
            {likeState === "login" ? (
              <Link className="review__like" to={loginTo}>
                {likeLabel}
              </Link>
            ) : (
              <button
                className={`review__like ${review.liked ? "is-on" : ""}`}
                onClick={() => onLike(review)}
                disabled={likeState === "mine"}
                title={likeState === "mine" ? "내 리뷰에는 누를 수 없어요" : undefined}
                aria-pressed={Boolean(review.liked)}
              >
                {likeLabel}
              </button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

export default ReviewItem;