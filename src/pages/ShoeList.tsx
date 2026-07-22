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
  const [selectedShoe, setSelectedShoe] = useState<Shoe | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);

  const getShoes = async () => {
    const url =
      sort === "default"
        ? "http://localhost:3000/shoes"
        : `http://localhost:3000/shoes?_sort=${sort}&_order=desc`;
    const res = await fetch(url);
    setShoes(await res.json());
  };

  useEffect(() => {
    getShoes();
  }, [sort]);

  const toggleLike = async (shoe: Shoe) => {
    await fetch(`http://localhost:3000/shoes/${shoe.id}`, {
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
    const res = await fetch("http://localhost:3000/terms");
    setTerms(await res.json());
  };

  useEffect(() => {
    getTerms();
  }, []);

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
            onClick={() => setSelectedShoe(shoe)}
            onToggleLike={() => toggleLike(shoe)}
          />
        ))}
      </div>
      {selectedShoe && (
        <ShoeModal shoe={selectedShoe} 
        terms= {terms}
        onClose={() => setSelectedShoe(null)} />
        
      )}
    </>
  );
}

export default ShoeList;
