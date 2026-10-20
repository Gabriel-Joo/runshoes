import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { logout } from "../auth/session";
import { loginPath } from "../auth/session";
import "./Header.css";

/** 오른쪽 끝: 로그인 안 했으면 "로그인", 했으면 닉네임 메뉴(회원 정보 수정 · 로그아웃). 등록·관리는 admin 에게만 */
function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  // 닉네임 메뉴는 연 경로에서만 열려 있다 — 다른 화면으로 가면 저절로 닫힌다
  const [menuAt, setMenuAt] = useState<string | null>(null);
  const menu = menuAt === location.pathname;
  const setMenu = (v: boolean) => setMenuAt(v ? location.pathname : null);
  const navigate = useNavigate();
  const { status, user, isAdmin, setNotice } = useAuth();
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

  const drawerLink = (to: string, label: string) => (
    <Link to={to} className={`header__drawerlink ${location.pathname === to ? "is-active" : ""}`} onClick={close}>
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
          <Link to="/" className="header__link">
            홈
          </Link>
          <Link to="/recommend" className="header__link header__link--point">
            맞춤추천
          </Link>
          <Link to="/best" className="header__link header__link--sub">
            러너들의 선택
          </Link>
          {isAdmin && (
            <Link to="/admin" className="header__link header__link--admin">
              등록·관리
            </Link>
          )}
          {status === "anonymous" && (
            <Link to={toLogin} className="header__link header__link--auth">
              로그인
            </Link>
          )}
          {user && (
            <div className="header__user" ref={menuRef}>
              <button className="header__link header__link--auth header__userbtn" onClick={() => setMenu(!menu)} aria-haspopup="menu" aria-expanded={menu}>
                <span className="header__nick">{user.nickname}</span>
                <span className="header__caret" aria-hidden="true" />
              </button>
              {menu && (
                <div className="header__menu" role="menu">
                  <Link to="/account" className="header__menuitem" role="menuitem">
                    회원 정보 수정
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
          {drawerLink("/", "홈")}
          {drawerLink("/recommend", "맞춤 추천")}
          {drawerLink("/best", "러너들의 선택")}
          {isAdmin && drawerLink("/admin", "등록·관리")}
          {status === "anonymous" && (
            <Link to={toLogin} className="header__drawerlink header__drawerlink--auth" onClick={close}>
              로그인
            </Link>
          )}
          {user && (
            <>
              <p className="header__drawernick">{user.nickname}님</p>
              {drawerLink("/account", "회원 정보 수정")}
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
