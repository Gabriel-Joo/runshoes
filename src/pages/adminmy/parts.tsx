import { useEffect, useState } from "react";
import SearchBox from "../../components/SearchBox";
import { useDebounced } from "../../useDebounced";

/**
 * 관리자 마이페이지의 작은 부품 — 새 모양을 만들지 않고 지금 있는 것을 쓴다(2026-11-14 사용자 「통일감」):
 * 검색 칸은 홈 · 등록·관리의 SearchBox, 쪽 버튼은 등록·관리의 정렬 글자(admin__sort), 날짜는 브라우저 날짜 칸
 */

/** 쪽 번호 — 이전 · 앞뒤 두 쪽 · 다음. 한 쪽이면 숨긴다 */
export function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const last = Math.max(1, Math.ceil(total / size));
  if (last <= 1) return null;
  const pages = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, last])].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b);
  return (
    <nav className="adminmy__pager" aria-label="쪽">
      <button className="admin__sort" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ 이전</button>
      {pages.map((p, i) => (
        <span key={p}>
          {i > 0 && p - pages[i - 1] > 1 && <span className="adminmy__gap">…</span>}
          <button className={`admin__sort ${p === page ? "is-active" : ""}`} aria-current={p === page ? "page" : undefined} onClick={() => onPage(p)}>
            {p}
          </button>
        </span>
      ))}
      <button className="admin__sort" disabled={page >= last} onClick={() => onPage(page + 1)}>다음 ›</button>
    </nav>
  );
}

/** 날짜 범위(한국 날짜, 포함) — 서버가 from · to 를 그날 00:00 KST 로 바꾼다(api/AdminPage) */
export function DateRange({ from, to, onChange }: { from: string; to: string; onChange: (from: string, to: string) => void }) {
  return (
    <span className="adminmy__dates">
      <input type="date" className="adminmy__date" aria-label="시작 날짜" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} />
      <span aria-hidden="true">~</span>
      <input type="date" className="adminmy__date" aria-label="끝 날짜" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} />
    </span>
  );
}

/** 글 거르기 — 치는 동안은 칸에만, 멈추면(0.3초) 주소에. 주소가 바뀌면(뒤로 가기 · 초기화) 칸도 따라간다 */
export function TextFilter({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {   // 주소가 바뀌었다 — 렌더 중에 칸을 맞춘다(effect 에서 setState 하지 않게, React 문서의 「props 가 바뀔 때 state 맞추기」)
    setSeen(value);
    setText(value);
  }
  const settled = useDebounced(text.trim(), 300);
  useEffect(() => {
    if (settled !== value) onChange(settled);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 멈춘 글이 바뀔 때만 주소에 넣는다
  }, [settled]);
  return (
    <span className="adminmy__text">
      <SearchBox value={text} onChange={setText} placeholder={placeholder} />
    </span>
  );
}
