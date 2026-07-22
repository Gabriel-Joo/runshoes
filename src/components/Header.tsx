import { Link } from 'react-router-dom'
import './Header.css'

function Header() {
  return (
    <header className="header">
      <Link to="/" className="header__logo">RUNSHOES</Link>
      <nav className="header__nav">
        <Link to="/">목록</Link>
        <Link to="/best">러너들의 선택</Link>
        <Link to="/new" className="header__admin">등록·관리</Link>
      </nav>
    </header>
  )
}

export default Header