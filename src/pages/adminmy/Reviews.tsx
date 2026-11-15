import { useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "../../auth/session";
import { demoBlocked, serverMessage } from "../../auth/demoAdmin";
import { useAuth } from "../../auth/useAuth";
import ShoeImage from "../../components/ShoeImage";
import ConfirmModal from "../../components/ConfirmModal";
import HideReviewConfirm from "../../components/HideReviewConfirm";
import { WHEN_APPLIED } from "../../components/reviewRules";
import ReviewReader from "../../components/ReviewReader";
import BulkBar from "../../components/BulkBar";
import { runEach, useSelection } from "../../utils/bulk";
import { DateRange, Pager, TextFilter } from "./parts";
import { qs, useQuery, usePaged, when } from "./paged";

/** GET /api/admin/reviews 의 한 줄(api/AdminReviews) */
export interface AdminReview {
  id: number;
  shoeId: number | null;
  brand: string | null;
  model: string | null;
  image: string | null;
  shoeHidden: boolean;
  userId: number | null;
  author: string;
  rating: number;
  content: string;
  createdAt: string;
  likeCount: number | null;
  reviewType: "FIRST" | "FOLLOWUP";
  verified: boolean;
  verifiedAt: string | null;
  hiddenAt: string | null;
  /** 영구 삭제 때 함께 지워지는 도움이 돼요 행(실사용 후기의 것까지) */
  helpfulRows: number;
  followups: number;
}

/**
 * 리뷰 관리 — 전체 리뷰(실사용 인증 · 숨기기)와 숨긴 리뷰(되살리기 · 영구 삭제). 신발 숨김과 같은 흐름이다: 숨기기 → 숨긴 리뷰 → 거기서만 영구 삭제.
 * 표는 마이페이지 「도움받은 리뷰」와 같은 칸(작성자가 있는 표). 날짜 최신순(서버), 거르기는 날짜 · 신발 · 작성자 — 모두 주소에 둔다.
 * 데모 관리자도 버튼이 보이고, 누르면 서버가 403 문구로 막는다(등록·관리 탭과 같다)
 */
function Reviews({ hidden }: { hidden: boolean }) {
  const { setNotice } = useAuth();
  const q = useQuery();
  const page = Number(q.get("page")) || 1;
  const path = `/admin/reviews${qs({ hidden: hidden ? "true" : "", from: q.get("from"), to: q.get("to"), shoe: q.get("shoe"), author: q.get("author"), page })}`;
  const { data, error, reload } = usePaged<AdminReview>(path);
  const items = data?.items ?? [];
  const sel = useSelection(items.map((r) => r.id));
  const [reading, setReading] = useState<AdminReview | null>(null);
  const [hideTarget, setHideTarget] = useState<AdminReview | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<AdminReview | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  /** 하나에 쓰기 — 데모 관리자 403 · 상태 충돌(409) 문구는 그대로, 그 밖은 일반 문구 */
  const act = async (method: string, url: string, done: string) => {
    setBusy(true);
    const res = await apiFetch(url, { method }).catch(() => null);
    setBusy(false);
    const blocked = res && (await demoBlocked(res));
    if (blocked) setNotice(blocked);
    else if (!res?.ok) setNotice((res && (await serverMessage(res))) ?? "하지 못했어요. 잠시 뒤 다시 해 주세요.");
    else setNotice(done);
    reload();
  };

  const verify = async (r: AdminReview) => {
    setBusy(true);
    const res = await apiFetch(`/admin/reviews/${r.id}/verify`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verified: !r.verified }),
    }).catch(() => null);
    setBusy(false);
    const blocked = res && (await demoBlocked(res));
    if (blocked) setNotice(blocked);
    else if (!res?.ok) setNotice((res && (await serverMessage(res))) ?? "바꾸지 못했어요. 잠시 뒤 다시 해 주세요.");
    else setNotice(r.verified ? "실사용 인증을 껐어요." : "실사용 인증을 켰어요.");
    reload();
  };

  const hideMany = async () => {
    setBusy(true);
    const { failed, message } = await runEach([...sel.picked], (id) => apiFetch(`/admin/reviews/${id}/hide`, { method: "POST" }), "리뷰", { did: "숨겼어요", couldNot: "숨기지 못했어요" });
    setBusy(false);
    setBulkOpen(false);
    sel.keep(failed);
    setNotice(failed.length === 0 ? `${message} ${WHEN_APPLIED}` : message);
    reload();
  };

  const filtered = Boolean(q.get("from") || q.get("to") || q.get("shoe") || q.get("author"));

  return (
    <div className="mypage__panel">
      <div className="mypage__titlebar">
        <h3 className="mypage__title">{hidden ? "숨긴 리뷰" : "전체 리뷰"}</h3>
        {!hidden && items.length > 0 && <BulkBar count={sel.picked.size} label="리뷰 숨기기" onRun={() => setBulkOpen(true)} />}
      </div>
      <p className="adminmy__note">
        {hidden
          ? "되살리면 목록 · 평점에 바로 돌아오고, 챗봇은 최대 10분, 요약은 다음 날 03:30에 반영돼요. 영구 삭제는 되돌릴 수 없어요."
          : `숨긴 리뷰는 「숨긴 리뷰」에서 되살리거나 영구 삭제할 수 있어요. ${WHEN_APPLIED}`}
      </p>

      <div className="adminmy__filters">
        <DateRange from={q.get("from")} to={q.get("to")} onChange={(from, to) => q.set({ from, to })} />
        <TextFilter value={q.get("shoe")} placeholder="신발(브랜드 · 모델)" onChange={(shoe) => q.set({ shoe })} />
        <TextFilter value={q.get("author")} placeholder="작성자" onChange={(author) => q.set({ author })} />
        {filtered && <button className="admin__sort" onClick={() => q.set({ from: "", to: "", shoe: "", author: "" })}>거르기 지우기</button>}
      </div>

      <p className="admin__count">{data ? `${data.total.toLocaleString()}건 · ${hidden ? "숨긴 순" : "작성 날짜"} 최신순` : ""}</p>
      {error && <p className="auth__error" role="alert">{error}</p>}
      {data && items.length === 0 && <p className="mypage__empty">{filtered ? "조건에 맞는 리뷰가 없어요." : hidden ? "숨긴 리뷰가 없어요." : "리뷰가 없어요."}</p>}

      {items.length > 0 && (
        <ul className="mypage__table is-helpful is-admin">
          <li className="mypage__thead">
            {hidden ? <span /> : (
              <label className="mypage__check">
                <input type="checkbox" checked={sel.all} onChange={sel.toggleAll} aria-label="이 쪽 전체 선택" />
              </label>
            )}
            <span />
            <span>신발</span>
            <span>작성자</span>
            <span>평점</span>
            <span>내용</span>
            <span>도움이 돼요</span>
            <span>{hidden ? "숨긴 날" : "날짜"}</span>
            <span />
          </li>
          {items.map((r) => (
            <li className={`mypage__row ${sel.picked.has(r.id) ? "is-picked" : ""}`} key={r.id}>
              {hidden ? <span /> : (
                <label className="mypage__check">
                  <input type="checkbox" checked={sel.picked.has(r.id)} onChange={() => sel.toggle(r.id)} aria-label={`${r.author} 리뷰 선택`} />
                </label>
              )}
              {r.shoeHidden || r.shoeId == null ? (
                <span className="mypage__thumb"><ShoeImage src={r.image ?? ""} alt={r.model ?? ""} /></span>
              ) : (
                <Link className="mypage__thumb" to={`/?shoe=${r.shoeId}`} aria-label={`${r.model ?? ""} 상세`}>
                  <ShoeImage src={r.image ?? ""} alt={r.model ?? ""} />
                </Link>
              )}
              <span className="mypage__model">
                {r.model ?? `NO.${r.shoeId}`}
                <small>
                  {r.brand}
                  {r.shoeHidden && " · 숨긴 신발"}
                  {r.reviewType === "FOLLOWUP" && " · 실사용 후기"}
                  {r.verified && " · 실사용 인증"}
                </small>
              </span>
              <span className="mypage__author" title={r.author}>{r.author}</span>
              <span className="mypage__rating" aria-label={`${r.rating}점`}>
                {"★".repeat(r.rating)}
                <span className="mypage__ratingoff">{"★".repeat(5 - r.rating)}</span>
              </span>
              <button className="mypage__content" onClick={() => setReading(r)} title="눌러서 전문 보기">{r.content}</button>
              <span className="mypage__helpful" aria-label={`도움이 돼요 ${r.likeCount ?? 0}`}>👍 {r.likeCount ?? 0}</span>
              <span className="mypage__date">{when(hidden ? r.hiddenAt : r.createdAt, false)}</span>
              <span className="mypage__actions">
                {hidden ? (
                  <>
                    <button className="mypage__btn" disabled={busy} onClick={() => act("POST", `/admin/reviews/${r.id}/restore`, `리뷰를 되살렸어요. ${WHEN_APPLIED.replace("빠지고", "돌아오고")}`)}>되살리기</button>
                    <button className="mypage__btn is-danger" onClick={() => setPurgeTarget(r)}>영구 삭제</button>
                  </>
                ) : (
                  <>
                    {/* 실사용 인증(V3 칸, 2026-11-14 화면) — 켜고 끈다. 확인 창 없이(되돌리기 쉬운 표시) */}
                    <button className={`mypage__btn ${r.verified ? "is-primary" : ""}`} disabled={busy} aria-pressed={r.verified}
                      title={r.verified ? `인증함 ${when(r.verifiedAt)} — 누르면 끈다` : "실사용 인증 켜기"}
                      onClick={() => verify(r)}>
                      {r.verified ? "인증됨" : "인증"}
                    </button>
                    <button className="mypage__btn is-danger" onClick={() => setHideTarget(r)}>숨기기</button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data && <Pager page={data.page} size={data.size} total={data.total} onPage={(p) => q.set({ page: String(p) })} />}

      {reading && (
        <ReviewReader
          title={reading.model ?? `NO.${reading.shoeId}`}
          meta={<>
            {reading.author} · {"★".repeat(reading.rating)}
            <span className="mypage__ratingoff">{"★".repeat(5 - reading.rating)}</span> · {when(reading.createdAt, false)} · 도움이 돼요 {reading.likeCount ?? 0}
          </>}
          content={reading.content}
          onClose={() => setReading(null)}
        />
      )}
      {hideTarget && (
        <HideReviewConfirm
          model={hideTarget.model}
          author={hideTarget.author}
          busy={busy}
          onConfirm={async () => { await act("POST", `/admin/reviews/${hideTarget.id}/hide`, `리뷰를 숨겼어요. ${WHEN_APPLIED}`); setHideTarget(null); }}
          onCancel={() => setHideTarget(null)}
        />
      )}
      {purgeTarget && (
        <ConfirmModal
          message="이 리뷰를 영구 삭제할까요?"
          detail={<>
            <p>
              「도움이 돼요」 <strong>{purgeTarget.helpfulRows}건</strong> · 실사용 후기 <strong>{purgeTarget.followups}건</strong>이 함께 지워집니다.
            </p>
            <p>되돌릴 수 없어요.</p>
          </>}
          confirmLabel="영구 삭제"
          busy={busy}
          onConfirm={async () => { await act("DELETE", `/admin/reviews/${purgeTarget.id}`, "리뷰를 영구 삭제했어요."); setPurgeTarget(null); }}
          onCancel={() => setPurgeTarget(null)}
        />
      )}
      {bulkOpen && (
        <ConfirmModal
          message={`리뷰 ${sel.picked.size}개를 숨길까요?`}
          detail={<p>{WHEN_APPLIED} 숨긴 리뷰에서 되살릴 수 있어요.</p>}
          confirmLabel="숨기기"
          busy={busy}
          onConfirm={hideMany}
          onCancel={() => setBulkOpen(false)}
        />
      )}
    </div>
  );
}

export default Reviews;
