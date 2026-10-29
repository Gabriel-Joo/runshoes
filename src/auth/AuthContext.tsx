import { useEffect, useState, type ReactNode } from "react";
import * as session from "./session";
import type { User } from "./session";
import { AuthContext, type AuthState } from "./useAuth";

/** 로그인 상태를 화면에 — 처음 뜰 때 refresh 로 access token 을 받는다(쿠키가 있으면 로그인 상태) */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(session.currentUser());
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const off = session.onUserChange(setUser);
    session.refresh().finally(() => setReady(true));
    return () => {
      off();
    };
  }, []);

  const value: AuthState = {
    status: !ready && !user ? "loading" : user ? "user" : "anonymous",
    user,
    isAdmin: user?.role === "ADMIN",
    isDemoAdmin: user?.role === "DEMO_ADMIN",
    canViewAdmin: user?.role === "ADMIN" || user?.role === "DEMO_ADMIN",
    notice,
    setNotice,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
