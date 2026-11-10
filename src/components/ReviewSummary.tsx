import { useState, useEffect } from "react";
import "./ReviewSummary.css";
import { API } from "../api";

type Summary = { positive: string; negative: string | null };

/**
 * 리뷰 AI 요약 — 서버는 DB 에 만들어 둔 요약을 읽어 주기만 한다(V14 — 하루 한 번 배치가 만든다, docs/09_chatbot_rag.md 5절).
 * "리뷰 N건 기준" — 요약이 그 시점 스냅샷이라 아래 리뷰 목록과 조금 어긋나도 거짓말이 되지 않게(2026-11-10 사용자).
 * 요약이 없거나(리뷰 3건 미만 · 아직 만들지 않음) 읽기 실패면 조용히 숨긴다.
 */
const ReviewSummary = ({ shoeId }: { shoeId: number }) => {
  // 받은 신발 id 와 함께 둔다 — 다른 신발로 바뀌면 받기 전까지 숨긴다(effect 안에서 비우지 않는다)
  const [got, setGot] = useState<{ id: number; summary: Summary | null; count: number | null } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API}/shoes/${shoeId}/summary`)
      .then((res) => res.json())
      .then((data) => {
        if (alive) setGot({ id: shoeId, summary: data.summary ?? null, count: typeof data.reviewCount === "number" ? data.reviewCount : null });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [shoeId]);

  const summary = got?.id === shoeId ? got.summary : null;
  const count = got?.id === shoeId ? got.count : null;
  if (!summary) return null;

  return (
    <div className="review-summary">
      <p className="review-summary__label">
        Ollama AI가 리뷰를 요약했어요!
        {count !== null && <span className="review-summary__basis">리뷰 {count}건 기준</span>}
      </p>
      <p className="review-summary__positive">
        <strong>좋았던 점</strong> {summary.positive}
      </p>
      {summary.negative && (
        <p className="review-summary__negative">
          <strong>아쉬운 점</strong> {summary.negative}
        </p>
      )}
    </div>
  );
};

export default ReviewSummary;
