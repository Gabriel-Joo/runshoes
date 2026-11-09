import { Link, useLocation } from "react-router-dom";
import type { Shoe } from "../../types";
import ShoeImage from "../ShoeImage";
import { loginPath } from "../../auth/session";

interface Props {
  likes: Shoe[] | null;          // null — 로그인 안 함
  inCompare: Set<number>;
  onAdd: (id: number) => void;   // 누르거나 Enter — 끝에 더한다(끌어 놓기는 표가 받는다)
}

/** 내 찜(PC) — 오른쪽 세로 열, 스크롤해도 따라온다. 표의 열이나 "+ 추가" 칸에 끌어 놓는다(08 1-4) */
function CompareLikes({ likes, inCompare, onAdd }: Props) {
  const location = useLocation();
  if (!likes) {
    return (
      <aside className="clikes">
        <h3 className="clikes__title">내 찜</h3>
        <p className="clikes__guest">
          <Link to={loginPath(location.pathname + location.search)}>로그인</Link>하면 찜한 신발을 끌어올 수 있어요
        </p>
      </aside>
    );
  }
  return (
    <aside className="clikes">
      <h3 className="clikes__title">
        내 찜 · {likes.length}
        <span>표의 열이나 "+ 추가" 칸에 끌어 놓으세요</span>
      </h3>
      {likes.length === 0 ? (
        <p className="clikes__guest">찜한 신발이 없어요. 상세 화면의 하트로 찜할 수 있어요.</p>
      ) : (
        <ul className="clikes__list">
          {likes.map((s) => {
            const on = inCompare.has(s.id);
            return (
              <li
                key={s.id}
                className={`clikes__item ${on ? "is-in" : ""}`}
                draggable={!on}
                tabIndex={on ? -1 : 0}
                role="button"
                aria-disabled={on}
                aria-label={on ? `${s.model} — 비교 중` : `${s.model} 비교에 더하기`}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/x-shoe", String(s.id));
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => !on && onAdd(s.id)}
                onKeyDown={(e) => e.key === "Enter" && !on && onAdd(s.id)}
              >
                <span className="clikes__img"><ShoeImage src={s.image} alt="" /></span>
                <span className="clikes__name">
                  <small>{s.brand}</small>
                  <strong>{s.model}</strong>
                </span>
                {on && <em>비교 중</em>}
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

export default CompareLikes;
