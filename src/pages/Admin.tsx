import { API } from "../api";
import { useState, useEffect, useMemo } from "react";
import { useDebounced } from "../useDebounced";
import { Link, useNavigate } from "react-router-dom";
import type { Shoe } from "../types";
import ShoeImage from "../components/ShoeImage";
import ConfirmModal from "../components/ConfirmModal";
import SearchBox from "../components/SearchBox";
import "./Admin.css";

const SORTS = [
  { key: "id", label: "등록순" },
  { key: "brand", label: "브랜드순" },
  { key: "model", label: "모델명순" },
];

function Admin() {
  const navigate = useNavigate();

  const [shoes, setShoes] = useState<Shoe[]>([]);
  const [brand, setBrand] = useState("전체");
  const [keyword, setKeyword] = useState("");
  const [sort, setSort] = useState("id");
  const [target, setTarget] = useState<Shoe | null>(null);
  const [brands, setBrands] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [reload, setReload] = useState(0);

  const search = useDebounced(keyword.trim());

  // 홈과 같은 서버 검색(search = 브랜드 · 모델명, 낱말 AND) — 브랜드 칩 · 정렬도 서버가 한다
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (brand !== "전체") p.set("brand", brand);
    if (search) p.set("search", search);
    p.set("_sort", sort);
    return p.toString();
  }, [brand, search, sort]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`${API}/shoes?${query}`, { signal: ctrl.signal })
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

  // 브랜드 칩과 "전체 N개"는 검색 결과와 상관없이 전부 — 목록을 다 받지 않고 브랜드 목록 · 개수만
  useEffect(() => {
    fetch(`${API}/brands`)
      .then((res) => res.json())
      .then(setBrands);
    fetch(`${API}/shoes?_limit=0`).then((res) =>
      setTotal(Number(res.headers.get("X-Total-Count") ?? 0)),
    );
  }, [reload]);

  const getShoes = () => setReload((n) => n + 1);

  const removeShoe = async () => {
    if (!target) return;

    const res = await fetch(`${API}/reviews?shoeId=${target.id}`);
    const reviews = await res.json();

    for (const review of reviews) {
      await fetch(`${API}/reviews/${review.id}`, {
        method: "DELETE",
      });
    }

    await fetch(`${API}/shoes/${target.id}`, {
      method: "DELETE",
    });

    setTarget(null);
    getShoes();
  };

  return (
    <div className="admin">
      <div className="admin__head">
        <h2 className="admin__title">러닝화 관리</h2>
        <button className="admin__new" onClick={() => navigate("/new")}>
          + 새 러닝화 등록
        </button>
      </div>

      <div className="admin__brands">
        {["전체", ...brands].map((b) => (
          <button
            key={b}
            className={`admin__brand ${brand === b ? "is-active" : ""}`}
            onClick={() => setBrand(b)}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="admin__tools">
        <div className="admin__search">
          <SearchBox value={keyword} onChange={setKeyword} />
        </div>

        <div className="admin__sorts">
          {SORTS.map((s) => (
            <button
              key={s.key}
              className={`admin__sort ${sort === s.key ? "is-active" : ""}`}
              onClick={() => setSort(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <p className="admin__count">
        {shoes.length}개 / 전체 {total}개
      </p>

      <ul className="admin__list">
        {loaded && shoes.length === 0 && (
          <li className="admin__empty">조건에 맞는 러닝화가 없습니다.</li>
        )}

        {shoes.map((shoe) => (
          <li className="admin__row" key={shoe.id}>
            <div className="admin__thumb">
              <ShoeImage src={shoe.image} alt={shoe.model} />
            </div>

            <span className="admin__no">
              NO.{String(shoe.id).padStart(2, "0")}
            </span>

            <span className="admin__purpose">{shoe.purpose}</span>

            <div className="admin__names">
              <span className="admin__model">{shoe.model}</span>
              <span className="admin__brandname">{shoe.brand}</span>
            </div>

            <div className="admin__actions">
              <Link className="admin__edit" to={`/edit/${shoe.id}`}>
                수정
              </Link>
              <button className="admin__delete" onClick={() => setTarget(shoe)}>
                삭제
              </button>
            </div>
          </li>
        ))}
      </ul>

      {target && (
        <ConfirmModal
          message={`'${target.model}'을(를) 삭제할까요?`}
          detail="등록된 리뷰도 함께 삭제되며 되돌릴 수 없습니다."
          onConfirm={removeShoe}
          onCancel={() => setTarget(null)}
        />
      )}
    </div>
  );
}

export default Admin;
