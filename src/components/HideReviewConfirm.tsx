import ConfirmModal from "./ConfirmModal";
import { WHEN_APPLIED } from "./reviewRules";

/**
 * 리뷰 하나 숨기기 확인 창 — 관리자 마이페이지 리뷰 관리와 상세 모달이 같은 창을 쓴다(2026-11-15 사용자: 상세 모달에는 숨기기만).
 * 둘 다 POST /api/admin/reviews/{id}/hide 를 부른다
 */
function HideReviewConfirm({
  model,
  author,
  busy,
  onConfirm,
  onCancel,
}: {
  model?: string | null;
  author: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ConfirmModal
      message="이 리뷰를 숨길까요?"
      detail={<>
        <p>{model ?? "이 신발"}에 {author}님이 쓴 리뷰예요.</p>
        <p>{WHEN_APPLIED}</p>
        <p>숨긴 리뷰에서 언제든 되살릴 수 있어요.</p>
      </>}
      confirmLabel="숨기기"
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export default HideReviewConfirm;
