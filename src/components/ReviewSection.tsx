import { API } from "../api";
import { useState, useEffect } from "react";
import type { Review } from "../types";
import ConfirmModal from "./ConfirmModal";
import { formatDate } from "../utils/date";
import "./ReviewSection.css";

interface ReviewSectionProps {
  shoeId: number;
  onReviewChange: () => void;
}

function ReviewSection({ shoeId, onReviewChange }: ReviewSectionProps) {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [author, setAuthor] = useState("");
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRating, setEditRating] = useState(5);
  const [editContent, setEditContent] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Review | null>(null);

  const getReviews = async () => {
    const res = await fetch(`${API}/reviews?shoeId=${shoeId}`);
    const list: Review[] = await res.json();
    setReviews(
      list.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    );
  };
  useEffect(() => {
    getReviews();
  }, [shoeId]);

  const addReview = async () => {
    if (!author.trim() || !content.trim()) {
      alert("닉네임과 내용을 입력해 주세요.");
      return;
    }

    await fetch(`${API}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        shoeId,
        author,
        rating,
        content,
        createdAt: new Date().toISOString(),
      }),
    });

    setAuthor("");
    setContent("");
    setRating(5);
    getReviews();
    onReviewChange();
  };

  const startEdit = (review: Review) => {
    setEditingId(review.id);
    setEditRating(review.rating);
    setEditContent(review.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async (id: number) => {
    if (!editContent.trim()) {
      alert("내용을 입력해 주세요.");
      return;
    }

    await fetch(`${API}/reviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: editRating, content: editContent }),
    });

    setEditingId(null);
    getReviews();
    onReviewChange();
  };

  const deleteReview = async () => {
    if (!deleteTarget) return;

    await fetch(`${API}/reviews/${deleteTarget.id}`, {
      method: "DELETE",
    });
    setDeleteTarget(null);
    await getReviews();
    onReviewChange();
  };

  return (
    <section className="review">
      <h3 className="review__title">리뷰 {reviews.length}</h3>

      <ul className="review__list">
        {reviews.length === 0 && (
          <li className="review__empty">아직 등록된 리뷰가 없습니다.</li>
        )}

        {reviews.map((review) => (
          <li className="review__item" key={review.id}>
            {editingId === review.id ? (
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
                  <button className="review__cancel" onClick={cancelEdit}>
                    취소
                  </button>
                  <button
                    className="review__save"
                    onClick={() => saveEdit(review.id)}
                  >
                    저장
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="review__head">
                  <span className="review__author">{review.author}</span>
                  <span className="review__stars">
                    {"★".repeat(review.rating)}
                    <em>{"★".repeat(5 - review.rating)}</em>
                  </span>
                  <div className="review__tools">
                    <button
                      className="review__tool"
                      onClick={() => startEdit(review)}
                    >
                      수정
                    </button>
                    <button
                      className="review__tool review__tool--delete"
                      onClick={() => setDeleteTarget(review)}
                    >
                      삭제
                    </button>
                  </div>
                </div>
                <p className="review__content">{review.content}</p>
                <span className="review__date">
                  {formatDate(review.createdAt)}
                </span>{" "}
              </>
            )}
          </li>
        ))}
      </ul>

      <div className="review__form">
        <div className="review__row">
          <input
            className="review__input"
            type="text"
            placeholder="닉네임"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />

          <div className="review__rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                className={`review__star ${n <= rating ? "is-on" : ""}`}
                onClick={() => setRating(n)}
                aria-label={`${n}점`}
              >
                ★
              </button>
            ))}
          </div>
        </div>

        <textarea
          className="review__textarea"
          placeholder="이 신발을 신어본 경험을 남겨 주세요."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
        />

        <button className="review__submit" onClick={addReview}>
          리뷰 등록
        </button>
      </div>
      {deleteTarget && (
        <ConfirmModal
          message="이 리뷰를 삭제할까요?"
          detail={`${deleteTarget.author}님이 작성한 리뷰가 삭제되며 되돌릴 수 없습니다.`}
          onConfirm={deleteReview}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </section>
  );
}

export default ReviewSection;
