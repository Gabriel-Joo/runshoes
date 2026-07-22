import { API } from "../api";
import { useState, useEffect } from "react";
import type { Shoe, Term } from "../types";
import Hero from "../components/Hero";
import FilterBar from "../components/FilterBar";
import SortBar from "../components/SortBar";
import ShoeCard from "../components/ShoeCard";
import ShoeModal from "../components/ShoeModal";
import "./ShoeList.css";

function ShoeList() {
  const [shoes, setShoes] = useState<Shoe[]>([]);
  const [purpose, setPurpose] = useState("전체");
  const [sort, setSort] = useState("default");
  const [likedOnly, setLikedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);

  const selectedShoe = shoes.find((s) => s.id === selectedId) ?? null;
  const getShoes = async () => {
    const url =
      sort === "default"
        ? `${API}/shoes`
        : `${API}/shoes?_sort=${sort}&_order=desc`;
    const res = await fetch(url);
    setShoes(await res.json());
  };

  useEffect(() => {
    getShoes();
  }, [sort]);

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

  const visibleShoes = shoes
    .filter((s) => purpose === "전체" || s.purpose === purpose)
    .filter((s) => !likedOnly || s.liked);

  const getTerms = async () => {
    const res = await fetch(`${API}/terms`);
    setTerms(await res.json());
  };

  useEffect(() => {
    getTerms();
  }, []);

  const handleReviewChange = async () => {
    const res = await fetch(`${API}/reviews?shoeId=${selectedShoe!.id}`);
    const list: Review[] = await res.json();

    const reviewCount = list.length;
    const rating =
      reviewCount === 0
        ? 0
        : Math.round(
            (list.reduce((sum, r) => sum + r.rating, 0) / reviewCount) * 10,
          ) / 10;

    await fetch(`${API}/shoes/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, reviewCount }),
    });

    getShoes();
  };

  return (
    <>
      <Hero />

      <FilterBar selected={purpose} onSelect={setPurpose} />

      <SortBar
        sort={sort}
        onSortChange={setSort}
        likedOnly={likedOnly}
        onLikedOnlyChange={setLikedOnly}
      />

      <div className="grid">
        {visibleShoes.map((shoe, i) => (
          <ShoeCard
            key={shoe.id}
            shoe={shoe}
            index={i}
            onClick={() => setSelectedId(shoe.id)}
            onToggleLike={() => toggleLike(shoe)}
          />
        ))}
      </div>
      {selectedShoe && (
        <ShoeModal
          shoe={selectedShoe}
          terms={terms}
          onClose={() => setSelectedId(null)}
          onReviewChange={handleReviewChange}
        />
      )}
    </>
  );
}

export default ShoeList;
