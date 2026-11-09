import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import type { Shoe, Term } from "../types";
import { API } from "../api";
import { apiFetch } from "../auth/session";
import { useAuth } from "../auth/useAuth";
import { useIsMobile } from "../useIsMobile";
import ShoeModal from "../components/ShoeModal";
import ShoeImage from "../components/ShoeImage";
import CompareTable from "../components/compare/CompareTable";
import CompareLikes from "../components/compare/CompareLikes";
import ComparePicker from "../components/compare/ComparePicker";
import { autofill, eulReul, formatCols, MAX_COLS, parseCols, WHY_LABEL, type Col } from "../utils/compare";
import { readLastCompare, writeLastCompare } from "../utils/compareStore";
import "./Compare.css";

/**
 * 비교하기 /compare(docs/08_compare.md) — 정해 둔 신발 2~5켤레를 점수 없이 나란히.
 * 구성은 주소가 정답(?ids=1,2&why=p,l), 마지막 구성만 이 브라우저에 기억한다. 로그인 없이 쓴다.
 * ?pick=id — 그 신발로 4켤레까지 채운다(상세 모달 "비교에 담기"). ?shoe=id — 상세 모달
 */
function Compare() {
  const [all, setAll] = useState<Shoe[] | null>(null);
  const [terms, setTerms] = useState<Term[]>([]);
  const [reload, setReload] = useState(0);
  const { status, user } = useAuth();
  const mobile = useIsMobile("(max-width: 1023px)");   // 표를 가로로 넘기는 구간(Compare.css) — 호버 대신 탭 · 시트
  const [params, setParams] = useSearchParams();

  useEffect(() => {
    if (status === "loading") return;              // liked 가 그 사람 기준이 되게 첫 refresh 뒤에
    const ctrl = new AbortController();
    apiFetch("/shoes", { signal: ctrl.signal })
      .then((r) => r.json())
      .then((list: Shoe[]) => setAll(list))
      .catch((e) => e.name !== "AbortError" && setAll([]));
    return () => ctrl.abort();
  }, [reload, status, user?.id]);
  useEffect(() => {
    fetch(`${API}/terms`).then((r) => r.json()).then(setTerms).catch(() => {});
  }, []);

  const known = useMemo(() => new Set((all ?? []).map((s) => s.id)), [all]);
  const byId = useMemo(() => new Map((all ?? []).map((s) => [s.id, s])), [all]);
  const idsParam = params.get("ids"), whyParam = params.get("why");
  const cols = useMemo(() => (all ? parseCols(idsParam, whyParam, known) : []), [all, idsParam, whyParam, known]);
  const shoes = cols.map((c) => byId.get(c.id)!).filter(Boolean);

  // 칸을 바꿀 때마다 뒤로 가기가 쌓이지 않게 replace
  const setCols = useCallback(
    (next: Col[]) =>
      setParams((p) => {
        const f = formatCols(next);
        if (next.length) p.set("ids", f.ids);
        else p.delete("ids");
        if (f.why) p.set("why", f.why);
        else p.delete("why");
        p.delete("pick");
        return p;
      }, { replace: true }),
    [setParams],
  );

  // ?pick= — 하나를 고르면 같은 라인 · 비슷한 신발로 넷까지
  const pick = params.get("pick");
  useEffect(() => {
    if (!all || !pick) return;
    const id = Number(pick);
    setCols(known.has(id) ? autofill(id, all) : []);
  }, [all, pick, known, setCols]);

  useEffect(() => {
    if (all && cols.length) writeLastCompare(cols);
  }, [all, cols]);
  const last = useMemo(() => (all ? readLastCompare(known) : []), [all, known]);

  // 조회 기록 — 로그인했고 두 켤레 이상일 때. 같은 조합 30분에 한 번은 서버가 거른다
  const idsKey = cols.map((c) => c.id).join(",");
  useEffect(() => {
    if (status !== "user" || idsKey.split(",").length < 2) return;
    const t = setTimeout(() => {
      apiFetch("/activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "compare.view", shoeIds: idsKey.split(",").map(Number) }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [idsKey, status, user?.id]);

  // 빼기 · 되돌리기(5초)
  const [toast, setToast] = useState<{ text: string; restore: Col[] } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const remove = (i: number) => {
    const s = byId.get(cols[i].id);
    setToast({ text: `${eulReul(s?.model ?? "신발")} 뺐어요`, restore: cols });
    setCols(cols.filter((_, j) => j !== i));
  };

  // 더하기 — 비었으면 자동 채우기, at 이 있으면 그 열을 바꾼다
  const [adding, setAdding] = useState(false);
  const add = (id: number, at: number | null = null) => {
    setAdding(false);
    if (!all || cols.some((c) => c.id === id)) return;
    if (cols.length === 0) return setCols(autofill(id, all));
    if (at != null && at < cols.length) return setCols(cols.map((c, j) => (j === at ? { id, why: "user" } : c)));
    if (cols.length < MAX_COLS) setCols([...cols, { id, why: "user" }]);
  };

  useEffect(() => {
    if (!adding) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAdding(false);
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [adding]);

  // 상세 모달 — ?shoe=. "리뷰 N"으로 열면 리뷰 쪽으로
  const modalId = Number(params.get("shoe")) || null;
  const [focusReviews, setFocusReviews] = useState(false);
  const openModal = (id: number, reviews: boolean) => {
    setFocusReviews(reviews);
    setParams((p) => { p.set("shoe", String(id)); return p; }, { replace: true });
  };
  const closeModal = () => setParams((p) => { p.delete("shoe"); return p; }, { replace: true });
  const modalShoe = modalId ? byId.get(modalId) : undefined;

  // 내 찜 열은 헤더 바로 아래에 붙는다 — 헤더 높이가 화면 폭마다 달라 잰다
  const [headerH, setHeaderH] = useState(118);
  const measured = useRef(false);
  useLayoutEffect(() => {
    const h = document.querySelector<HTMLElement>(".header");
    if (!h) return;
    const on = () => setHeaderH(h.offsetHeight);
    if (!measured.current) { measured.current = true; on(); }
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  const likes = status === "user" && all ? all.filter((s) => s.liked) : null;
  const inCompare = new Set(cols.map((c) => c.id));
  const guest = status !== "user";

  let main;
  if (!all) main = <p className="compare__loading">불러오는 중이에요…</p>;
  else if (cols.length === 0) {
    main = (
      <div className="compare__pick">
        <h3>비교할 신발을 골라 주세요</h3>
        <p>하나를 고르면 같은 라인 · 비슷한 신발로 4켤레까지 채워 드려요.</p>
        <ComparePicker inCompare={inCompare} onPick={(id) => add(id)} likes={mobile ? likes : undefined} autoFocus={!mobile} />
        {last.length > 0 && byId.get(last[0].id) && (
          <p className="compare__resume">
            마지막 비교 ·{" "}
            <button onClick={() => setCols(last)}>
              {byId.get(last[0].id)!.model}
              {last.length > 1 ? ` 외 ${last.length - 1}켤레` : ""} 이어서 보기
            </button>
          </p>
        )}
      </div>
    );
  } else if (cols.length === 1) {
    const s = shoes[0];
    main = (
      <div className="compare__one">
        <div className={`compare__onecard ${cols[0].why === "pick" ? "is-base" : ""}`}>
          {WHY_LABEL[cols[0].why] && <span className="ctable__why">{WHY_LABEL[cols[0].why]}</span>}
          <button className="ctable__x" onClick={() => remove(0)} aria-label={`${s.model} 빼기`}>✕</button>
          <button className="ctable__link" onClick={() => openModal(s.id, false)}>
            <span className="ctable__img"><ShoeImage src={s.image} alt={s.model} /></span>
            <small>{s.brand}</small>
            <strong>{s.model}</strong>
          </button>
        </div>
        <div className="compare__pick compare__pick--one">
          <h3>한 켤레 더 골라 주세요</h3>
          <p>비교는 두 켤레부터예요.</p>
          <ComparePicker inCompare={inCompare} onPick={(id) => add(id)} likes={mobile ? likes : undefined} />
          {!mobile && <p className="compare__hint">{guest ? "검색해서 추가하세요." : "오른쪽 내 찜에서 끌어 놓아도 돼요."}</p>}
        </div>
      </div>
    );
  } else {
    main = (
      <CompareTable cols={cols} shoes={shoes} all={all} terms={terms} guest={guest} mobile={mobile}
        onRemove={remove} onAdd={() => setAdding(true)} onDrop={add} onOpen={openModal} />
    );
  }

  return (
    <div className="compare" style={{ "--compare-top": `${headerH + 16}px` } as CSSProperties}>
      <div className="compare__head">
        <h2 className="compare__title">비교하기</h2>
        <p className="compare__desc">고른 신발을 나란히 놓고 봅니다. 값이 {all?.length || 310}켤레 가운데 어디쯤인지도 함께 보여 드려요.</p>
      </div>
      <div className="compare__layout">
        <div className="compare__main">{main}</div>
        {!mobile && <CompareLikes likes={likes} inCompare={inCompare} onAdd={(id) => add(id)} />}
      </div>

      {adding && (
        <>
          <div className="compare__dim" onClick={() => setAdding(false)} />
          <div className="compare__addbox" role="dialog" aria-label="신발 추가">
            <button className="compare__addx" onClick={() => setAdding(false)} aria-label="닫기">✕</button>
            <h4>신발 추가</h4>
            <ComparePicker inCompare={inCompare} onPick={(id) => add(id)} likes={likes} autoFocus />
          </div>
        </>
      )}

      {toast && (
        <div className="compare__toast" role="status">
          {toast.text}
          <button onClick={() => { setCols(toast.restore); setToast(null); }}>되돌리기</button>
        </div>
      )}

      {modalShoe && (
        <ShoeModal shoe={modalShoe} terms={terms} onClose={closeModal} onReviewChange={() => setReload((n) => n + 1)}
          focusReviews={focusReviews} inCompare />
      )}
    </div>
  );
}

export default Compare;
