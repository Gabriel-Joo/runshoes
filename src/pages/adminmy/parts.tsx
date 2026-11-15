import { useEffect, useState } from "react";
import SearchBox from "../../components/SearchBox";
import { useDebounced } from "../../useDebounced";
import { PAGE_GROUP, PAGE_SIZES, pageGroup } from "../../utils/pageGroup";

/**
 * 관리자 마이페이지의 작은 부품 — 새 모양을 만들지 않고 지금 있는 것을 쓴다(2026-11-14 사용자 「통일감」):
 * 검색 칸은 홈 · 신발 관리의 SearchBox, 쪽 버튼은 신발 관리의 정렬 글자(admin__sort), 날짜는 브라우저 날짜 칸
 */

/**
 * 쪽 번호 — ‹‹ ‹ 1 2 3 4 5 › ››(2026-11-15 사용자). 번호는 다섯 개씩, ‹ · › 는 앞 · 다음 묶음의 첫 쪽, ‹‹ · ›› 는 첫 · 마지막 쪽.
 * 첫 묶음이면 ‹‹ · ‹ 를, 마지막 묶음이면 › · ›› 를 못 누른다. 한 쪽이면 숨긴다
 */
export function Pager({ page, size, total, onPage }: { page: number; size: number; total: number; onPage: (p: number) => void }) {
  const last = Math.max(1, Math.ceil(total / size));
  if (last <= 1) return null;
  const g = pageGroup(page, last);
  return (
    <nav className="adminmy__pager" aria-label="쪽">
      <button className="admin__sort" disabled={g.first} onClick={() => onPage(1)} aria-label="첫 쪽">‹‹</button>
      <button className="admin__sort" disabled={g.first} onClick={() => onPage(g.start - PAGE_GROUP)} aria-label="앞 묶음">‹</button>
      {g.pages.map((p) => (
        <button key={p} className={`admin__sort ${p === page ? "is-active" : ""}`} aria-current={p === page ? "page" : undefined} onClick={() => onPage(p)}>
          {p}
        </button>
      ))}
      <button className="admin__sort" disabled={g.lastGroup} onClick={() => onPage(g.start + PAGE_GROUP)} aria-label="다음 묶음">›</button>
      <button className="admin__sort" disabled={g.lastGroup} onClick={() => onPage(last)} aria-label="마지막 쪽">››</button>
    </nav>
  );
}

/** 고르기 칸 — 개수 줄 오른쪽의 작은 드롭다운(몇 개씩 보기 · 가입 연도). 모양은 날짜 칸(adminmy__date) + 등록 화면 select 의 화살표 */
export function Choice({ value, options, label, onChange }: { value: string; options: [string, string][]; label: string; onChange: (v: string) => void }) {
  return (
    <select className="adminmy__date adminmy__choice" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, text]) => <option key={v} value={v}>{text}</option>)}
    </select>
  );
}

/** 몇 개씩 보기 — 주소의 size(없으면 20). 바꾸면 1쪽으로 */
export function SizeChoice({ size, onChange }: { size: number; onChange: (size: string) => void }) {
  return (
    <Choice value={String(size)} label="한 쪽에 몇 개" onChange={(v) => onChange(v === String(PAGE_SIZES[0]) ? "" : v)}
      options={PAGE_SIZES.map((n) => [String(n), `${n}개씩 보기`])} />
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
