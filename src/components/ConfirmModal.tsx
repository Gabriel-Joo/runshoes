import type { ReactNode } from "react";
import "./ConfirmModal.css";

interface ConfirmModalProps {
  message: string;
  detail?: ReactNode;
  /** 확인 창 안의 경고 한 줄(예: "이 라인에 현행이 없어집니다") — 강조색 */
  warning?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 확인 버튼을 누르는 중(두 번 누르지 않게) */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({
  message,
  detail,
  warning,
  confirmLabel = "삭제",
  cancelLabel = "취소",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <div
      className="confirm"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      <div className="confirm__box" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <p className="confirm__message">{message}</p>
        {detail && <div className="confirm__detail">{detail}</div>}
        {warning && (
          <p className="confirm__warning" role="alert">
            {warning}
          </p>
        )}

        <div className="confirm__actions">
          <button className="confirm__cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="confirm__ok" onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
