import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { AuthError, login, safeReturnTo } from "../auth/session";
import Field from "../auth/Field";
import { useCooldown } from "../auth/useCooldown";
import "./Auth.css";

/** 로그인 — 이메일 · 비밀번호. 성공하면 returnTo(없으면 홈). 틀리면 어느 쪽이 틀렸는지 말하지 않는다(서버 메시지 그대로) */
function Login() {
  const { status } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [limited, setLimited] = useState(false);   // 429 — 기다리는 동안 버튼을 끈다
  const [busy, setBusy] = useState(false);
  const cooldown = useCooldown();

  if (status === "user" && !busy) return <Navigate to={returnTo} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("이메일과 비밀번호를 입력해 주세요.");
      return;
    }
    setBusy(true);
    setError(null);
    setLimited(false);
    try {
      await login(email, password);
      navigate(returnTo, { replace: true });
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "잠시 뒤 다시 해 주세요.");
      if (err instanceof AuthError && err.status === 429 && err.retryAfter) {
        setLimited(true);
        cooldown.start(err.retryAfter);
      }
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <h2 className="auth__title">로그인</h2>
      <form className="auth__form" onSubmit={submit} noValidate>
        <Field id="login-email" label="이메일" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field id="login-password" label="비밀번호" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && (!limited || cooldown.active) && (
          <p className="auth__error" role="alert">
            {limited ? cooldown.message(error) : error}
          </p>
        )}
        <button className="auth__submit" type="submit" disabled={busy || (limited && cooldown.active)}>
          {busy ? "로그인 중…" : "로그인"}
        </button>
      </form>
      <p className="auth__alt">
        처음이세요?
        <Link to={`/signup${returnTo !== "/" ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`}>회원가입</Link>
      </p>
    </div>
  );
}

export default Login;
