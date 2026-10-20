import { createContext, useContext } from "react";
import type { User } from "./session";

/**
 * 로그인 상태 — status 가 "loading" 인 동안(첫 refresh) 로그인 버튼 · 가드는 기다린다.
 * notice: 화면을 옮긴 뒤에도 남는 짧은 안내("○○님, 환영해요" · "닉네임을 바꿨어요.") — Notice 컴포넌트가 보여 주고 지운다.
 */
export interface AuthState {
  status: "loading" | "anonymous" | "user";
  user: User | null;
  isAdmin: boolean;
  notice: string | null;
  setNotice: (n: string | null) => void;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("AuthProvider 밖");
  return ctx;
}
