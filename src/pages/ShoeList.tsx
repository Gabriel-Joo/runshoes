import { useState, useEffect } from "react";
import type { Shoe } from "../types";
import Hero from "../components/Hero";

function ShoeList() {
  const [shoes, setShoes] = useState<Shoe[]>([]);

  const getShoes = async () => {
    const res = await fetch("http://localhost:3000/shoes");
    setShoes(await res.json());
  };

  useEffect(() => {
    getShoes();
  }, []);

  const heroShoe = shoes.find((s) => s.model === "페가수스 42");

  return (
    <>
      <Hero shoe={heroShoe} />
      <h2>목록 {shoes.length}개</h2>
    </>
  );
}

export default ShoeList;
