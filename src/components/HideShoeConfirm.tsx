import { useEffect, useState } from "react";
import { API } from "../api";
import type { Shoe } from "../types";
import ConfirmModal from "./ConfirmModal";

/**
 * 신발 숨김(V8) 확인 — 등록·관리 목록과 수정 폼이 같이 쓴다. 문구 · 버튼은 "숨김"(2026-11-01 사용자 — 실제로 지우지 않는다. 영구 삭제는 숨긴 신발 탭).
 * 리뷰 · 찜은 지워지지 않고 신발과 함께 숨는다(되살리면 돌아온다). 수를 보여 준다(2026-10-30 사용자 — 찜도 알린다).
 * 현행 세대를 숨기면 그 라인에 현행이 남지 않을 때 경고만 — 다른 세대를 저절로 현행으로 올리지 않는다(2026-10-30 사용자).
 */
function HideShoeConfirm({ shoe, busy, onConfirm, onCancel }: { shoe: Shoe; busy?: boolean; onConfirm: () => void; onCancel: () => void }) {
  const [lastCurrent, setLastCurrent] = useState(false);

  useEffect(() => {
    if (!shoe.isCurrent || !shoe.lineKey) return;
    const ctrl = new AbortController();
    fetch(`${API}/shoes?lineKey=${encodeURIComponent(shoe.lineKey)}&isCurrent=true`, { signal: ctrl.signal })
      .then((res) => res.json())
      .then((list: Shoe[]) => setLastCurrent(!list.some((s) => s.id !== shoe.id)))
      .catch(() => {});
    return () => ctrl.abort();
  }, [shoe.id, shoe.isCurrent, shoe.lineKey]);

  return (
    <ConfirmModal
      message={`'${shoe.model}'을(를) 숨길까요?`}
      detail={
        <>
          <p>
            리뷰 <strong>{shoe.reviewCount}개</strong> · 찜 <strong>{shoe.likeCount}개</strong>도 함께 화면에서 사라집니다.
          </p>
          <p>숨긴 신발 탭에서 언제든 되살릴 수 있어요 — 리뷰 · 찜도 함께 돌아옵니다.</p>
        </>
      }
      confirmLabel="숨김"
      warning={lastCurrent ? "이 라인에 현행이 없어집니다" : undefined}
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

export default HideShoeConfirm;
