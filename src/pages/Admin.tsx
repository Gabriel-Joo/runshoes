import { API } from "../api";
import { useState, useEffect, useMemo } from "react";
import { useDebounced } from "../useDebounced";
import { apiFetch } from "../auth/session";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import type { Shoe } from "../types";
import ShoeImage from "../components/ShoeImage";
import HideShoeConfirm from "../components/HideShoeConfirm";
import ConfirmModal from "../components/ConfirmModal";
import { useAuth } from "../auth/useAuth";
import { demoBlocked } from "../auth/demoAdmin";
import SearchBox from "../components/SearchBox";
import { Pager, SizeChoice } from "./adminmy/parts";
import { PAGE_SIZES, pageSize } from "../utils/pageGroup";
import "./Admin.css";
import "./AdminMy.css";   // 쪽 번호 · 몇 개씩 보기 칸(adminmy__pager · adminmy__choice) — 관리자 페이지와 같은 모양

// 정렬(2026-11-01 사용자) — 기본 최근 수정순. 고른 것을 다시 누르면 방향이 바뀐다: ↓ 최근 · 가나다 / ↑ 오래된 · 역순.
//   목록 · 정렬 · 빈 칸 판정 · 쪽 나누기는 서버가 한다(GET /api/admin/shoes, 2026-11-15 — 리뷰 · 회원 관리와 같은 {items, total, page, size}).
//   화면은 받은 한 쪽을 그리기만 한다
/** 영구 삭제 기록 한 줄(V11 shoe_purges) — 지울 때의 리뷰 · 찜 수 */
type PurgedShoe = { id: number; lineKey: string | null; generation: number | null; gender: string | null; brand: string; model: string; reviews: number; likes: number; purgedAt: string };
/** 신발 관리 목록 한 줄 — 공개 /api/shoes 와 같은 신발 + 숨긴 신발은 deletedAt, 보완 필요는 빈 칸 이름 gaps(서버 AdminShoes.GAPS 순서) */
type AdminShoe = Shoe & { deletedAt?: string | null; gaps?: string[] };
/** GET /api/admin/shoes 응답 — counts 는 탭 단추의 수(list · gaps 는 브랜드 · 검색을 건 수, all 은 전체), gapCounts 는 빈 칸 칩의 수 */
type AdminShoePage = {
  items: (AdminShoe & PurgedShoe)[];
  total: number;
  page: number;
  size: number;
  counts: { list: number; all: number; hidden: number; gaps: number; purged: number };
  gapCounts: Record<string, number>;
};
const GENDER: Record<string, string> = { men: "남성", women: "여성", unisex: "공용" };

type SortKey = "gaps" | "updated" | "id" | "brand" | "model";
const SORTS: { key: SortKey; label: string }[] = [
  { key: "updated", label: "최근 수정순" },
  { key: "id", label: "등록순" },
  { key: "brand", label: "브랜드순" },
  { key: "model", label: "모델명순" },
];

// 보완 필요 탭(2026-11-01 사용자)의 빈 칸 — 어떤 칸이 비었는지는 서버가 판정한다(AdminShoes.GAPS, 2026-11-15 옮김). 여기는 칩 이름과 순서만
const GAPS: { key: string; label: string }[] = [
  { key: "price", label: "가격" },
  { key: "width", label: "발볼" },
  { key: "wideAvailable", label: "와이드" },
  { key: "stackHeight", label: "스택" },
  { key: "midsole", label: "미드솔" },
  { key: "carbon", label: "카본" },
  { key: "weight", label: "중량" },
  { key: "drop", label: "드롭" },
  { key: "weightSize", label: "중량 사이즈" },
  { key: "sku", label: "품번" },
];
const GAP_LABEL = Object.fromEntries(GAPS.map((g) => [g.key, g.label]));
// 기본은 빈 칸 적은 순(2026-11-01 사용자 — 한 칸만 빈 신발부터 고치면 목록이 빨리 준다). 다시 누르면 많은 순
const GAP_SORTS: { key: SortKey; label: string }[] = [{ key: "gaps", label: "빈 칸 적은 순" }, ...SORTS];

