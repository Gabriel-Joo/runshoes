import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import type { Review } from "../types";
import { useAuth } from "../auth/useAuth";
import { apiFetch } from "../auth/session";
import { loginPath } from "../auth/session";
import ReviewItem from "./ReviewItem";
import { clampReview, contentError, reviewError, REVIEW_MAX } from "./reviewRules";
import ReviewCounter from "./ReviewCounter";
import { demoBlocked } from "../auth/demoAdmin";
import ConfirmModal from "./ConfirmModal";
import "./ReviewSection.css";

interface ReviewSectionProps {
  shoeId: number;
  onReviewChange: () => void;
}

// 쓰던 리뷰 — 쓰는 중에 로그인이 끝나도(refresh 실패) 다시 로그인하면 이어 쓰게. 탭 안에서만(sessionStorage)
const draftKey = (shoeId: number) => `runshoes:review-draft:${shoeId}`;
const loadDraft = (shoeId: number): { rating: number; content: string } | null => {
  try {
    return JSON.parse(sessionStorage.getItem(draftKey(shoeId)) ?? "null");
  } catch {
    return null;
  }
};
const saveDraft = (shoeId: number, d: { rating: number; content: string } | null) => {
  try {
    if (d) sessionStorage.setItem(draftKey(shoeId), JSON.stringify(d));
    else sessionStorage.removeItem(draftKey(shoeId));
  } catch {
    /* 저장소를 못 쓰면 이어 쓰기만 안 된다 */
  }
};

/**
 * 리뷰 — 작성자는 계정에서(닉네임 칸 없음). 폼은 셋 중 하나: 로그인 안내 / "이미 썼어요" / 작성 폼.
 * 수정은 내 리뷰만, 지우기는 내 리뷰 또는 admin. 공감은 남의 리뷰에만. 평점은 서버가 다시 센다(onReviewChange 는 목록만 다시 받는다)
 */
