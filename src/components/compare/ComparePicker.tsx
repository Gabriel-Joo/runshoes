import { useEffect, useState } from "react";
import type { Shoe } from "../../types";
import ShoeImage from "../ShoeImage";
import { apiFetch } from "../../auth/session";
import { useDebounced } from "../../useDebounced";
import { sortResults } from "../../utils/compare";

interface Props {
  inCompare: Set<number>;
  onPick: (id: number) => void;
  likes?: Shoe[] | null;          // 주면 검색창 아래에 "내 찜"(추가 창 · 휴대폰)
  autoFocus?: boolean;
}

/**
 * 신발 고르기 — 홈과 같은 서버 검색(브랜드 한글 · 영문, 모델, 영어 이름, 다른 표기). 310켤레 전체에서 찾는다(현행만 거르지 않는다 — 옛 세대도 비교).
 * 결과는 개수 먼저, 같은 라인은 붙여서 새 세대 → 옛 세대(08 1-2)
 */
function ComparePicker({ inCompare, onPick, likes, autoFocus }: Props) {
  const [keyword, setKeyword] = useState("");
  const q = useDebounced(keyword.trim());
  const [found, setFound] = useState<Shoe[] | null>(null);

  useEffect(() => {
    if (!q) return;
    const ctrl = new AbortController();
    apiFetch(`/shoes?search=${encodeURIComponent(q)}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((list: Shoe[]) => setFound(sortResults(list)))
      .catch((e) => e.name !== "AbortError" && setFound([]));
    return () => ctrl.abort();
  }, [q]);
  const results = q ? found : null;

  const row = (s: Shoe, tail: string) => {
    const on = inCompare.has(s.id);
    return (
      <li key={s.id}>
        <button className={`cpick__item ${on ? "is-in" : ""}`} disabled={on} onClick={() => onPick(s.id)}>
          <span className="cpick__img"><ShoeImage src={s.image} alt="" /></span>
          <span className="cpick__name"><small>{s.brand}</small>{s.model}</span>
          <em>{on ? "비교 중" : tail || (s.isCurrent ? "현행" : "지난 세대")}</em>
        </button>
      </li>
    );
  };

  return (
    <div className="cpick">
      <input
        className="cpick__input"
        type="search"
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="브랜드 · 모델 · 영어 이름"
        aria-label="비교할 신발 검색"
        autoFocus={autoFocus}
      />
      {results && (
        <ul className="cpick__results">
          <li className="cpick__count">{results.length ? `${results.length}켤레` : "찾는 신발이 없어요"}</li>
          {results.map((s) => row(s, ""))}
        </ul>
      )}
      {likes && likes.length > 0 && (
        <>
          <h5 className="cpick__sub">내 찜</h5>
          <ul className="cpick__likes">{likes.map((s) => row(s, "추가"))}</ul>
        </>
      )}
    </div>
  );
}

export default ComparePicker;
