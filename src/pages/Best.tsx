import { API } from "../api";
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

  const getShoes = async () => {
    const res = await fetch(`${API}/shoes`);
    setShoes(await res.json());
  };

  const getTerms = async () => {
    const res = await fetch(`${API}/terms`);
    setTerms(await res.json());
  };

  useEffect(() => {
    getShoes();
    getTerms();
  }, []);

  const getScore = (shoe: Shoe) =>
    shoe.rating * 20 + shoe.reviewCount * 3 + shoe.likeCount * 0.5;

  const ranked = [...shoes].sort((a, b) => getScore(b) - getScore(a));
  const top5 = ranked.slice(0, 5);

  const selectedShoe = shoes.find((s) => s.id === selectedId) ?? null;

  const toggleLike = async (shoe: Shoe) => {
    await fetch(`${API}/shoes/${shoe.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        liked: !shoe.liked,
        likeCount: shoe.liked ? shoe.likeCount - 1 : shoe.likeCount + 1,
      }),
    });
    getShoes();
  };

  const handleReviewChange = async () => {
    const res = await fetch(`${API}/reviews?shoeId=${selectedId}`);
    const list = await res.json();

    const reviewCount = list.length;
    const rating =
      reviewCount === 0
        ? 0
        : Math.round(
            (list.reduce(
              (sum: number, r: { rating: number }) => sum + r.rating,
              0,
            ) /
              reviewCount) *
              10,
          ) / 10;

    await fetch(`${API}/shoes/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, reviewCount }),
    });

    getShoes();
  };

  return (
    <div className="best">
      <div className="best__head">
        <h2 className="best__title">러너들의 선택</h2>
        <p className="best__desc">
          평점과 리뷰 수, 좋아요를 합산한 종합 점수로 순위를 매겼습니다.
          <em>종합 점수 = 평점 × 20 + 리뷰 수 × 3 + 좋아요 × 0.5</em>
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
