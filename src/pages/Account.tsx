import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/useAuth";
import { apiFetch, setUser } from "../auth/session";
import { nicknameError, passwordError } from "../auth/rules";
import Field from "../auth/Field";
import "./Auth.css";

/** 서버 오류 본문({error:{field, message}}) → 화면 메시지 */
async function failure(res: Response) {
  if (res.status === 401) return { message: "로그인이 끝났어요. 다시 로그인해 주세요." };
  const body = await res.json().catch(() => null);
  return { field: body?.error?.field as string | undefined, message: (body?.error?.message as string) ?? "잠시 뒤 다시 해 주세요." };
}

/** 회원 정보 — 이메일은 보기만. 닉네임과 비밀번호는 따로 저장한다(로그인 필요 — App 의 RequireAuth) */
function Account() {
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
    <div className="auth">
      <h2 className="auth__title">회원 정보</h2>

      <section className="auth__section">
        <div className="auth__form">
          <Field id="account-email" label="이메일" value={user.email} readOnly hint="이메일은 바꿀 수 없어요" />
        </div>
      </section>

      <section className="auth__section">
        <h3 className="auth__subtitle">닉네임</h3>
        <form className="auth__form" onSubmit={saveNickname} noValidate>
          <Field id="account-nickname" label={`새 닉네임 (지금: ${user.nickname})`} autoComplete="nickname" value={nickname}
            onChange={(e) => { setNickname(e.target.value); setNickErr(null); }} error={nickErr} hint="2~12자, 한글 · 영문 · 숫자. 지난 리뷰의 이름도 같이 바뀌어요" />
          <button className="auth__submit" type="submit" disabled={nickBusy || !nickname.trim()}>
            {nickBusy ? "저장 중…" : "닉네임 저장"}
          </button>
        </form>
      </section>

      <section className="auth__section">
        <h3 className="auth__subtitle">비밀번호</h3>
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

export default Account;
