import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { AuthError, demoAccounts, demoLogin, login, safeReturnTo, type DemoAccount } from "../auth/session";
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
  // 체험 카드 — 시드 계정 3개(무작위) + 데모 관리자. 서버가 꺼 두면(DEMO_LOGIN_ENABLED) 빈 목록이라 영역이 없다
  const [cards, setCards] = useState<DemoAccount[]>([]);

  useEffect(() => {
    demoAccounts().then(setCards);
  }, []);

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

  // 카드를 누르면 바로 로그인 — 비밀번호는 화면에 없다(서버가 체험 풀 안의 id 만 받는다)
  const tryDemo = async (card: DemoAccount) => {
    setBusy(true);
    setError(null);
    try {
      await demoLogin(card.id);
      navigate(card.role === "DEMO_ADMIN" ? "/admin" : returnTo, { replace: true });
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "잠시 뒤 다시 해 주세요.");
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
        화면으로 이동합니다
      </p>

      {cards.length > 0 && (
        <section className="auth__demo" aria-label="체험 계정">
          <h3 className="auth__demotitle">체험 계정으로 둘러보기</h3>
          <div className="auth__cards">
            {cards.map((c) => (
              <button key={c.id} className={`auth__card ${c.role === "DEMO_ADMIN" ? "is-admin" : ""}`} onClick={() => tryDemo(c)} disabled={busy}>
                <strong>{c.nickname}</strong>
                <span>{c.role === "DEMO_ADMIN" ? "관리 화면 · 보기 전용" : `리뷰 ${c.reviewCount}개`}</span>
              </button>
            ))}
          </div>
          <p className="auth__demonote">체험 계정으로 남긴 리뷰 · 찜은 누구나 보고 바꿀 수 있어요.</p>
        </section>
      )}
    </div>
  );
}

export default Login;