// 바뀐 칸 이름(API) → 화면 이름. 한 번에 같이 바뀌는 칸(대표 · 추가 이미지, 가격 출처 · 날짜 · 종류)은 한 이름으로 묶는다
const FIELD_LABEL: Record<string, string> = {
  brand: "브랜드", model: "모델명", purpose: "용도", stability: "안정성", midsole: "미드솔", weight: "중량", drop: "드롭",
  stackHeight: "스택하이트", width: "발볼", wideAvailable: "와이드 모델", carbon: "카본 플레이트", price: "가격",
  image: "이미지", images: "이미지", summary: "한 줄 요약", description: "상세 설명", lineKey: "라인키", generation: "세대",
  isCurrent: "현행", gender: "성별", weightSize: "중량 기준 사이즈", specSize: "스펙 기준 사이즈", measuredWeight: "실측 중량",
  measuredWeightSize: "실측 사이즈", measuredStackHeight: "실측 스택", measuredDrop: "실측 드롭", measuredSource: "실측 출처",
  measuredCount: "실측 수", priceSource: "가격 출처", priceCheckedAt: "가격 출처", priceKind: "가격 출처", specSources: "스펙 출처", sku: "품번",
  wideScope: "와이드 모델", modelEn: "영어 이름", modelAlias: "검색용 다른 표기",
};
const EVENT_LABEL: Record<string, string> = { created: "신규 등록", hidden: "숨김", restored: "되살림" };

