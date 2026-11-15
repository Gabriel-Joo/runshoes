import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { logout } from "../auth/session";
import { loginPath } from "../auth/session";
import "./Header.css";

/**
 * 머리 메뉴의 닉네임 — 6자까지 그대로, 7자 이상은 앞 5자 + 「…」(모두 6칸). 닉네임은 12자까지라 다 쓰면 메뉴가 넘쳤다(2026-11-15 사용자).
 * 글자 수로 센다(폭 말줄임은 한글 · 영문 폭이 달라 6자가 맞지 않는다). 전체는 title · aria-label 로. 서랍 · 마이페이지는 자르지 않는다
 */
const shortNick = (nick: string) => {
  const chars = Array.from(nick);
  return chars.length <= 6 ? nick : chars.slice(0, 5).join("") + "…";
};

const NAV: [string, string][] = [["/", "홈"], ["/recommend", "추천받기"], ["/compare", "비교하기"], ["/best", "러너들의 선택"]];

/** 오른쪽 끝: 로그인 안 했으면 "로그인", 했으면 닉네임 메뉴(마이페이지 · 로그아웃). 신발 관리는 admin · 데모 관리자(보기만)에게 */
function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  // 닉네임 메뉴 — 다른 화면으로 가면 저절로 닫힌다
  const [menuAt, setMenuAt] = useState<string | null>(null);
  // 연 그 이동(location.key)에서만 열려 있다 — 경로(pathname)로 두면 마이페이지 → 홈처럼 같은 경로로 돌아왔을 때 다시 열린다(2026-10-30)
  const menu = menuAt === location.key;
  const setMenu = (v: boolean) => setMenuAt(v ? location.key : null);
  const navigate = useNavigate();
  const { status, user, canViewAdmin, setNotice } = useAuth();
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => setOpen(false);
  const here = location.pathname + location.search;
  const toLogin = location.pathname === "/login" || location.pathname === "/signup" ? location.pathname + location.search : loginPath(here);

  useEffect(() => {
    if (!menu) return;
    const out = (e: MouseEvent) => menuRef.current && !menuRef.current.contains(e.target as Node) && setMenuAt(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenuAt(null);
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", out);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  // 홈으로 먼저 — 로그인이 필요한 화면(/account 등)에서 세션부터 지우면 가드가 로그인 화면으로 보낸다
  const signOut = async () => {
    setMenu(false);
    close();
    navigate("/");
    await logout().catch(() => {});
    setNotice("로그아웃했어요.");
  };

  // 신발 관리는 목록 · 등록 · 수정이 한 흐름이라 셋 다 「보고 있음」(2026-11-15 사용자)
  const inAdmin = location.pathname === "/admin" || location.pathname === "/new" || location.pathname.startsWith("/edit/");
  // 로그인은 메뉴가 아니라 버튼이라 신발 관리와 같은 배지 — 로그인 · 회원가입이 한 흐름이라 둘 다 채운다(2026-11-15 사용자)
  const inLogin = location.pathname === "/login" || location.pathname === "/signup";

  const drawerLink = (to: string, label: string, extra = "", active = location.pathname === to) => (
    <Link key={to} to={to} className={`header__drawerlink ${extra} ${active ? "is-active" : ""}`} onClick={close}>
      {label}
    </Link>
  );

  return (
    <header className="header">
      <div className="header__bar">
        <Link to="/" className="header__logo" onClick={close}>
          RUNSHOES
        </Link>

        <nav className="header__nav">
          {/* 메뉴는 동사로 · 넷 다 같은 색, 지금 보는 화면만 강조색(2026-11-09 사용자) */}
          {NAV.map(([to, label]) => (
            <Link key={to} to={to} className={`header__link ${location.pathname === to ? "is-active" : ""}`}>
              {label}
            </Link>
          ))}
          {canViewAdmin && (
            <Link to="/admin" className={`header__link header__link--admin ${inAdmin ? "is-active" : ""}`}>
              <span className="header__badge">신발 관리</span>
            </Link>
          )}
          {status === "anonymous" && (
            <Link to={toLogin} className={`header__link header__link--auth ${inLogin ? "is-active" : ""}`}>
              <span className="header__badge">로그인</span>
            </Link>
          )}
          {user && (
            <div className="header__user" ref={menuRef}>
              <button className="header__link header__link--auth header__userbtn" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu} aria-label={user.nickname}>
                <span className="header__nick" title={user.nickname}>{shortNick(user.nickname)}</span>
                <span className="header__caret" aria-hidden="true" />
              </button>
              {menu && (
                <div className="header__menu" role="menu">
                  <Link to="/account" className="header__menuitem" role="menuitem">
                    마이페이지
                  </Link>
                  <button className="header__menuitem" role="menuitem" onClick={signOut}>
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          )}
        </nav>

        <button
          className={`header__toggle ${open ? "is-open" : ""}`}
          onClick={() => setOpen(!open)}
          aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={open}
        >
          <span />
          <span />
          <span />
        </button>
      </div>

      {open && (
        <nav className="header__drawer">
          {NAV.map(([to, label]) => drawerLink(to, label))}
          {/* 서랍은 배지 없이 글씨로 — 지금 보는 화면만 청록(머리 메뉴에서만 배지, 2026-11-15 사용자) */}
          {canViewAdmin && drawerLink("/admin", "신발 관리", "", inAdmin)}
          {status === "anonymous" && (
            <Link to={toLogin} className="header__drawerlink header__drawerlink--auth" onClick={close}>
              로그인
            </Link>
          )}
          {user && (
            <>
              <p className="header__drawernick">{user.nickname}님</p>
              {drawerLink("/account", "마이페이지")}
              <button className="header__drawerlink header__drawerbtn" onClick={signOut}>
                로그아웃
              </button>
            </>
          )}
        </nav>
      )}
    </header>
  );
}

export default Header;
