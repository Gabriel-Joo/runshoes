import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { API } from "../api";
import { useAuth } from "../auth/useAuth";
import { AuthError, safeReturnTo, signup } from "../auth/session";
import { emailError, nicknameError, passwordError } from "../auth/rules";
import { useDebounced } from "../useDebounced";
import Field from "../auth/Field";
import { useCooldown } from "../auth/useCooldown";
import "./Auth.css";

type Key = "email" | "password" | "confirm" | "nickname";

/**
 * 가입 — 이메일 · 비밀번호 · 확인 · 닉네임. 규칙은 auth/rules(서버와 같다). 칸을 떠나거나 제출하면 오류를 보인다.
 * 닉네임은 입력이 멈추면 서버에 미리 물어본다(최종 판정은 가입할 때). 성공하면 바로 로그인 → returnTo, "○○님, 환영해요"
 */
function Signup() {
  const { status, setNotice } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"));
  const [v, setV] = useState({ email: "", password: "", confirm: "", nickname: "" });
  const [touched, setTouched] = useState<Partial<Record<Key, boolean>>>({});
  const [server, setServer] = useState<{ field?: string; message: string; limited?: boolean } | null>(null);
  const [nickCheck, setNickCheck] = useState<{ nickname: string; ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const cooldown = useCooldown();

  const local: Record<Key, string | null> = {
    email: emailError(v.email),
    password: passwordError(v.password),
    confirm: v.confirm !== v.password || !v.confirm ? "비밀번호가 서로 다릅니다." : null,
    nickname: nicknameError(v.nickname),
  };

  const nick = useDebounced(v.nickname.trim(), 400);
  useEffect(() => {
    if (!nick || nicknameError(nick)) return;
    const ctrl = new AbortController();
    fetch(`${API}/auth/nickname-available?nickname=${encodeURIComponent(nick)}`, { signal: ctrl.signal })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        setNickCheck({ nickname: nick, ok: res.ok, message: res.ok ? "쓸 수 있는 닉네임이에요." : body?.error?.message ?? "확인하지 못했어요." });
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [nick]);

  if (status === "user" && !busy) return <Navigate to={returnTo} replace />;

  const change = (k: Key) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setV({ ...v, [k]: e.target.value });
    if (server?.field === k) setServer(null);
  };
  const blur = (k: Key) => () => setTouched({ ...touched, [k]: true });
  const shown = (k: Key) => (server?.field === k ? server.message : touched[k] ? local[k] : null);
  const nickResult = nickCheck && nickCheck.nickname === v.nickname.trim() && !local.nickname ? nickCheck : null;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true, confirm: true, nickname: true });
    if (Object.values(local).some(Boolean) || (nickResult && !nickResult.ok)) return;
    setBusy(true);
    setServer(null);
    try {
      const u = await signup(v.email, v.password, v.nickname.trim());
      setNotice(`${u.nickname}님, 환영해요`);
      navigate(returnTo, { replace: true });
    } catch (err) {
      setServer(err instanceof AuthError ? { field: err.field, message: err.message, limited: err.status === 429 } : { message: "잠시 뒤 다시 해 주세요." });
      if (err instanceof AuthError && err.status === 429 && err.retryAfter) cooldown.start(err.retryAfter);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <h2 className="auth__title">회원가입</h2>
      <p className="auth__lead">찜과 리뷰가 내 계정에 남아요.</p>
      <form className="auth__form" onSubmit={submit} noValidate>
        <Field id="signup-email" label="이메일" type="email" autoComplete="email" value={v.email} onChange={change("email")} onBlur={blur("email")} error={shown("email")} />
        <Field id="signup-password" label="비밀번호" type="password" autoComplete="new-password" value={v.password} onChange={change("password")} onBlur={blur("password")}
          error={shown("password")} hint="8자 이상, 영문과 숫자를 함께" />
        <Field id="signup-confirm" label="비밀번호 확인" type="password" autoComplete="new-password" value={v.confirm} onChange={change("confirm")} onBlur={blur("confirm")} error={shown("confirm")} />
        <Field id="signup-nickname" label="닉네임" autoComplete="nickname" value={v.nickname} onChange={change("nickname")} onBlur={blur("nickname")}
          error={shown("nickname") ?? (nickResult && !nickResult.ok ? nickResult.message : null)} ok={nickResult?.ok ? nickResult.message : null}
          hint="2~12자, 한글 · 영문 · 숫자. 리뷰에 이 이름이 보여요" />
        {server && !server.field && (!server.limited || cooldown.active) && (
          <p className="auth__error" role="alert">
            {server.limited ? cooldown.message(server.message) : server.message}
          </p>
        )}
        <button className="auth__submit" type="submit" disabled={busy || (Boolean(server?.limited) && cooldown.active)}>
          {busy ? "가입 중…" : "가입하기"}
        </button>
      </form>
      <p className="auth__alt">
        이미 계정이 있으세요?
        <Link to={`/login${returnTo !== "/" ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}>로그인</Link>
        화면으로 이동합니다
      </p>
    </div>
  );
}

export default Signup;
