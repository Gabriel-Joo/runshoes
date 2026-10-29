import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { AuthError, apiFetch, displayName, logout, setUser, withdraw } from "../auth/session";
import { nicknameError, passwordError } from "../auth/rules";
import { demoBlocked } from "../auth/demoAdmin";
import Field from "../auth/Field";
import ShoeImage from "../components/ShoeImage";
import ConfirmModal from "../components/ConfirmModal";
import Barcode from "../components/Barcode";
import ReviewCounter from "../components/ReviewCounter";
import { clampReview, contentError, reviewError, REVIEW_MAX } from "../components/reviewRules";
import { text, withUnit } from "../utils/display";
import type { Review, Shoe } from "../types";
import "./Auth.css";
import "./Account.css";

/** 서버 오류 본문({error:{field, message}}) → 화면 메시지 */
async function failure(res: Response) {
  if (res.status === 401) return { message: "로그인이 끝났어요. 다시 로그인해 주세요." };
  const body = await res.json().catch(() => null);
  return { field: body?.error?.field as string | undefined, message: (body?.error?.message as string) ?? "잠시 뒤 다시 해 주세요." };
}

type Tab = "profile" | "reviews" | "likes" | "helpful" | "withdraw";
const TABS: Tab[] = ["profile", "reviews", "likes", "helpful", "withdraw"];

/**
 * 마이페이지 — 왼쪽 목차 · 오른쪽 본문(2026-10-30 사용자). 본문 맨 위에는 늘 활동 요약(리뷰 · 찜 · 도움이 돼요 · 가입일).
 * 목차는 ?tab= 으로 — 새로고침 · 뒤로 가기에도 같은 칸. 로그인 필요(App 의 RequireAuth)
 * "도움이 돼요"는 리뷰 공감(review_likes)의 화면 이름이다 — 화면에는 "공감"이라고 쓰지 않는다
 */
function Account() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tab: Tab = TABS.includes(params.get("tab") as Tab) ? (params.get("tab") as Tab) : "profile";
  const go = (t: Tab) => setParams(t === "profile" ? {} : { tab: t });

  const [joined, setJoined] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);
  const [liked, setLiked] = useState<Shoe[] | null>(null);
  const [helpful, setHelpful] = useState<Review[] | null>(null);
  const [reload, setReload] = useState(0);
  const refresh = () => setReload((n) => n + 1);

  useEffect(() => {
    if (!user) return;
    apiFetch("/me").then((r) => (r.ok ? r.json() : null)).then((me) => setJoined(me?.createdAt ?? null)).catch(() => {});
    apiFetch(`/reviews?userId=${user.id}`).then((r) => r.json()).then(setReviews).catch(() => setReviews([]));
    apiFetch("/shoes?liked=true").then((r) => r.json()).then(setLiked).catch(() => setLiked([]));
    // 내가 "도움이 돼요"를 누른 리뷰 — liked 는 요청한 사람 기준(서버). 숨긴 신발의 리뷰는 서버가 뺀다
    apiFetch("/reviews?liked=true").then((r) => r.json()).then(setHelpful).catch(() => setHelpful([]));
  }, [user, reload]);

  if (!user) return null;

  const nav = (t: Tab, label: string, sub = false) => (
    <button className={`mypage__navitem ${sub ? "is-sub" : ""} ${tab === t ? "is-active" : ""}`} onClick={() => go(t)} aria-current={tab === t ? "page" : undefined}>
      {label}
    </button>
  );

  return (
    <div className="mypage">
      <nav className="mypage__nav" aria-label="마이페이지 목차">
        <h2 className="mypage__navtitle">마이페이지</h2>
        {nav("profile", "회원정보 수정")}
        <p className="mypage__navgroup">내 활동</p>
        {nav("reviews", "내 리뷰", true)}
        {nav("likes", "찜 목록", true)}
        {nav("helpful", "도움받은 리뷰", true)}
        {nav("withdraw", "회원 탈퇴")}
      </nav>

      <div className="mypage__body">
        <p className="mypage__summary">
          <strong>{displayName(user)}</strong>{user.role === "DEMO_ADMIN" ? "" : "님"} · 리뷰 <strong>{reviews?.length ?? "–"}개</strong> · 찜 <strong>{liked?.length ?? "–"}개</strong>
          {" "}· 도움이 돼요 <strong>{helpful?.length ?? "–"}개</strong>
          {joined && <> · 가입일 {joined.slice(0, 10).replace(/-/g, ".")}</>}
        </p>

        {tab === "profile" && <Profile />}
        {tab === "reviews" && <MyReviews reviews={reviews} onChange={refresh} />}
        {tab === "likes" && <MyLikes shoes={liked} onChange={refresh} />}
        {tab === "helpful" && <MyHelpful reviews={helpful} onChange={refresh} />}
        {tab === "withdraw" && <Withdraw onKeep={() => go("profile")} />}
      </div>
    </div>
  );
}

