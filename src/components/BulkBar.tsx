/** 표 위 — "N개 선택됨 · [선택 …]". 마이페이지의 내 리뷰 · 도움받은 리뷰, 관리자 마이페이지의 리뷰 관리가 같이 쓴다(모양은 Account.css) */
function BulkBar({ count, label, onRun }: { count: number; label: string; onRun: () => void }) {
  return (
    <div className="mypage__bulk">
      <span className="mypage__bulkcount">{count > 0 ? `${count}개 선택됨` : ""}</span>
      <button className="mypage__btn is-danger is-strong" onClick={onRun} disabled={count === 0}>
        {label}
      </button>
    </div>
  );
}

export default BulkBar;
