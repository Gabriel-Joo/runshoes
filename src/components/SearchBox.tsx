import "./SearchBox.css";

interface SearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** 홈 · 등록·관리 공용 검색창 — 서버의 search(브랜드 · 모델명, 낱말 AND)로 찾는다 */
function SearchBox({ value, onChange, placeholder = "브랜드·모델 검색" }: SearchBoxProps) {
  return (
    <div className="search">
      <svg className="search__icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        className="search__input"
        type="search"
        enterKeyHint="search"
        placeholder={placeholder}
        aria-label={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onChange("")}
      />
      {value && (
        <button
          type="button"
          className="search__clear"
          aria-label="검색어 지우기"
          onClick={() => onChange("")}
        >
          ×
        </button>
      )}
    </div>
  );
}

export default SearchBox;
