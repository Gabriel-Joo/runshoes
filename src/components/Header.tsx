import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "./Header.css";

function Header() {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const close = () => setOpen(false);

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
          <Link to="/recommend" className="header__link header__link--sub">
            맞춤 추천
          </Link>
          <Link to="/best" className="header__link header__link--sub">
            러너들의 선택
          </Link>
          <Link to="/admin" className="header__link header__link--admin">
            등록·관리
          </Link>
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
          <Link
            to="/"
            className={`header__drawerlink ${location.pathname === "/" ? "is-active" : ""}`}
            onClick={close}
          >
            홈
          </Link>
          <Link
            to="/recommend"
            className={`header__drawerlink ${location.pathname === "/recommend" ? "is-active" : ""}`}
            onClick={close}
          >
            맞춤 추천
          </Link>
          <Link
            to="/best"
            className={`header__drawerlink ${location.pathname === "/best" ? "is-active" : ""}`}
            onClick={close}
          >
            러너들의 선택
          </Link>
          <Link
            to="/admin"
            className={`header__drawerlink ${location.pathname === "/admin" ? "is-active" : ""}`}
            onClick={close}
          >
            등록·관리
          </Link>
        </nav>
      )}
    </header>
  );
}

export default Header;
