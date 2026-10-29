import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { AuthError, DEMO_ADMIN_NAME, demoAccounts, demoLogin, login, safeReturnTo, type DemoAccount } from "../auth/session";
import Field from "../auth/Field";
import DemoCards from "../components/DemoCards";
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
  // 체험 카드 — 시드 계정 전부(슬라이드) + 데모 관리자. 서버가 꺼 두면(DEMO_LOGIN_ENABLED) 빈 목록이라 영역이 없다
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
  const admin = cards.find((c) => c.role === "DEMO_ADMIN");

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

      {/* 체험 — 일반 회원(시드 계정이 흐른다) · 관리자(데모 관리자 — 실제 관리 화면, 저장 · 삭제만 막힘)를 나눈다(2026-10-30 사용자) */}
      {cards.length > 0 && (
        <section className="auth__demo" aria-label="체험 계정">
          {cards.some((c) => c.role === "USER") && (
            <div className="auth__demogroup">
              <h3 className="auth__demotitle">일반 회원으로 체험하기</h3>
              <p className="auth__demonote">누구나 함께 쓰는 체험 계정이에요. 남긴 리뷰 · 찜은 다른 사람이 바꾸거나 지울 수 있어요</p>
              <DemoCards cards={cards} busy={busy} onPick={tryDemo} />
            </div>
          )}
          {admin && (
            <div className="auth__demogroup">
              <h3 className="auth__demotitle">관리자로 체험하기</h3>
              <p className="auth__demonote">실제 관리자 화면을 그대로 둘러볼 수 있어요. 저장 · 삭제만 막혀 있어요</p>
              <div className="auth__admincard">
                <button className="auth__card is-admin" onClick={() => tryDemo(admin)} disabled={busy}>
                  <strong>{DEMO_ADMIN_NAME}</strong>
                  <span>등록 · 관리 화면 보기</span>
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default Login;