function ReviewSection({ shoeId, onReviewChange }: ReviewSectionProps) {
  const { status, user, isAdmin, setNotice } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Review | null>(null);
  const backHere = loginPath(`/?shoe=${shoeId}`);

  const getReviews = async () => {
    const res = await apiFetch(`/reviews?shoeId=${shoeId}`);
    const list: Review[] = await res.json();
    setReviews(list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
  };

  useEffect(() => {
    if (status !== "loading") getReviews();
  }, [shoeId, status, user?.id]);

  // 다시 로그인했으면 쓰던 것을 되살린다 — 로그인 상태 · 신발이 바뀐 그 렌더에서 한 번(effect 로 하면 한 번 더 그린다)
  const draftFor = status === "user" ? `${user!.id}:${shoeId}` : null;
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  if (draftFor && restoredFor !== draftFor) {
    setRestoredFor(draftFor);
    const d = loadDraft(shoeId);
    if (d) {
      setRating(d.rating);
      setContent(d.content);
    }
    setExpired(false);
  }

  const mine = user ? reviews.find((r) => r.userId === user.id && r.reviewType === "FIRST") : undefined;

  const addReview = async () => {
    const err = contentError(content);
    if (err) return setFormError(err);
    setBusy(true);
    setFormError(null);
    const res = await apiFetch("/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shoeId, rating, content: content.trim() }),
    }).catch(() => null);
    setBusy(false);
    if (!res) return setFormError("서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.");
    if (res.status === 401) {
      saveDraft(shoeId, { rating, content });
      setExpired(true);
      return;
    }
    if (!res.ok) return setFormError(await reviewError(res, "리뷰를 올리지 못했어요. 내용을 확인해 주세요."));
    saveDraft(shoeId, null);
    setContent("");
    setRating(5);
    await getReviews();
    onReviewChange();
  };

  /** 성공하면 null, 실패하면 화면 문구 */
  const updateReview = async (id: number, rating: number, content: string) => {
    const res = await apiFetch(`/reviews/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, content: content.trim() }),
    }).catch(() => null);
    if (!res) return "서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.";
    if (!res.ok) return reviewError(res, "고치지 못했어요. 내용을 확인해 주세요.");
    await getReviews();
    onReviewChange();
    return null;
  };

  const deleteReview = async () => {
    if (!deleteTarget) return;
    const res = await apiFetch(`/reviews/${deleteTarget.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    const blocked = await demoBlocked(res);
    if (blocked) return setNotice(blocked);
    await getReviews();
    onReviewChange();
  };

  // 공감 — 응답의 liked · likeCount 로 그 리뷰만 바꾼다(순서는 그대로 — 누르자마자 베스트가 바뀌어 튀지 않게)
  const toggleLike = async (review: Review) => {
    const res = await apiFetch(`/reviews/${review.id}/like`, { method: review.liked ? "DELETE" : "PUT" });
    const blocked = await demoBlocked(res);   // 데모 관리자 — 공감도 막는다
    if (blocked) return setNotice(blocked);
    if (!res.ok) return;
    const { liked, likeCount } = await res.json();
    setReviews((list) => list.map((r) => (r.id === review.id ? { ...r, liked, likeCount } : r)));
  };

  // 처음에는 하나만 보인다 — "도움이 돼요"가 가장 많은 리뷰, 동점이면 최신. 전부 0이면 최신 리뷰(베스트 표시 없이)
  const bestReview = [...reviews].sort(
    (a, b) =>
      (b.likeCount ?? 0) - (a.likeCount ?? 0) ||
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
  const isBest = (bestReview?.likeCount ?? 0) > 0;

  // 나머지는 "리뷰 전체보기"로 편다 — reviews 순서(최신순) 그대로
  const restReviews = reviews.filter((r) => r.id !== bestReview?.id);

  const item = (review: Review, best = false) => (
    <ReviewItem
      key={review.id}
      review={review}
      isBest={best}
      canEdit={Boolean(user && review.userId === user.id)}
      canDelete={Boolean(user && (review.userId === user.id || isAdmin))}
      likeState={status !== "user" ? "login" : review.userId === user?.id ? "mine" : "ok"}
      loginTo={backHere}
      onUpdate={updateReview}
      onDeleteRequest={setDeleteTarget}
      onLike={toggleLike}
    />
  );

  return (
    <section className="review">
      <h3 className="review__title">리뷰 {reviews.length}</h3>

      <ul className="review__list">
        {reviews.length === 0 && <li className="review__empty">아직 등록된 리뷰가 없습니다.</li>}
        {bestReview && item(bestReview, isBest)}
        {expanded && restReviews.map((review) => item(review))}
      </ul>

      {restReviews.length > 0 && (
        <button className="review__more" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
          {expanded ? "리뷰 접기" : `리뷰 전체보기 (${reviews.length}개)`}
        </button>
      )}

      {status === "anonymous" && (
        <div className="review__form review__gate">
          <p>{expired ? "로그인이 끝났어요. 다시 로그인해 주세요. 쓰던 내용은 남겨 두었어요." : "리뷰를 쓰려면 로그인해 주세요."}</p>
          <Link className="review__submit review__gatebtn" to={backHere}>
            로그인
          </Link>
        </div>
      )}

      {status === "user" && mine && (
        <div className="review__form review__gate">
          <p>이 신발에는 이미 리뷰를 썼어요.</p>
          <button
            className="review__more"
            onClick={() => {
              setExpanded(true);
              requestAnimationFrame(() => document.getElementById(`review-${mine.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" }));
            }}
          >
            내 리뷰 보기
          </button>
        </div>
      )}

      {status === "user" && !mine && (
        <div className="review__form">
          <div className="review__row">
            <span className="review__as">
              <strong>{user!.nickname}</strong>님으로 작성
            </span>
            <div className="review__rating" role="radiogroup" aria-label="별점">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} className={`review__star ${n <= rating ? "is-on" : ""}`} onClick={() => setRating(n)} aria-label={`${n}점`} aria-pressed={n === rating}>
                  ★
                </button>
              ))}
            </div>
          </div>

          <textarea
            className="review__textarea"
            placeholder="이 신발을 신어본 경험을 남겨 주세요. (10~300자)"
            value={content}
            onChange={(e) => {
              setContent(clampReview(e.target.value));
              setFormError(null);
            }}
            rows={3}
            maxLength={REVIEW_MAX * 2}
            aria-invalid={Boolean(formError)}
          />
          <ReviewCounter value={content} />
          {formError && (
            <p className="review__error" role="alert">
              {formError}
            </p>
          )}

          <button className="review__submit" onClick={addReview} disabled={busy}>
            {busy ? "올리는 중…" : "리뷰 등록"}
          </button>
        </div>
      )}

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
