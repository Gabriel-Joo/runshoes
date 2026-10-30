import { useEffect, useRef } from "react";
import { useLocation, useNavigationType } from "react-router-dom";

/**
 * 다른 화면으로 옮기면 맨 위에서 시작한다(2026-10-30 — 홈을 내린 채 마이페이지로 가면 중간에 있었다. 모든 화면 전환이 같았다).
 * 경로(pathname)가 실제로 바뀔 때만 — 같은 화면 안의 ?shoe= (상세 모달) · ?tab= (마이페이지 목차)는 그대로 둔다.
 * 뒤로 · 앞으로(POP)는 브라우저가 전에 보던 자리로 돌려놓게 둔다
 */
function ResetScroll() {
  const { pathname } = useLocation();
  const type = useNavigationType();
  const last = useRef(pathname);
  useEffect(() => {
    if (last.current === pathname) return;   // 이동 방식(POP → PUSH)만 바뀐 것은 화면이 바뀐 것이 아니다
    last.current = pathname;
    if (type !== "POP") window.scrollTo(0, 0);
  }, [pathname, type]);
  return null;
}

export default ResetScroll;
