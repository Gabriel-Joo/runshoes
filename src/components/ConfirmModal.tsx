import "./ConfirmModal.css";

interface ConfirmModalProps {
  message: string;
  detail?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmModal({
  message,
  detail,
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
      <div className="confirm__box" onClick={(e) => e.stopPropagation()}>
        <p className="confirm__message">{message}</p>
        {detail && <p className="confirm__detail">{detail}</p>}

        <div className="confirm__actions">
          <button className="confirm__cancel" onClick={onCancel}>
            취소
          </button>
          <button className="confirm__ok" onClick={onConfirm}>
            삭제
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;