// ---- 표 · 카드가 같이 쓰는 것 ----

/** 리뷰한 신발만 받는다(?id=…&id=… — json-server 처럼 OR) */
function useShoesOf(list: Review[] | null) {
  const [shoes, setShoes] = useState<Record<number, Shoe>>({});
  const ids = [...new Set((list ?? []).map((r) => r.shoeId))].sort((a, b) => a - b).join(",");
  useEffect(() => {
    if (!ids) return;
    apiFetch(`/shoes?${ids.split(",").map((i) => `id=${i}`).join("&")}`)
      .then((r) => r.json())
      .then((l: Shoe[]) => setShoes(Object.fromEntries(l.map((s) => [s.id, s]))))
      .catch(() => {});
  }, [ids]);
  return shoes;
}

/** 여러 개 고르기 — 목록이 바뀌면 사라진 id 는 저절로 빠진다 */
function useSelection(ids: number[]) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const live = new Set([...picked].filter((id) => ids.includes(id)));
  const toggle = (id: number) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const all = ids.length > 0 && ids.every((id) => live.has(id));
  const toggleAll = () => setPicked(all ? new Set() : new Set(ids));
  return { picked: live, toggle, all, toggleAll, keep: (rest: number[]) => setPicked(new Set(rest)) };
}

/**
 * 한꺼번에 — 기존 API 를 하나씩 차례로 부른다(새 API 없음, 활동 로그도 한 건씩). 데모 관리자 403 이면 거기서 멈춘다.
 * 남은(실패한) id 와 화면 문구를 돌려준다
 */
async function runEach(ids: number[], call: (id: number) => Promise<Response | null>, what: string, words: { did: string; couldNot: string }) {
  const failed: number[] = [];
  let done = 0;
  for (let i = 0; i < ids.length; i++) {
    const res = await call(ids[i]).catch(() => null);
    const blocked = res && (await demoBlocked(res));
    if (blocked) return { failed: [...failed, ...ids.slice(i)], message: blocked };
    if (res?.ok) done++;
    else failed.push(ids[i]);
  }
  const message = failed.length === 0 ? `${what} ${done}개를 ${words.did}.` : `${ids.length}개 중 ${done}개를 ${words.did}. ${failed.length}개는 ${words.couldNot}.`;
  return { failed, message };
}

/** 리뷰 전문 — 읽기 전용 모달(2026-10-30 사용자 — 표 안에서 펼치면 300자에 줄이 흔들린다) */
function ReviewReader({ review, shoe, onClose }: { review: Review; shoe?: Shoe; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);
  return (
    <div className="confirm" onClick={onClose}>
      <div className="reader" role="dialog" aria-modal="true" aria-label="리뷰 전문" onClick={(e) => e.stopPropagation()}>
        <div className="reader__head">
          <div>
            <p className="reader__model">{shoe?.model ?? `NO.${review.shoeId}`}</p>
            <p className="reader__meta">
              {review.author} · {"★".repeat(review.rating)}
              <span className="mypage__ratingoff">{"★".repeat(5 - review.rating)}</span> · {review.createdAt.slice(0, 10).replace(/-/g, ".")} · 도움이 돼요 {review.likeCount ?? 0}
            </p>
          </div>
          <button className="reader__close" onClick={onClose} aria-label="닫기">×</button>
        </div>
        <p className="reader__content">{review.content}</p>
      </div>
    </div>
  );
}

/** 표 위 — "N개 선택됨 · [선택 …]" */
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

