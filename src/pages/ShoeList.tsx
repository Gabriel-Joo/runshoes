import { useState, useEffect } from "react";
import type { Shoe } from "../types";
import Hero from "../components/Hero";
import FilterBar from "../components/FilterBar";
import ShoeCard from "../components/ShoeCard";
import "./ShoeList.css";

function ShoeList() {
  const [shoes, setShoes] = useState<Shoe[]>([]);
  const [purpose, setPurpose] = useState("전체");

  const getShoes = async () => {
    const res = await fetch("http://localhost:3000/shoes");
    setShoes(await res.json());
  };

  useEffect(() => {
    getShoes();
  }, []);

  const visibleShoes =
    purpose === "전체" ? shoes : shoes.filter((s) => s.purpose === purpose);

  return (
    <>
      <Hero />

      <FilterBar selected={purpose} onSelect={setPurpose} />

      <div className="grid">
        {visibleShoes.map((shoe, i) => (
          <ShoeCard
            key={shoe.id}
            shoe={shoe}
            index={i}
            onClick={() => console.log("모달 열기", shoe.model)}
            onToggleLike={() => console.log("찜 토글", shoe.model)}
          />
        ))}
      </div>
    </>
  );
}

export default ShoeList;
