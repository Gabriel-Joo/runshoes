import type { Term } from "../types";
import "./TermTooltip.css";

interface TermTooltipProps {
  term?: Term;
  openTerm: string | null;
  onToggle: (key: string | null) => void;
}

function TermTooltip({ term, openTerm, onToggle }: TermTooltipProps) {
  if (!term) return null;

  const open = openTerm === term.key;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggle(open ? null : term.key);
  };

  return (
    <span className="tooltip">
      <button
        className="tooltip__trigger"
        onClick={handleClick}
        aria-label={`${term.name} 설명 ${open ? "닫기" : "보기"}`}
      >
        ⓘ
      </button>

      {open && (
        <span className="tooltip__box" onClick={(e) => e.stopPropagation()}>
          <strong className="tooltip__name">{term.name}</strong>
          <span className="tooltip__desc">{term.description}</span>
        </span>
      )}
    </span>
  );
}

export default TermTooltip;