/** 회원정보 수정 — 이메일은 보기만. 닉네임과 비밀번호는 따로 저장한다 */
function Profile() {
  const { user, setNotice } = useAuth();
  const [nickname, setNickname] = useState("");
  const [nickErr, setNickErr] = useState<string | null>(null);
  const [nickBusy, setNickBusy] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwErr, setPwErr] = useState<{ field?: string; message: string } | null>(null);
  const [pwBusy, setPwBusy] = useState(false);
  if (!user) return null;

  const saveNickname = async (e: FormEvent) => {
    e.preventDefault();
    const n = nickname.trim();
    const err = nicknameError(n) ?? (n === user.nickname ? "지금 닉네임과 같아요." : null);
    if (err) return setNickErr(err);
    setNickBusy(true);
    const res = await apiFetch("/me/nickname", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nickname: n }) })
      .catch(() => null);
    setNickBusy(false);
    if (!res) return setNickErr("서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.");
    if (!res.ok) return setNickErr((await failure(res)).message);
    setUser(await res.json());
    setNickname("");
    setNickErr(null);
    setNotice("닉네임을 바꿨어요.");
  };

  const savePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!pw.current) return setPwErr({ field: "currentPassword", message: "지금 비밀번호를 입력해 주세요." });
    const err = passwordError(pw.next);
    if (err) return setPwErr({ field: "newPassword", message: err });
    if (pw.next !== pw.confirm) return setPwErr({ field: "confirm", message: "비밀번호가 서로 다릅니다." });
    setPwBusy(true);
    const res = await apiFetch("/me/password", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }) }).catch(() => null);
    setPwBusy(false);
    if (!res) return setPwErr({ message: "서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요." });
    if (!res.ok) return setPwErr(await failure(res));
    setPw({ current: "", next: "", confirm: "" });
    setPwErr(null);
    setNotice("비밀번호를 바꿨어요. 다른 기기에서는 다시 로그인해야 해요.");
  };

  const pwField = (f: string) => (pwErr?.field === f ? pwErr.message : null);

  return (
    <div className="mypage__panel">
      <h3 className="mypage__title">회원정보 수정</h3>

      <section className="auth__section">
        <div className="auth__form">
          <Field id="account-email" label="이메일" value={user.email} readOnly hint="이메일은 바꿀 수 없어요" />
        </div>
      </section>

      <section className="auth__section">
        <h4 className="auth__subtitle">닉네임</h4>
        <form className="auth__form" onSubmit={saveNickname} noValidate>
          <Field id="account-nickname" label={`새 닉네임 (지금: ${displayName(user)})`} autoComplete="nickname" value={nickname}
            onChange={(e) => { setNickname(e.target.value); setNickErr(null); }} error={nickErr} hint="2~12자, 한글 · 영문 · 숫자. 지난 리뷰의 이름도 같이 바뀌어요" />
          <button className="auth__submit" type="submit" disabled={nickBusy || !nickname.trim()}>
            {nickBusy ? "저장 중…" : "닉네임 저장"}
          </button>
        </form>
      </section>

      <section className="auth__section">
        <h4 className="auth__subtitle">비밀번호</h4>
        <form className="auth__form" onSubmit={savePassword} noValidate>
          <Field id="account-current" label="지금 비밀번호" type="password" autoComplete="current-password" value={pw.current}
            onChange={(e) => setPw({ ...pw, current: e.target.value })} error={pwField("currentPassword")} />
          <Field id="account-next" label="새 비밀번호" type="password" autoComplete="new-password" value={pw.next}
            onChange={(e) => setPw({ ...pw, next: e.target.value })} error={pwField("newPassword")} hint="8자 이상, 영문과 숫자를 함께" />
          <Field id="account-confirm" label="새 비밀번호 확인" type="password" autoComplete="new-password" value={pw.confirm}
            onChange={(e) => setPw({ ...pw, confirm: e.target.value })} error={pwField("confirm")} />
          {pwErr && !pwErr.field && <p className="auth__error" role="alert">{pwErr.message}</p>}
          <button className="auth__submit" type="submit" disabled={pwBusy}>
            {pwBusy ? "저장 중…" : "비밀번호 저장"}
          </button>
        </form>
      </section>
    </div>
  );
}

