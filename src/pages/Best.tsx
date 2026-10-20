import { API } from "../api";
import { useAuth } from "../auth/useAuth";
import { apiFetch } from "../auth/session";
import { useShoeLike } from "../auth/useShoeLike";
import { useState, useEffect } from "react";
import type { Shoe, Term } from "../types";
import ShoeCard from "../components/ShoeCard";
import ShoeModal from "../components/ShoeModal";
import "./Best.css";

const PURPOSES = [
  "조깅·회복주",
  "템포·인터벌",
  "LSD·장거리",
  "레이스",
  "트레일",
];

function Best() {
  const [shoes, setShoes] = useState<Shoe[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { status, user } = useAuth();

  const [reload, setReload] = useState(0);
  const getShoes = () => setReload((n) => n + 1);

  const getTerms = async () => {
    const res = await fetch(`${API}/terms`);
    setTerms(await res.json());
  };

  useEffect(() => {
    getTerms();
  }, []);

  // 첫 refresh 뒤 · 로그인 · 로그아웃 · 찜 · 리뷰 뒤에 다시(liked 가 그 사람 기준이다)
  useEffect(() => {
    if (status === "loading") return;
    apiFetch("/shoes")
      .then((res) => res.json())
      .then(setShoes)
      .catch((e) => console.error(e));
  }, [status, user?.id, reload]);

  const getScore = (shoe: Shoe) =>
    shoe.rating * 20 * (shoe.reviewCount / (shoe.reviewCount + 3)) +
    shoe.likeCount * 0.5;

  const ranked = [...shoes].sort((a, b) => getScore(b) - getScore(a));
  const top5 = ranked.slice(0, 5);

  const selectedShoe = shoes.find((s) => s.id === selectedId) ?? null;

  const toggleLike = useShoeLike(() => getShoes());

  // 평점 · 리뷰 수는 서버가 리뷰를 쓸 때 다시 센다 — 목록만 다시 받는다
  const handleReviewChange = () => getShoes();

  return (
    <div className="best">
      <div className="best__head">
        <h2 className="best__title">러너들의 선택</h2>
        <p className="best__desc">
          평점과 리뷰 수, 좋아요를 함께 반영한 종합 점수로 순위를 매겼습니다.
          <em>
            종합 점수 = 평점 × 20 × 신뢰도 + 좋아요 × 0.5
            <br />
            리뷰가 많을수록 평점을 더 반영합니다.
          </em>
        </p>
      </div>

      <section className="best__section">
        <h3 className="best__subtitle">종합 랭킹</h3>
        <div className="best__grid">
          {top5.map((shoe, i) => (
            <ShoeCard
              key={shoe.id}
              shoe={shoe}
              index={i}
              rank={i + 1}
              score={getScore(shoe)}
              onClick={() => setSelectedId(shoe.id)}
              onToggleLike={() => toggleLike(shoe)}
            />
          ))}
        </div>
      </section>

      <section className="best__section">
        <h3 className="best__subtitle">용도별 1위</h3>

        <div className="best__purposes">
          {PURPOSES.map((purpose) => {
            const winner = ranked.find((s) => s.purpose === purpose);

            return (
              <div className="best__purpose" key={purpose}>
                <p className="best__purposename">{purpose}</p>

                {winner ? (
                  <ShoeCard
                    shoe={winner}
                    index={0}
                    rank={1}
                    score={getScore(winner)}
                    onClick={() => setSelectedId(winner.id)}
                    onToggleLike={() => toggleLike(winner)}
                  />
                ) : (
                  <p className="best__empty">아직 등록된 러닝화가 없습니다.</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {selectedShoe && (
        <ShoeModal
          shoe={selectedShoe}
          terms={terms}
          onClose={() => setSelectedId(null)}
          onReviewChange={handleReviewChange}
        />
      )}
    </div>
  );
}

export default Best;
