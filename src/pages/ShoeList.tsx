import { API } from "../api";
import { useState, useEffect, useMemo } from "react";
import { useDebounced } from "../useDebounced";
import type { Shoe, Term, Review } from "../types";
import Hero from "../components/Hero";
import FilterBar from "../components/FilterBar";
import SortBar from "../components/SortBar";
import ShoeCard from "../components/ShoeCard";
import ShoeModal from "../components/ShoeModal";
import SearchBox from "../components/SearchBox";
import "./ShoeList.css";

function ShoeList() {
  const [shoes, setShoes] = useState<Shoe[]>([]);
  const [purpose, setPurpose] = useState("전체");
  const [sort, setSort] = useState("default");
  const [likedOnly, setLikedOnly] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [reload, setReload] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);

  const selectedShoe = shoes.find((s) => s.id === selectedId) ?? null;
  const search = useDebounced(keyword.trim());

  // 거르기 · 정렬은 서버가 한다(용도 · 찜 · 검색 · 정렬). 페이지를 붙일 때는 여기에 _start · _limit 을 더하고 X-Total-Count 를 읽는다
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (purpose !== "전체") p.set("purpose", purpose);
    if (likedOnly) p.set("liked", "true");
    if (search) p.set("search", search);
    if (sort !== "default") {
      p.set("_sort", sort);
      p.set("_order", "desc");
    }
    return p.toString();
  }, [purpose, likedOnly, search, sort]);

  useEffect(() => {
    const ctrl = new AbortController();      // 조건이 바뀌면 앞 요청의 응답은 버린다
    fetch(`${API}/shoes${query ? `?${query}` : ""}`, { signal: ctrl.signal })
      .then((res) => res.json())
      .then((list: Shoe[]) => {
        setShoes(list);
        setLoaded(true);
      })
      .catch((e) => {
        if (e.name !== "AbortError") console.error(e);
      });
    return () => ctrl.abort();
  }, [query, reload]);

  const getShoes = () => setReload((n) => n + 1);

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

      <FilterBar
        selected={purpose}
        onSelect={setPurpose}
        search={<SearchBox value={keyword} onChange={setKeyword} />}
      />

      <SortBar
        sort={sort}
        onSortChange={setSort}
        likedOnly={likedOnly}
        onLikedOnlyChange={setLikedOnly}
      />

      {loaded && shoes.length === 0 ? (
        <p className="shoelist__empty">조건에 맞는 러닝화가 없습니다.</p>
      ) : (
      <div className="grid">
        {shoes.map((shoe, i) => (
          <ShoeCard
            key={shoe.id}
            shoe={shoe}
            index={i}
            onClick={() => setSelectedId(shoe.id)}
            onToggleLike={() => toggleLike(shoe)}
          />
        ))}
      </div>
      )}
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
