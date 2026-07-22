import { Link } from 'react-router-dom'

function NotFound() {
  return (
    <div style={{ padding: '80px 48px', textAlign: 'center' }}>
      <h2>페이지를 찾을 수 없습니다</h2>
      <p style={{ margin: '12px 0 24px', color: 'var(--text-weak)' }}>
        주소를 다시 확인해 주세요.
      </p>
      <Link to="/" style={{ color: 'var(--accent)' }}>목록으로 돌아가기</Link>
    </div>
  )
}

export default NotFound