/** 내 리뷰 — 표. 내용을 누르면 전문 모달(읽기), 수정 · 삭제는 표에서. 여러 개 골라 한꺼번에 삭제 */
function MyReviews({ reviews, onChange }: { reviews: Review[] | null; onChange: () => void }) {
  const { setNotice } = useAuth();
  const shoes = useShoesOf(reviews);
  const [reading, setReading] = useState<Review | null>(null);
  const [editing, setEditing] = useState<Review | null>(null);
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<Review | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const sorted = [...(reviews ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const sel = useSelection(sorted.map((r) => r.id));

  if (!reviews) return null;

  const startEdit = (r: Review) => {
    setEditing(r);
    setRating(r.rating);
    setContent(r.content);
    setError(null);
  };

  const save = async () => {
    if (!editing) return;
    const err = contentError(content);
    if (err) return setError(err);
    const res = await apiFetch(`/reviews/${editing.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, content: content.trim() }),
    }).catch(() => null);
    if (!res) return setError("서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.");
    if (!res.ok) return setError(await reviewError(res, "고치지 못했어요. 내용을 확인해 주세요."));
    setEditing(null);
    setNotice("리뷰를 고쳤어요.");
    onChange();
  };

  const remove = async () => {
    if (!target) return;
    const res = await apiFetch(`/reviews/${target.id}`, { method: "DELETE" }).catch(() => null);
    setTarget(null);
    const blocked = res && (await demoBlocked(res));
    if (blocked) return setNotice(blocked);
    if (!res?.ok) return setNotice("지우지 못했어요. 잠시 뒤 다시 해 주세요.");
    setNotice("리뷰를 지웠어요.");
    onChange();
  };

  const removeMany = async () => {
    setBusy(true);
    const { failed, message } = await runEach([...sel.picked], (id) => apiFetch(`/reviews/${id}`, { method: "DELETE" }), "리뷰", { did: "지웠어요", couldNot: "지우지 못했어요" });
    setBusy(false);
    setBulkOpen(false);
    sel.keep(failed);
    setNotice(message);
    onChange();
  };

  return (
    <div className="mypage__panel">
      <div className="mypage__titlebar">
        <h3 className="mypage__title">내 리뷰</h3>
        {sorted.length > 0 && <BulkBar count={sel.picked.size} label="리뷰 삭제" onRun={() => setBulkOpen(true)} />}
      </div>
      {sorted.length === 0 ? (
        <p className="mypage__empty">
          아직 쓴 리뷰가 없어요. <Link to="/">신발을 둘러보세요</Link>
        </p>
      ) : (
        <ul className="mypage__table">
          <li className="mypage__thead">
            <label className="mypage__check">
              <input type="checkbox" checked={sel.all} onChange={sel.toggleAll} aria-label="전체 선택" />
            </label>
            <span />
            <span>모델명</span>
            <span>평점</span>
            <span>내용</span>
            <span>도움이 돼요</span>
            <span>날짜</span>
            <span />
          </li>
          {sorted.map((r) => {
            const shoe = shoes[r.shoeId];
            if (editing?.id === r.id) {
              return (
                <li className="mypage__row is-editing" key={r.id}>
                  <div className="mypage__editbox">
                    <p className="mypage__editmodel">{shoe?.model ?? `NO.${r.shoeId}`}</p>
                    <div className="review__rating" role="radiogroup" aria-label="별점">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} className={`review__star ${n <= rating ? "is-on" : ""}`} onClick={() => setRating(n)} aria-label={`${n}점`} aria-pressed={n === rating}>
                          ★
                        </button>
                      ))}
                    </div>
                    <textarea className="review__textarea" value={content} rows={3} maxLength={REVIEW_MAX * 2}
                      onChange={(e) => { setContent(clampReview(e.target.value)); setError(null); }} aria-invalid={Boolean(error)} />
                    <ReviewCounter value={content} />
                    {error && <p className="review__error" role="alert">{error}</p>}
                    <div className="mypage__editactions">
                      <button className="mypage__btn" onClick={() => setEditing(null)}>취소</button>
                      <button className="mypage__btn is-primary" onClick={save}>저장</button>
                    </div>
                  </div>
                </li>
              );
            }
            return (
              <li className={`mypage__row ${sel.picked.has(r.id) ? "is-picked" : ""}`} key={r.id}>
                <label className="mypage__check">
                  <input type="checkbox" checked={sel.picked.has(r.id)} onChange={() => sel.toggle(r.id)} aria-label={`${shoe?.model ?? ""} 리뷰 선택`} />
                </label>
                <Link className="mypage__thumb" to={`/?shoe=${r.shoeId}`} aria-label={`${shoe?.model ?? ""} 상세`}>
                  <ShoeImage src={shoe?.image ?? ""} alt={shoe?.model ?? ""} />
                </Link>
                <Link className="mypage__model" to={`/?shoe=${r.shoeId}`}>
                  {shoe?.model ?? `NO.${r.shoeId}`}
                  {shoe && <small>{shoe.brand}</small>}
                </Link>
                <span className="mypage__rating" aria-label={`${r.rating}점`}>
                  {"★".repeat(r.rating)}
                  <span className="mypage__ratingoff">{"★".repeat(5 - r.rating)}</span>
                </span>
                <button className="mypage__content" onClick={() => setReading(r)} title="눌러서 전문 보기">
                  {r.content}
                </button>
                <span className="mypage__helpful" aria-label={`도움이 돼요 ${r.likeCount ?? 0}`}>👍 {r.likeCount ?? 0}</span>
                <span className="mypage__date">{r.createdAt.slice(0, 10).replace(/-/g, ".")}</span>
                <span className="mypage__actions">
                  <button className="mypage__btn" onClick={() => startEdit(r)}>수정</button>
                  <button className="mypage__btn is-danger" onClick={() => setTarget(r)}>삭제</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {reading && <ReviewReader review={reading} shoe={shoes[reading.shoeId]} onClose={() => setReading(null)} />}
      {target && (
        <ConfirmModal
          message="이 리뷰를 삭제할까요?"
          detail={`${shoes[target.shoeId]?.model ?? "이 신발"}에 쓴 리뷰가 삭제되며 되돌릴 수 없습니다.`}
          onConfirm={remove}
          onCancel={() => setTarget(null)}
        />
      )}
      {bulkOpen && (
        <ConfirmModal
          message={`리뷰 ${sel.picked.size}개를 삭제할까요?`}
          detail="되돌릴 수 없습니다."
          busy={busy}
          onConfirm={removeMany}
          onCancel={() => setBulkOpen(false)}
        />
      )}
    </div>
  );
}

/** 찜 카드 바코드 값 — RS + id 네 자리(예: RS0002) */
const tagCode = (id: number) => `RS${String(id).padStart(4, "0")}`;

/**
 * 찜 목록 — 카드. 홈 카드와 같은 정보(중량 · 드롭 · 발볼 · 안정성 · 평점 · 리뷰 수)를 같은 순서로 — 나란히 놓고 비교한다(2026-10-30 사용자).
 * 홈의 찜 토글은 그대로 두고 여기서는 찜 해제만. 여러 개 골라 한꺼번에 해제
 */
function MyLikes({ shoes, onChange }: { shoes: Shoe[] | null; onChange: () => void }) {
  const { setNotice } = useAuth();
  const sel = useSelection((shoes ?? []).map((s) => s.id));
  const [bulkOpen, setBulkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!shoes) return null;

  const unlike = async (s: Shoe) => {
    const res = await apiFetch(`/shoes/${s.id}/like`, { method: "DELETE" }).catch(() => null);
    const blocked = res && (await demoBlocked(res));
    if (blocked) return setNotice(blocked);
    if (!res?.ok) return setNotice("찜을 풀지 못했어요. 잠시 뒤 다시 해 주세요.");
    onChange();
  };

  const unlikeMany = async () => {
    setBusy(true);
    const { failed, message } = await runEach([...sel.picked], (id) => apiFetch(`/shoes/${id}/like`, { method: "DELETE" }), "찜", { did: "해제했어요", couldNot: "해제하지 못했어요" });
    setBusy(false);
    setBulkOpen(false);
    sel.keep(failed);
    setNotice(message);
    onChange();
  };

  return (
    <div className="mypage__panel">
      <div className="mypage__titlebar">
        <h3 className="mypage__title">찜 목록</h3>
        {shoes.length > 0 && (
          <div className="mypage__bulk">
            <label className="mypage__checkall">
              <input type="checkbox" checked={sel.all} onChange={sel.toggleAll} /> 전체 선택
            </label>
            <span className="mypage__bulkcount">{sel.picked.size > 0 ? `${sel.picked.size}개 선택됨` : ""}</span>
            <button className="mypage__btn is-danger is-strong" onClick={() => setBulkOpen(true)} disabled={sel.picked.size === 0}>
              찜 해제
            </button>
          </div>
        )}
      </div>
      {shoes.length === 0 ? (
        <p className="mypage__empty">
          찜한 신발이 없어요. <Link to="/">홈에서 하트를 눌러 보세요</Link>
        </p>
      ) : (
        <ul className="mypage__cards">
          {shoes.map((s) => (
            <li className={`mypage__card ${sel.picked.has(s.id) ? "is-picked" : ""}`} key={s.id}>
              <label className="mypage__cardcheck">
                <input type="checkbox" checked={sel.picked.has(s.id)} onChange={() => sel.toggle(s.id)} aria-label={`${s.model} 선택`} />
              </label>
              <Link to={`/?shoe=${s.id}`} className="mypage__cardlink">
                <span className="mypage__cardimg">
                  <ShoeImage src={s.image} alt={s.model} />
                </span>
                <small>{s.brand}</small>
                <strong>{s.model}</strong>
              </Link>
              <dl className="mypage__specs">
                <div><dt>중량</dt><dd>{withUnit(s.weight, "g")}</dd></div>
                <div><dt>드롭</dt><dd>{withUnit(s.drop, "mm")}</dd></div>
                <div><dt>발볼</dt><dd>{text(s.width)}</dd></div>
                <div><dt>안정성</dt><dd>{text(s.stability)}</dd></div>
                <div><dt>평점</dt><dd><strong>{s.rating.toFixed(1)}</strong> · 리뷰 {s.reviewCount}</dd></div>
              </dl>
              <button className="mypage__btn" onClick={() => unlike(s)}>
                찜 해제
              </button>
              {/* 행택 — 아래쪽 작은 바코드. 값은 영문 · 숫자만(한글 모델명은 바코드가 안 된다 — id 로) */}
              <span className="mypage__tagcode">
                <Barcode value={tagCode(s.id)} />
                <small>{tagCode(s.id)}</small>
              </span>
            </li>
          ))}
        </ul>
      )}
      {bulkOpen && (
        <ConfirmModal
          message={`찜 ${sel.picked.size}개를 해제할까요?`}
          confirmLabel="해제"
          busy={busy}
          onConfirm={unlikeMany}
          onCancel={() => setBulkOpen(false)}
        />
      )}
    </div>
  );
}

/** 도움받은 리뷰(내가 "도움이 돼요"를 누른 리뷰, 2026-10-30 이름) — 내 리뷰와 같은 표(작성자 칸이 더 있다). [취소]는 내 "도움이 돼요"를 거둔다. 여러 개 골라 한꺼번에 취소 */
function MyHelpful({ reviews, onChange }: { reviews: Review[] | null; onChange: () => void }) {
  const { setNotice } = useAuth();
  const shoes = useShoesOf(reviews);
  const [reading, setReading] = useState<Review | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const sorted = [...(reviews ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const sel = useSelection(sorted.map((r) => r.id));
  if (!reviews) return null;

  const unhelp = async (r: Review) => {
    const res = await apiFetch(`/reviews/${r.id}/like`, { method: "DELETE" }).catch(() => null);
    const blocked = res && (await demoBlocked(res));
    if (blocked) return setNotice(blocked);
    if (!res?.ok) return setNotice("취소하지 못했어요. 잠시 뒤 다시 해 주세요.");
    onChange();
  };

  const unhelpMany = async () => {
    setBusy(true);
    const { failed, message } = await runEach([...sel.picked], (id) => apiFetch(`/reviews/${id}/like`, { method: "DELETE" }), "도움이 돼요", { did: "취소했어요", couldNot: "취소하지 못했어요" });
    setBusy(false);
    setBulkOpen(false);
    sel.keep(failed);
    setNotice(message);
    onChange();
  };

  return (
    <div className="mypage__panel">
      <div className="mypage__titlebar">
        <h3 className="mypage__title">도움받은 리뷰</h3>
        {sorted.length > 0 && <BulkBar count={sel.picked.size} label="도움 취소" onRun={() => setBulkOpen(true)} />}
      </div>
      {sorted.length === 0 ? (
        <p className="mypage__empty">
          아직 "도움이 돼요"를 누른 리뷰가 없어요. <Link to="/">리뷰를 둘러보세요</Link>
        </p>
      ) : (
        <ul className="mypage__table is-helpful">
          <li className="mypage__thead">
            <label className="mypage__check">
              <input type="checkbox" checked={sel.all} onChange={sel.toggleAll} aria-label="전체 선택" />
            </label>
            <span />
            <span>모델명</span>
            <span>작성자</span>
            <span>평점</span>
            <span>내용</span>
            <span>도움이 돼요</span>
            <span>날짜</span>
            <span />
          </li>
          {sorted.map((r) => {
            const shoe = shoes[r.shoeId];
            return (
              <li className={`mypage__row ${sel.picked.has(r.id) ? "is-picked" : ""}`} key={r.id}>
                <label className="mypage__check">
                  <input type="checkbox" checked={sel.picked.has(r.id)} onChange={() => sel.toggle(r.id)} aria-label={`${r.author} 리뷰 선택`} />
                </label>
                <Link className="mypage__thumb" to={`/?shoe=${r.shoeId}`} aria-label={`${shoe?.model ?? ""} 상세`}>
                  <ShoeImage src={shoe?.image ?? ""} alt={shoe?.model ?? ""} />
                </Link>
                <Link className="mypage__model" to={`/?shoe=${r.shoeId}`}>
                  {shoe?.model ?? `NO.${r.shoeId}`}
                  {shoe && <small>{shoe.brand}</small>}
                </Link>
                <span className="mypage__author">{r.author}</span>
                <span className="mypage__rating" aria-label={`${r.rating}점`}>
                  {"★".repeat(r.rating)}
                  <span className="mypage__ratingoff">{"★".repeat(5 - r.rating)}</span>
                </span>
                <button className="mypage__content" onClick={() => setReading(r)} title="눌러서 전문 보기">
                  {r.content}
                </button>
                <span className="mypage__helpful" aria-label={`도움이 돼요 ${r.likeCount ?? 0}`}>👍 {r.likeCount ?? 0}</span>
                <span className="mypage__date">{r.createdAt.slice(0, 10).replace(/-/g, ".")}</span>
                <span className="mypage__actions">
                  <button className="mypage__btn" onClick={() => unhelp(r)}>취소</button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {reading && <ReviewReader review={reading} shoe={shoes[reading.shoeId]} onClose={() => setReading(null)} />}
      {bulkOpen && (
        <ConfirmModal
          message={`"도움이 돼요" ${sel.picked.size}개를 취소할까요?`}
          confirmLabel="취소하기"
          cancelLabel="닫기"
          busy={busy}
          onConfirm={unhelpMany}
          onCancel={() => setBulkOpen(false)}
        />
      )}
    </div>
  );
}

/** 회원 탈퇴 — 확인 화면(2026-10-30 사용자 문구). "계속 이용하고 싶어요"가 강조, "회원 탈퇴"는 덜 눈에 띄게 */
function Withdraw({ onKeep }: { onKeep: () => void }) {
  const navigate = useNavigate();
  const { setNotice } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await withdraw();
    } catch (e) {
      setBusy(false);
      return setError(e instanceof AuthError ? e.message : "탈퇴하지 못했어요. 잠시 뒤 다시 해 주세요.");
    }
    navigate("/");                     // 가드가 로그인 화면으로 보내기 전에 홈으로
    await logout().catch(() => {});
    setNotice("탈퇴했어요. 그동안 이용해 주셔서 감사합니다.");
  };

  return (
    <div className="mypage__panel">
      <h3 className="mypage__title">회원 탈퇴</h3>
      <div className="withdraw">
        <p className="withdraw__lead">회원 탈퇴 전에 확인해주세요</p>
        <ul className="withdraw__list">
          <li>작성하신 리뷰는 "탈퇴 회원" 이름으로 남습니다</li>
          <li>찜 목록은 모두 삭제됩니다</li>
          <li>탈퇴 후에는 계정을 복구할 수 없습니다</li>
          <li>같은 이메일로 다시 가입할 수 있지만, 이전에 작성한 리뷰는 돌아오지 않습니다</li>
        </ul>
        <p className="withdraw__ask">그래도 진행할까요?</p>
        {error && (
          <p className="auth__error" role="alert">
            {error}
          </p>
        )}
        <div className="withdraw__actions">
          <button className="withdraw__go" onClick={go} disabled={busy}>
            {busy ? "탈퇴 중…" : "회원 탈퇴"}
          </button>
          <button className="withdraw__keep" onClick={onKeep}>
            계속 이용하고 싶어요
          </button>
        </div>
      </div>
    </div>
  );
}

export default Account;
