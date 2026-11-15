import { useEffect, type ReactNode } from "react";

/**
 * 글 전문 — 읽기 전용 모달(2026-10-30 사용자 — 표 안에서 펼치면 300자에 줄이 흔들린다). 마이페이지의 내 리뷰 · 도움받은 리뷰,
 * 관리자 페이지의 리뷰 관리 · 챗봇 문의(질문 원문, 2026-11-15 — 휴대폰은 마우스 툴팁을 볼 수 없다)가 같이 쓴다. 모양(.reader)은 Account.css
 */
function ReviewReader({ title, meta, content, onClose, label = "리뷰 전문" }: { title: string; meta: ReactNode; content: string; onClose: () => void; label?: string }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="confirm" onClick={onClose}>
      <div className="reader" role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        <div className="reader__head">
          <div>
            <p className="reader__model">{title}</p>
            <p className="reader__meta">{meta}</p>
          </div>
          <button className="reader__close" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <p className="reader__content">{content}</p>
      </div>
    </div>
  );
}

export default ReviewReader;
