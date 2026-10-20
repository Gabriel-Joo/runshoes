import { useLocation, useNavigate } from "react-router-dom";
import type { Shoe } from "../types";
import { useAuth } from "./useAuth";
import { apiFetch } from "./session";
import { loginPath } from "./session";

/**
 * 카드의 찜(하트) — 로그인했으면 PUT/DELETE /api/shoes/{id}/like(숫자는 서버가 센다), 안 했으면 로그인 화면으로.
 * 홈 · 러너들의 선택 · 맞춤 추천이 같이 쓴다. 끝나면 onDone(목록을 다시 받는다)
 */
export function useShoeLike(onDone: () => void) {
  const navigate = useNavigate();
  const location = useLocation();
  const { status } = useAuth();
  const toLogin = () => navigate(loginPath(location.pathname + location.search));

  return async (shoe: Shoe) => {
    if (status !== "user") return toLogin();
    const res = await apiFetch(`/shoes/${shoe.id}/like`, { method: shoe.liked ? "DELETE" : "PUT" });
    if (res.status === 401) return toLogin();
    onDone();
  };
}
