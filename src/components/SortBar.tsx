import "./SortBar.css";

const SORTS = [
  { key: "default", label: "기본" },
  { key: "rating", label: "평점순" },
  { key: "reviewCount", label: "리뷰순" },
  { key: "likeCount", label: "좋아요순" },
];

interface SortBarProps {
  sort: string;
  onSortChange: (sort: string) => void;
  likedOnly: boolean;
  onLikedOnlyChange: (value: boolean) => void;
}

function SortBar({
  sort,
  onSortChange,
  likedOnly,
  onLikedOnlyChange,
}: SortBarProps) {
  return (
    <div className="sortbar">
      <div className="sortbar__sorts">
        {SORTS.map((s) => (
          <button
            key={s.key}
            className={`sortbar__sort ${sort === s.key ? "is-active" : ""}`}
            onClick={() => onSortChange(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <label className="sortbar__toggle">
        <span>찜한 것만 보기</span>
        <button
          className={`sortbar__switch ${likedOnly ? "is-on" : ""}`}
          onClick={() => onLikedOnlyChange(!likedOnly)}
          role="switch"
          aria-checked={likedOnly}
          aria-label="찜한 것만 보기"
        >
          <span className="sortbar__knob" />
        </button>
      </label>
    </div>
  );
}

export default SortBar;
