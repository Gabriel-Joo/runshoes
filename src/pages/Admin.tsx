import { API } from "../api";
import { useState, useEffect, useMemo } from "react";
import { useDebounced } from "../useDebounced";
import { apiFetch } from "../auth/session";
import { Link, useNavigate } from "react-router-dom";
import type { Shoe } from "../types";
import ShoeImage from "../components/ShoeImage";
import HideShoeConfirm from "../components/HideShoeConfirm";
import { useAuth } from "../auth/useAuth";
import { demoBlocked } from "../auth/demoAdmin";
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
  const [hidden, setHidden] = useState<Shoe[]>([]);
  const [tab, setTab] = useState<"list" | "hidden">("list");   // 등록된 신발 · 숨긴 신발(2026-10-30 — 목록 끝까지 내리지 않게 개수 줄 오른쪽에)
  const [busy, setBusy] = useState(false);
  const { setNotice, isDemoAdmin } = useAuth();

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
    apiFetch(`/shoes?${query}`, { signal: ctrl.signal })
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
    // 숨긴 신발(V8) — admin · 데모 관리자가 본다
    apiFetch("/admin/shoes/hidden")
      .then((res) => (res.ok ? res.json() : []))
      .then(setHidden)
      .catch(() => setHidden([]));
  }, [reload]);

  const getShoes = () => setReload((n) => n + 1);

  // 삭제 = 숨김(V8) — 리뷰 · 찜은 남고 신발과 함께 화면에서 빠진다. admin 만(서버 403 — 데모 관리자는 그 문구)
  const removeShoe = async () => {
    if (!target) return;
    setBusy(true);
    const res = await apiFetch(`/shoes/${target.id}`, { method: "DELETE" });
    setBusy(false);
    const blocked = await demoBlocked(res);
    if (blocked) setNotice(blocked);
    else if (!res.ok) alert(res.status === 403 ? "관리자만 지울 수 있어요." : "지우지 못했어요. 잠시 뒤 다시 해 주세요.");
    else setNotice(`'${target.model}'을(를) 숨겼어요. 숨긴 신발에서 되살릴 수 있어요.`);
    setTarget(null);
    getShoes();
  };

  const restoreShoe = async (shoe: Shoe) => {
    const res = await apiFetch(`/admin/shoes/${shoe.id}/restore`, { method: "POST" });
    const blocked = await demoBlocked(res);
    if (blocked) return setNotice(blocked);
    if (!res.ok) return alert("되살리지 못했어요. 잠시 뒤 다시 해 주세요.");
    setNotice(`'${shoe.model}'을(를) 되살렸어요. 리뷰 · 찜도 돌아왔어요.`);
    getShoes();
  };

  // 데모 관리자 — 화면은 다 보이고, 누르면 서버가 막는다(새 등록 폼도 열어 볼 수 있다)

  return (
    <div className="admin">
      <div className="admin__head">
        <h2 className="admin__title">
          러닝화 관리
          {isDemoAdmin && <span className="admin__demo">데모 관리자 · 보기 전용</span>}
        </h2>
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

      <div className="admin__countbar">
        <p className="admin__count">
          {tab === "list" ? `${shoes.length}개 / 전체 ${total}개` : `숨긴 신발 ${hidden.length}개`}
        </p>
        <div className="admin__tabs" role="tablist" aria-label="목록">
          <button role="tab" aria-selected={tab === "list"} className={`admin__tab ${tab === "list" ? "is-active" : ""}`} onClick={() => setTab("list")}>
            등록된 신발
          </button>
          <button role="tab" aria-selected={tab === "hidden"} className={`admin__tab ${tab === "hidden" ? "is-active" : ""}`} onClick={() => setTab("hidden")}>
            숨긴 신발 {hidden.length}
          </button>
        </div>
      </div>

      {tab === "list" && (
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
      )}

      {tab === "hidden" && (
          <ul className="admin__list">
            {hidden.length === 0 && <li className="admin__empty">숨긴 신발이 없습니다.</li>}
            {hidden.map((shoe) => (
              <li className="admin__row is-hidden" key={shoe.id}>
                <div className="admin__thumb">
                  <ShoeImage src={shoe.image} alt={shoe.model} />
                </div>
                <span className="admin__no">NO.{String(shoe.id).padStart(2, "0")}</span>
                <span className="admin__purpose">리뷰 {shoe.reviewCount} · 찜 {shoe.likeCount}</span>
                <div className="admin__names">
                  <span className="admin__model">{shoe.model}</span>
                  <span className="admin__brandname">
                    {shoe.brand} · {shoe.deletedAt?.slice(0, 10)} 숨김
                  </span>
                </div>
                <div className="admin__actions">
                  <button className="admin__edit" onClick={() => restoreShoe(shoe)}>
                    되살리기
                  </button>
                </div>
              </li>
            ))}
          </ul>
      )}

      {target && <HideShoeConfirm shoe={target} busy={busy} onConfirm={removeShoe} onCancel={() => setTarget(null)} />}
    </div>
  );
}

export default Admin;