/** 수정 이력 칸 — 2개까지, 넘으면 "외 N건"(2026-11-01 사용자). 고친 적 없으면 null */
function changeOf(shoe: Shoe): { text: string; all: string; at: string } | null {
  if (!shoe.updatedAt || !shoe.lastChange?.length) return null;
  const d = new Date(shoe.updatedAt);
  const p2 = (n: number) => String(n).padStart(2, "0");
  const at = `${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  const event = shoe.lastChange.length === 1 ? EVENT_LABEL[shoe.lastChange[0]] : undefined;
  if (event) return { text: event, all: event, at };
  const names = [...new Set(shoe.lastChange.map((f) => FIELD_LABEL[f] ?? f))];
  const text = names.length === 1 ? `${names[0]} 수정` : names.length === 2 ? names.join("·") : `${names.slice(0, 2).join("·")} 외 ${names.length - 2}건`;
  return { text, all: names.join(", "), at };
}

function Admin() {
  const navigate = useNavigate();

  // 보는 자리(탭 · 필터 · 정렬 · 브랜드 · 검색)는 주소(?tab=gaps&gap=width …)에 둔다 — 수정 화면에서 저장 · 취소하면 그 주소로 돌아온다(2026-11-01 사용자)
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const oneOf = <T extends string>(v: string | null, ok: readonly T[], d: T): T => (ok.includes(v as T) ? (v as T) : d);
  const SORT_KEYS = ["updated", "id", "brand", "model"] as const;
  const [brand, setBrand] = useState(() => params.get("brand") ?? "전체");
  const [keyword, setKeyword] = useState(() => params.get("q") ?? "");
  const [sort, setSort] = useState<SortKey>(() => oneOf(params.get("sort"), SORT_KEYS, "updated"));
  const [down, setDown] = useState(() => params.get("dir") !== "up");
  const [target, setTarget] = useState<Shoe | null>(null);
  const [purgeTarget, setPurgeTarget] = useState<Shoe | null>(null);
  const [brands, setBrands] = useState<string[]>([]);
  const [data, setData] = useState<(AdminShoePage & { tab: string }) | null>(null);
  const [reload, setReload] = useState(0);
  // 리뷰 요약(V14) — 다시 만들 것 · 아직 없는 것. 읽기만(만드는 것은 매일 03:30 CronJob — 화면에서 돌리지 않는다, 2026-11-10 사용자)
  const [summaries, setSummaries] = useState<{ stale: number; pending: number; generated: number; total: number } | null>(null);
  // 등록된 신발 · 숨긴 신발 · 보완 필요(2026-10-30 — 목록 끝까지 내리지 않게 개수 줄 오른쪽에).
  //   챗봇 문의 탭은 관리자 페이지(/account?tab=misses)로 옮겼다(2026-11-14 사용자 — 이 탭은 신발 전용)
  const [tab, setTab] = useState<"list" | "hidden" | "gaps" | "purged">(() => oneOf(params.get("tab"), ["list", "hidden", "gaps", "purged"] as const, "list"));
  // 영구 삭제 기록 탭(V11 shoe_purges, 2026-11-14 사용자) — 읽기만, 최근 먼저
  // 보완 필요 탭 — 필터(칸 하나, null = 전체) · 정렬은 등록된 신발 탭과 따로(기본 빈 칸 적은 순)
  const [gapKey, setGapKey] = useState<string | null>(() => oneOf(params.get("gap"), GAPS.map((g) => g.key), "") || null);
  const [gapSort, setGapSort] = useState<SortKey>(() => oneOf(params.get("gsort"), ["gaps", ...SORT_KEYS] as const, "gaps"));
  const [gapDown, setGapDown] = useState(() => params.get("gdir") !== "up");
  // 몇 개씩 · 몇 쪽(2026-11-15 사용자) — 서버가 나눈다. 탭 · 브랜드 · 검색 · 정렬 · 빈 칸 · 몇 개씩을 바꾸면 1쪽으로
  const [size, setSize] = useState(() => pageSize(params.get("size") ?? ""));
  const [page, setPage] = useState(() => Math.max(1, Number(params.get("page")) || 1));
  const first = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };
  useEffect(() => {
    const p = new URLSearchParams();
    if (tab !== "list") p.set("tab", tab);
    if (brand !== "전체") p.set("brand", brand);
    if (keyword) p.set("q", keyword);
    if (sort !== "updated") p.set("sort", sort);
    if (!down) p.set("dir", "up");
    if (gapKey) p.set("gap", gapKey);
    if (gapSort !== "gaps") p.set("gsort", gapSort);
    if (!gapDown) p.set("gdir", "up");
    if (size !== PAGE_SIZES[0]) p.set("size", String(size));
    if (page > 1) p.set("page", String(page));
    setParams(p, { replace: true });
  }, [tab, brand, keyword, sort, down, gapKey, gapSort, gapDown, size, page, setParams]);
  const back = { back: location.pathname + location.search };   // 수정 · 등록 화면이 돌아올 주소
  const [busy, setBusy] = useState(false);
  const { setNotice, isDemoAdmin } = useAuth();

  const search = useDebounced(keyword.trim());

  // 서버가 거르고(브랜드 · 검색 — 홈과 같은 규칙, 빈 칸) 정렬하고 나눈 한 쪽. 탭마다 정렬은 따로(보완 필요는 기본 빈 칸 적은 순)
  const query = useMemo(() => {
    const p = new URLSearchParams({ tab, sort: tab === "gaps" ? gapSort : sort, dir: (tab === "gaps" ? gapDown : down) ? "down" : "up", page: String(page), size: String(size) });
    if (brand !== "전체") p.set("brand", brand);
    if (search) p.set("search", search);
    if (tab === "gaps" && gapKey) p.set("gap", gapKey);
    return p.toString();
  }, [tab, sort, down, gapSort, gapDown, gapKey, brand, search, page, size]);

  useEffect(() => {
    const ctrl = new AbortController();
    apiFetch(`/admin/shoes?${query}`, { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`admin/shoes ${res.status}`))))
      .then((d: AdminShoePage) => {
        // 숨기기 · 영구 삭제로 줄어 이 쪽이 비면 마지막 쪽으로
        const last = Math.max(1, Math.ceil(d.total / d.size));
        if (d.items.length === 0 && d.page > last) setPage(last);
        else setData({ ...d, tab });
      })
      .catch((e) => {
        if (e.name !== "AbortError") console.error(e);
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tab 은 query 에 들어 있다(받은 쪽이 어느 탭 것인지 적어 두려고만 쓴다)
  }, [query, reload]);

  // 브랜드 칩은 검색 결과와 상관없이 전부 — 이름만(/api/brands). 리뷰 요약 건수
  useEffect(() => {
    fetch(`${API}/brands`)
      .then((res) => res.json())
      .then(setBrands);
    apiFetch("/admin/summaries")
      .then((res) => (res.ok ? res.json() : null))
      .then(setSummaries)
      .catch(() => setSummaries(null));
  }, [reload]);

  const getShoes = () => setReload((n) => n + 1);
  const counts = data?.counts;
  // 탭을 바꾼 직후에는 앞 탭의 쪽이 남아 있다 — 모양이 달라(영구 삭제 기록) 이 탭 것만 그린다
  const loaded = data?.tab === tab;
  const items = loaded ? data.items : [];
  const pickSort = (key: SortKey) => {
    setPage(1);
    if (key === sort) setDown((d) => !d);
    else {
      setSort(key);
      setDown(true);
    }
  };
  const pickGapSort = (key: SortKey) => {
    setPage(1);
    if (key === gapSort) setGapDown((d) => !d);
    else {
      setGapSort(key);
      setGapDown(true);
    }
  };
  const sortBar = tab === "gaps" ? { list: GAP_SORTS, key: gapSort, down: gapDown, pick: pickGapSort } : { list: SORTS, key: sort, down, pick: pickSort };

  // 숨김(V8, 화면 이름도 "숨김" — 2026-11-01) — 리뷰 · 찜은 남고 신발과 함께 화면에서 빠진다. admin 만(서버 403 — 데모 관리자는 그 문구)
  const removeShoe = async () => {
    if (!target) return;
    setBusy(true);
    const res = await apiFetch(`/shoes/${target.id}`, { method: "DELETE" });
    setBusy(false);
    const blocked = await demoBlocked(res);
    if (blocked) setNotice(blocked);
    else if (!res.ok) alert(res.status === 403 ? "관리자만 숨길 수 있어요." : "숨기지 못했어요. 잠시 뒤 다시 해 주세요.");
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

  // 영구 삭제(V11) — 숨긴 신발만. 리뷰 · 찜도 DB 에서 지워진다. 카탈로그가 다시 넣지 않게 pull-admin 이 제외로 옮긴다
  const purgeShoe = async () => {
    if (!purgeTarget) return;
    setBusy(true);
    const res = await apiFetch(`/admin/shoes/${purgeTarget.id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    const blocked = res && (await demoBlocked(res));
    if (blocked) setNotice(blocked);
    else if (!res?.ok) alert("영구 삭제하지 못했어요. 잠시 뒤 다시 해 주세요.");
    else setNotice(`'${purgeTarget.model}'을(를) 영구 삭제했어요.`);
    setPurgeTarget(null);
    getShoes();
  };

  // 데모 관리자 — 화면은 다 보이고, 누르면 서버가 막는다(새 등록 폼도 열어 볼 수 있다)

  return (
    <div className="admin">
      <div className="admin__head">
        <h2 className="admin__title">
          신발 관리
          {isDemoAdmin && <span className="admin__demo">데모 관리자 · 보기 전용</span>}
        </h2>
        {summaries && (
          <p className="admin__summaries" title="리뷰 요약은 매일 03:30(KST) 배치가 다시 만든다 — 리뷰 수 ±10% · 평균 별점 ±0.3 · 30일">
            리뷰 요약 {summaries.generated}켤레 · 다시 만들 것 <strong>{summaries.stale}</strong>
            {summaries.pending > 0 && ` (아직 없음 ${summaries.pending})`}
          </p>
        )}
      </div>

      <div className="admin__brands">
        {["전체", ...brands].map((b) => (
          <button
            key={b}
            className={`admin__brand ${brand === b ? "is-active" : ""}`}
            onClick={() => first(setBrand)(b)}
          >
            {b}
          </button>
        ))}
      </div>

      <div className="admin__tools">
        <div className="admin__search">
          <SearchBox value={keyword} onChange={first(setKeyword)} />
        </div>

        <div className="admin__sorts">
          {sortBar.list.map((s) => (
            <button
              key={s.key}
              className={`admin__sort ${sortBar.key === s.key ? "is-active" : ""}`}
              onClick={() => sortBar.pick(s.key)}
              aria-pressed={sortBar.key === s.key}
            >
              {s.label}
              {sortBar.key === s.key && <span className="admin__sortdir" aria-label={sortBar.down ? "내림차순" : "오름차순"}>{sortBar.down ? "↓" : "↑"}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="admin__countbar">
        {/* 개수 오른쪽에 몇 개씩 보기 — 관리자 페이지와 같은 칸(adminmy/parts SizeChoice) */}
        <div className="adminmy__countbar admin__countmain">
          <p className="admin__count">
            {!counts ? "" : tab === "list" ? `${counts.list}개 / 전체 ${counts.all}개` : tab === "hidden" ? `숨긴 신발 ${counts.hidden}개` : tab === "purged" ? `영구 삭제한 신발 ${counts.purged}개` : `보완 필요 ${loaded ? data.total : counts.gaps}개 / 전체 ${counts.list}개`}
          </p>
          <SizeChoice size={size} onChange={(v) => first(setSize)(pageSize(v))} />
        </div>
        <div className="admin__tabs" role="tablist" aria-label="목록">
          <button role="tab" aria-selected={tab === "list"} className={`admin__tab ${tab === "list" ? "is-active" : ""}`} onClick={() => first(setTab)("list")}>
            등록된 신발 {counts?.list ?? ""}
          </button>
          <button role="tab" aria-selected={tab === "hidden"} className={`admin__tab ${tab === "hidden" ? "is-active" : ""}`} onClick={() => first(setTab)("hidden")}>
            숨긴 신발 {counts?.hidden ?? ""}
          </button>
          <button role="tab" aria-selected={tab === "gaps"} className={`admin__tab admin__tab--gaps ${tab === "gaps" ? "is-active" : ""}`} onClick={() => first(setTab)("gaps")}>
            보완 필요 {counts?.gaps ?? ""}
          </button>
          <button role="tab" aria-selected={tab === "purged"} className={`admin__tab ${tab === "purged" ? "is-active" : ""}`} onClick={() => first(setTab)("purged")}>
            영구 삭제 기록 {counts?.purged ?? ""}
          </button>
        </div>
        {/* 새 등록 — 탭 줄 오른쪽, 탭 묶음과 띄운다(성격이 다른 버튼, 2026-11-01 사용자) */}
        <button className="admin__new" onClick={() => navigate("/new", { state: back })}>
          + 새 러닝화 등록
        </button>
      </div>

      {tab === "list" && (
      <ul className="admin__list">
        {loaded && items.length === 0 && (
          <li className="admin__empty">조건에 맞는 러닝화가 없습니다.</li>
        )}

        {items.map((shoe) => {
          const change = changeOf(shoe);
          return (
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

            {/* 마지막 수정 — 바뀐 칸(2개까지 · 외 N건, 올리면 전체) · 날짜. 고친 적 없으면 빈 칸 */}
            <span className="admin__change" title={change ? `${change.all} — ${change.at}` : undefined}>
              {change && (
                <>
                  <span className="admin__changewhat">{change.text}</span>
                  <span className="admin__changeat">{change.at}</span>
                </>
              )}
            </span>

            <div className="admin__actions">
              <Link className="admin__edit" to={`/edit/${shoe.id}`} state={back}>
                수정
              </Link>
              <button className="admin__delete" onClick={() => setTarget(shoe)}>
                숨김
              </button>
            </div>
          </li>
          );
        })}
      </ul>
      )}

      {tab === "gaps" && (
        <>
          {/* 칸 하나씩 — 고른 것은 코랄. 0 인 칸은 감춘다 */}
          <div className="admin__gapfilters" role="group" aria-label="빈 칸 필터">
            <button className={`admin__gapfilter ${gapKey === null ? "is-active" : ""}`} onClick={() => first(setGapKey)(null)} aria-pressed={gapKey === null}>
              전체 {counts?.gaps ?? ""}
            </button>
            {GAPS.filter((g) => (data?.gapCounts[g.key] ?? 0) > 0).map((g) => (
              <button key={g.key} className={`admin__gapfilter ${gapKey === g.key ? "is-active" : ""}`} onClick={() => first(setGapKey)(g.key)} aria-pressed={gapKey === g.key}>
                {g.label} {data?.gapCounts[g.key]}
              </button>
            ))}
          </div>
          <ul className="admin__list">
            {loaded && items.length === 0 && <li className="admin__empty">비어 있는 칸이 없습니다.</li>}
            {items.map((shoe) => {
              const gaps = [...(shoe.gaps ?? [])].sort((a, b) => Number(b === gapKey) - Number(a === gapKey));   // 고른 칸을 앞에
              const names = gaps.map((g) => GAP_LABEL[g] ?? g);
              const text = names.length > 3 ? `${names.slice(0, 3).join(", ")} 외 ${names.length - 3}건` : names.join(", ");
              return (
                <li key={shoe.id}>
                  {/* 줄 전체가 수정 화면으로 — 링크라 새 탭으로도 열린다 */}
                  <Link className="admin__row admin__row--gap" to={`/edit/${shoe.id}`} state={back}>
                    <div className="admin__thumb">
                      <ShoeImage src={shoe.image} alt={shoe.model} />
                    </div>
                    <span className="admin__no">NO.{String(shoe.id).padStart(2, "0")}</span>
                    <div className="admin__names">
                      <span className="admin__model">{shoe.model}</span>
                      <span className="admin__brandname">{shoe.brand}</span>
                    </div>
                    <span className="admin__gaps" title={`비어 있음: ${names.join(", ")}`}>
                      비어 있음: <strong>{text}</strong>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {tab === "hidden" && (
          <ul className="admin__list">
            {loaded && items.length === 0 && <li className="admin__empty">숨긴 신발이 없습니다.</li>}
            {items.map((shoe) => (
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
                  <button className="admin__delete" onClick={() => setPurgeTarget(shoe)}>
                    영구 삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
      )}

      {tab === "purged" && (
        <>
          <p className="admin__missnote">영구 삭제한 신발이에요. 리뷰 · 찜은 함께 지워졌고, 카탈로그를 다시 적재해도 들어오지 않아요(적재기가 이 기록을 읽어 뺀다). 되살릴 수 없어요.</p>
          <ul className="admin__list">
            {loaded && items.length === 0 && <li className="admin__empty">영구 삭제한 신발이 없습니다.</li>}
            {items.map((p) => (
              <li className="admin__row is-hidden" key={`${p.id}:${p.purgedAt}`}>
                <span className="admin__no">NO.{String(p.id).padStart(2, "0")}</span>
                <span className="admin__purpose">리뷰 {p.reviews} · 찜 {p.likes}</span>
                <div className="admin__names">
                  <span className="admin__model">{p.model}</span>
                  <span className="admin__brandname">
                    {p.brand}
                    {p.lineKey && ` · ${p.lineKey}${p.generation != null ? ` ${p.generation}세대` : ""}${p.gender ? ` · ${GENDER[p.gender] ?? p.gender}` : ""}`}
                  </span>
                </div>
                <span className="admin__changeat">{p.purgedAt.slice(0, 10)} 영구 삭제</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {loaded && <Pager page={data.page} size={data.size} total={data.total} onPage={setPage} />}

      {target && <HideShoeConfirm shoe={target} busy={busy} onConfirm={removeShoe} onCancel={() => setTarget(null)} />}
      {purgeTarget && (
        <ConfirmModal
          message={`'${purgeTarget.model}'을(를) 영구 삭제할까요?`}
          detail={
            <>
              <p>
                리뷰 <strong>{purgeTarget.reviewCount}개</strong> · 찜 <strong>{purgeTarget.likeCount}개</strong>가 함께 삭제됩니다.
              </p>
              <p>되돌릴 수 없어요. 다음 카탈로그 적재에서도 다시 들어오지 않습니다.</p>
            </>
          }
          confirmLabel="영구 삭제"
          busy={busy}
          onConfirm={purgeShoe}
          onCancel={() => setPurgeTarget(null)}
        />
      )}
    </div>
  );
}

export default Admin;
