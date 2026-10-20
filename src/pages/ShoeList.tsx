import { API } from "../api";
import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useDebounced } from "../useDebounced";
import { useAuth } from "../auth/useAuth";
import { apiFetch } from "../auth/session";
import { useShoeLike } from "../auth/useShoeLike";
import type { Shoe, Term } from "../types";
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
  const [terms, setTerms] = useState<Term[]>([]);
  const { status, user } = useAuth();
  // 상세 모달은 ?shoe={id} — 로그인하고 돌아오면(returnTo) 같은 신발이 다시 열린다
  const [params, setParams] = useSearchParams();
  const selectedId = Number(params.get("shoe")) || null;
  const setSelectedId = (id: number | null) =>
    setParams((p) => {
      if (id) p.set("shoe", String(id));
      else p.delete("shoe");
      return p;
    }, { replace: true });
  const likedOnlyOn = likedOnly && status === "user";   // 로그아웃하면 찜 거르기도 꺼진다

  const selectedShoe = shoes.find((s) => s.id === selectedId) ?? null;
  const search = useDebounced(keyword.trim());

  // 거르기 · 정렬은 서버가 한다(용도 · 찜 · 검색 · 정렬). 페이지를 붙일 때는 여기에 _start · _limit 을 더하고 X-Total-Count 를 읽는다
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (purpose !== "전체") p.set("purpose", purpose);
    if (likedOnlyOn) p.set("liked", "true");
    if (search) p.set("search", search);
    if (sort !== "default") {
      p.set("_sort", sort);
      p.set("_order", "desc");
    }
    return p.toString();
  }, [purpose, likedOnlyOn, search, sort]);

  useEffect(() => {
    if (status === "loading") return;          // 첫 refresh 뒤에 — liked 가 그 사람 기준이다
    const ctrl = new AbortController();      // 조건이 바뀌면 앞 요청의 응답은 버린다
    apiFetch(`/shoes${query ? `?${query}` : ""}`, { signal: ctrl.signal })
      .then((res) => res.json())
      .then((list: Shoe[]) => {
        setShoes(list);
        setLoaded(true);
      })
      .catch((e) => {
        if (e.name !== "AbortError") console.error(e);
      });
    return () => ctrl.abort();
  }, [query, reload, status, user?.id]);

  const getShoes = () => setReload((n) => n + 1);
  const toggleLike = useShoeLike(getShoes);

  const getTerms = async () => {
    const res = await fetch(`${API}/terms`);
    setTerms(await res.json());
  };

  useEffect(() => {
    getTerms();
  }, []);

  // 평점 · 리뷰 수는 서버가 리뷰를 쓸 때 다시 센다 — 목록만 다시 받는다
  const handleReviewChange = getShoes;

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
        likedOnly={likedOnlyOn}
        onLikedOnlyChange={setLikedOnly}
        showLikedOnly={status === "user"}
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
