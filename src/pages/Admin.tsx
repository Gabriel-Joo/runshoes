import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Shoe } from "../types";
import ShoeImage from "../components/ShoeImage";
import ConfirmModal from "../components/ConfirmModal";
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

  const getShoes = async () => {
    const res = await fetch("http://localhost:3000/shoes");
    setShoes(await res.json());
  };

  useEffect(() => {
    getShoes();
  }, []);

  const brands = ["전체", ...new Set(shoes.map((s) => s.brand))];

  const visibleShoes = shoes
    .filter((s) => brand === "전체" || s.brand === brand)
    .filter((s) => s.model.toLowerCase().includes(keyword.trim().toLowerCase()))
    .sort((a, b) => {
      if (sort === "id") return a.id - b.id;
      if (sort === "brand") return a.brand.localeCompare(b.brand);
      return a.model.localeCompare(b.model);
    });

  const removeShoe = async () => {
    if (!target) return;

    const res = await fetch(`http://localhost:3000/reviews?shoeId=${target.id}`);
    const reviews = await res.json();

    for (const review of reviews) {
      await fetch(`http://localhost:3000/reviews/${review.id}`, {
        method: "DELETE",
      });
    }

    await fetch(`http://localhost:3000/shoes/${target.id}`, {
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
        {brands.map((b) => (
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
        <input
          className="admin__search"
          type="text"
          placeholder="모델명 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
        />

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
        {visibleShoes.length}개 / 전체 {shoes.length}개
      </p>

      <ul className="admin__list">
        {visibleShoes.length === 0 && (
          <li className="admin__empty">조건에 맞는 러닝화가 없습니다.</li>
        )}

        {visibleShoes.map((shoe) => (
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
              <button
                className="admin__delete"
                onClick={() => setTarget(shoe)}
              >
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