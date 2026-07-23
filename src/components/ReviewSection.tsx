import { API } from "../api";
import { useState, useEffect } from "react";
import type { Review } from "../types";
import ReviewItem from "./ReviewItem";
import ConfirmModal from "./ConfirmModal";
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

  const updateReview = async (id: number, rating: number, content: string) => {
    await fetch(`${API}/reviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, content }),
    });
    await getReviews();
    onReviewChange();
  };

  const deleteReview = async () => {
    if (!deleteTarget) return;

    await fetch(`${API}/reviews/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    await getReviews();
    onReviewChange();
  };
  const toggleLike = async (review: Review) => {
    const liked = !review.liked;
    const likeCount = (review.likeCount ?? 0) + (liked ? 1 : -1);

    await fetch(`${API}/reviews/${review.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ liked, likeCount }),
    });
    await getReviews();
  };
  const bestReview = reviews
    .filter((r) => (r.likeCount ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.likeCount ?? 0) - (a.likeCount ?? 0) ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )[0];

  const restReviews = reviews.filter((r) => r.id !== bestReview?.id);

  return (
    <section className="review">
      <h3 className="review__title">리뷰 {reviews.length}</h3>

      <ul className="review__list">
        {reviews.length === 0 && (
          <li className="review__empty">아직 등록된 리뷰가 없습니다.</li>
        )}

        {bestReview && (
          <ReviewItem
            key={bestReview.id}
            review={bestReview}
            isBest
            onUpdate={updateReview}
            onDeleteRequest={setDeleteTarget}
            onLike={toggleLike}
          />
        )}

        {restReviews.map((review) => (
          <ReviewItem
            key={review.id}
            review={review}
            onUpdate={updateReview}
            onDeleteRequest={setDeleteTarget}
            onLike={toggleLike}
          />
        ))}
      </ul>

      {/* 작성 폼은 기존 그대로 */}
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
