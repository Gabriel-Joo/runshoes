import { useEffect, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./useAuth";
import { loginPath } from "./session";

/**
 * 화면 가드 — 로그인 안 했으면 로그인으로, admin 화면에 admin 이 아니면 홈으로("관리자만 볼 수 있어요.").
 * 실제로 막는 것은 서버다(쓰기 401 · 403). 가드는 화면이 헛돌지 않게 할 뿐이다.
 */
function RequireAuth({ admin = false, children }: { admin?: boolean; children: ReactNode }) {
  const { status, isAdmin, setNotice } = useAuth();
  const location = useLocation();
  const denied = status === "user" && admin && !isAdmin;

  useEffect(() => {
    if (denied) setNotice("관리자만 볼 수 있어요.");
  }, [denied, setNotice]);

  if (status === "loading") return null;
  if (status === "anonymous") return <Navigate to={loginPath(location.pathname + location.search)} replace />;
  if (denied) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default RequireAuth;
