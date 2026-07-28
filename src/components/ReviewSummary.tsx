import { useState, useEffect } from "react";
import "./ReviewSummary.css";
import { API } from "../api";

type Summary = { positive: string; negative: string | null } | null;

const ReviewSummary = ({ shoeId }: { shoeId: number }) => {
  const [summary, setSummary] = useState<Summary>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
    setSummary(null);

    fetch(`${API}/shoes/${shoeId}/summary`)
      .then((res) => res.json())
      .then((data) => {
        setSummary(data.summary);
        setLoading(false);
      })
      .catch(() => {
        setFailed(true);
        setLoading(false);
      });
  }, [shoeId]);

  if (loading) {
    return (
      <p className="review-summary review-summary--loading">
        Ollama AI가 리뷰를 분석하고 있어요…{" "}
      </p>
    );
  }

  if (failed || !summary) {
    return null; // 실패하거나 리뷰가 부족하면 조용히 숨김
  }

  return (
    <div className="review-summary">
      <p className="review-summary__label">
        {loading
          ? "Ollama AI가 리뷰를 분석하고 있어요…"
          : "Ollama AI가 리뷰를 요약했어요!"}
      </p>
      {loading && (
        <p className="review-summary__loading-text">잠시만 기다려주세요.</p>
      )}
      {!loading && summary && (
        <>
          <p className="review-summary__positive">
            <strong>좋았던 점</strong> {summary.positive}
          </p>
          {summary.negative && (
            <p className="review-summary__negative">
              <strong>아쉬운 점</strong> {summary.negative}
            </p>
          )}
        </>
      )}
      {!loading && !summary && !failed && (
        <p className="review-summary__empty">
          리뷰가 더 쌓이면 요약을 제공해요.
        </p>
      )}
    </div>
  );
};

export default ReviewSummary;
