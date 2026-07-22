import { Link } from "react-router-dom";
import "./Header.css";

function Header() {
  return (
    <header className="header">
      <Link to="/" className="header__logo">
        RUNSHOES
      </Link>
      <nav className="header__nav">
        <Link to="/" className="header__link">
          목록
        </Link>
        <Link to="/best" className="header__link header__link--sub">
          러너들의 선택
        </Link>
        <Link to="/admin" className="header__link header__link--admin">
          등록·관리
        </Link>
      </nav>
    </header>
  );
}

export default Header;
