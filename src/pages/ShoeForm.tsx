import { apiFetch } from "../auth/session";
import { useState, useEffect, type ChangeEvent, type ReactNode } from "react";
import { useParams, useNavigate } from "react-router-dom";
import type { Shoe, SourceCode, SpecField, SpecSources } from "../types";
import { asset } from "../api";
import { useDebounced } from "../useDebounced";
import { useAuth } from "../auth/useAuth";
import { demoBlocked, serverMessage } from "../auth/demoAdmin";
import HideShoeConfirm from "../components/HideShoeConfirm";
import "./ShoeForm.css";

const PURPOSES = ["조깅·회복주", "템포·인터벌", "LSD·장거리", "레이스", "트레일"];
const STABILITIES = ["중립화", "안정화"];
const WIDTHS = ["좁음", "보통", "넓음"];
// 중량 기준 사이즈 — 운영 값이 정확히 이 다섯 + 불명(NULL)이다(docs/ADMIN_DEMO_DESIGN.md 2.1)
const WEIGHT_SIZES = ["M9", "M9.5", "M10", "M10.5", "M8.5"];
const GENDERS: [string, string][] = [["men", "남성"], ["women", "여성"], ["unisex", "공용"]];
// 스펙 출처 — 고를 수 있는 것. DB · SX 는 기존 값에만 회색으로 보인다(고를 수 없다)
const CODES: [SourceCode, string][] = [["BITR", "BITR"], ["RSG", "RSG"], ["STORE", "STORE(국내 공식몰)"], ["PR", "PR(보도자료)"], ["WEB", "WEB(웹 문서)"], ["MAN", "MAN(직접 확인)"]];
const LEGACY_CODES: Record<string, string> = { DB: "DB(기존 값)", SX: "SX(StockX)" };
// 가격 출처 — 종류는 늘 '발매가'(2026-10-30 '정가'에서 통일). 기존 '다나와'는 회색으로만
const PRICE_SOURCES = ["공식몰", "ABC마트", "크림"];
// 추가 이미지 — 칸 하나에 주소 하나, 6개까지(서버도 400)
const MAX_IMAGES = 6;

// 숫자 칸 — type="number" 는 e · + · − 가 들어가고 휠로 값이 바뀐다(설계 3절). 붙여 넣기도 같은 검사
const DECIMAL = /^\d{0,3}(\.\d?)?$/;
const INTEGER = /^\d{0,7}$/;
const GENERATION = /^\d{0,3}$/;

type Tri = "" | "true" | "false";   // 있음 · 없음 · 정보 없음("")
const triOf = (v: boolean | null | undefined): Tri => (v === true ? "true" : v === false ? "false" : "");
const triValue = (t: Tri) => (t === "" ? null : t === "true");

interface Source {
  code: SourceCode | "";
  url: string;
}
const NO_SOURCE: Source = { code: "", url: "" };
const SPEC_FIELDS: SpecField[] = ["weight", "drop", "stackHeight", "midsole", "width", "wideAvailable"];
const LABEL: Record<SpecField, string> = { weight: "중량", drop: "드롭", stackHeight: "스택하이트", midsole: "미드솔", width: "발볼", wideAvailable: "와이드 모델" };

const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });

/** 이미지 주소 옆 썸네일 — 0.5초 멈추면 다시 불러온다. 못 불러오면 빨간 테두리 + "불러오지 못함" */
function Thumb({ src }: { src: string }) {
  const url = useDebounced(src.trim(), 500);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!url) return <span className="form__thumb is-empty" aria-hidden="true" />;
  if (failedUrl === url) return <span className="form__thumb is-failed">불러오지 못함</span>;
  return (
    <span className="form__thumb">
      <img src={asset(url)} alt="" onError={() => setFailedUrl(url)} />
    </span>
  );
}

/** 출처 드롭다운 — WEB · MAN 을 고르면 주소 칸이 나온다(WEB 은 필수) */
function SourcePicker({ id, value, onChange }: { id: string; value: Source; onChange: (s: Source) => void }) {
  const legacy = value.code && LEGACY_CODES[value.code];
  return (
    <div className="form__source">
      <select
        aria-label="출처"
        id={id}
        className={legacy ? "is-legacy" : ""}
        value={value.code}
        onChange={(e) => onChange({ code: e.target.value as SourceCode | "", url: ["WEB", "MAN"].includes(e.target.value) ? value.url : "" })}
      >
        <option value="">출처 없음</option>
        {legacy && (
          <option value={value.code} disabled>
            {legacy}
          </option>
        )}
        {CODES.map(([c, label]) => (
          <option key={c} value={c}>
            {label}
          </option>
        ))}
      </select>
      {(value.code === "WEB" || value.code === "MAN") && (
        <input
          className="form__url"
          aria-label="출처 주소"
          inputMode="url"
          value={value.url}
          onChange={(e) => onChange({ ...value, url: e.target.value })}
          placeholder={value.code === "WEB" ? "https://… (필수)" : "https://… (본 화면 주소, 선택)"}
        />
      )}
    </div>
  );
}

/** 한 줄 — 칸 이름 · 값 · (출처). 상세 모달과 같은 용어 */
function Row({ label, htmlFor, children, source }: { label: string; htmlFor: string; children: ReactNode; source?: ReactNode }) {
  return (
    <div className="form__row">
      <label className="form__rowlabel" htmlFor={htmlFor}>
        {label}
      </label>
      <div className="form__rowvalue">{children}</div>
      <div className="form__rowsource">{source}</div>
    </div>
  );
}

function ShoeForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);
  const { setNotice, isDemoAdmin } = useAuth();

  const [loaded, setLoaded] = useState<Shoe | null>(null);
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [purpose, setPurpose] = useState(PURPOSES[0]);
  const [stability, setStability] = useState(STABILITIES[0]);
  const [lineKey, setLineKey] = useState("");
  const [generation, setGeneration] = useState("");
  const [isCurrent, setIsCurrent] = useState(true);
  const [gender, setGender] = useState("men");
  const [midsole, setMidsole] = useState("");
  const [weight, setWeight] = useState("");
  const [weightSize, setWeightSize] = useState("");
  const [drop, setDrop] = useState("");
  const [stackHeight, setStackHeight] = useState("");
  const [width, setWidth] = useState("");
  const [wide, setWide] = useState<Tri>("");
  const [carbon, setCarbon] = useState<Tri>("");
  const [price, setPrice] = useState("");
  const [priceCheckedAt, setPriceCheckedAt] = useState("");
  const [priceSource, setPriceSource] = useState("");
  const [sources, setSources] = useState<Record<SpecField, Source>>(() => Object.fromEntries(SPEC_FIELDS.map((f) => [f, NO_SOURCE])) as Record<SpecField, Source>);
  const [image, setImage] = useState("");
  const [imageDraft, setImageDraft] = useState("");   // 대표 이미지 칸 — "등록"을 누르면 image 가 되고 썸네일이 바뀐다
  const [images, setImages] = useState<string[]>([""]);
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    apiFetch(`/shoes/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((shoe: Shoe) => {
        setLoaded(shoe);
        setBrand(shoe.brand);
        setModel(shoe.model);
        setPurpose(shoe.purpose);
        setStability(shoe.stability);
        setLineKey(shoe.lineKey ?? "");
        setGeneration(shoe.generation == null ? "" : String(shoe.generation));
        setIsCurrent(Boolean(shoe.isCurrent));
        setGender(shoe.gender ?? "");
        setMidsole(shoe.midsole ?? "");
        setWeight(shoe.weight == null ? "" : String(shoe.weight));
        setWeightSize(shoe.weightSize ?? "");
        setDrop(shoe.drop == null ? "" : String(shoe.drop));
        setStackHeight(shoe.stackHeight == null ? "" : String(shoe.stackHeight));
        setWidth(shoe.width ?? "");
        setWide(triOf(shoe.wideAvailable));
        setCarbon(triOf(shoe.carbon));
        setPrice(shoe.price == null ? "" : String(shoe.price));
        setPriceCheckedAt(shoe.priceCheckedAt ?? "");
        setPriceSource(shoe.priceSource ?? "");
        const ss: SpecSources = shoe.specSources ?? {};
        setSources(Object.fromEntries(SPEC_FIELDS.map((f) => [f, ss[f] ? { code: ss[f]!.code, url: ss[f]!.url ?? "" } : NO_SOURCE])) as Record<SpecField, Source>);
        setImage(shoe.image ?? "");
        setImageDraft(shoe.image ?? "");
        setImages(shoe.images?.length ? shoe.images.slice(0, MAX_IMAGES) : [""]);
        setSummary(shoe.summary ?? "");
        setDescription(shoe.description ?? "");
      })
      .catch(() => setError("신발을 불러오지 못했어요."));
  }, [id, isEdit]);

  const setSource = (f: SpecField, s: Source) => setSources((prev) => ({ ...prev, [f]: s }));
  // 값을 바꾸면 그 칸의 출처를 다시 고르게 한다 — 옛 출처가 새 값에 붙지 않게. 값을 비우면 출처도 비운다(설계 2.2)
  const changeSpec = (f: SpecField, set: (v: string) => void, v: string) => {
    set(v);
    setSource(f, NO_SOURCE);
    setError(null);
  };
  const numeric = (re: RegExp, f: SpecField | null, set: (v: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.trim();
    if (!re.test(v)) return;
    if (f) changeSpec(f, set, v);
    else set(v);
  };
  // 가격을 바꾸면 확인한 날 · 출처도 다시(옛 "ABC마트 2026/10/28 기준"이 다른 값에 붙지 않게)
  const changePrice = (e: ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value.trim();
    if (!INTEGER.test(v)) return;
    setPrice(v);
    setPriceSource("");
    setPriceCheckedAt(v ? today() : "");
    setError(null);
  };

  const imageLines = images.map((x) => x.trim()).filter(Boolean);
  const toNumber = (v: string) => (v.trim() === "" ? null : Number(v));
  const specValue: Record<SpecField, unknown> = {
    weight: toNumber(weight), drop: toNumber(drop), stackHeight: toNumber(stackHeight),
    midsole: midsole.trim() || null, width: width || null, wideAvailable: triValue(wide),
  };

  /** 저장 전 검사 — 화면 문구. 출처 형식은 서버도 400 을 낸다. 와이드 "없음"의 출처는 여기서만 본다(서버가 막으면 json-server 계약이 깨진다) */
  const check = (): string | null => {
    if (!brand.trim() || !model.trim()) return "브랜드와 모델명은 필수입니다.";
    if (wide === "false" && !sources.wideAvailable.code) return '와이드 모델 "없음"은 근거가 있을 때만 — 출처를 고르거나 "정보 없음"으로 두세요.';
    for (const f of SPEC_FIELDS) {
      const s = sources[f];
      if (s.code === "WEB" && !/^https?:\/\/\S+$/.test(s.url.trim())) return `${LABEL[f]} 출처가 WEB 이면 주소(https://…)를 넣어 주세요.`;
      if (s.code === "MAN" && s.url.trim() && !/^https?:\/\/\S+$/.test(s.url.trim())) return `${LABEL[f]} 출처 주소는 https:// 로 시작해야 해요.`;
      const was = loaded?.specSources?.[f]?.code;
      if (was && LEGACY_CODES[was] && !s.code && specValue[f] !== null) return `${LABEL[f]} 값을 바꿨어요 — 새 출처를 골라 주세요(${LEGACY_CODES[was]}는 고를 수 없어요).`;
    }
    if (price && priceSource && !priceCheckedAt) return "가격을 확인한 날을 넣어 주세요.";
    if (lineKey.trim() && !/^[a-z0-9-]+:[a-z0-9-]+$/.test(lineKey.trim())) return "라인키는 브랜드:라인 모양이에요(예: asics:gel-kayano).";
    return null;
  };

  const buildBody = () => {
    const specSources: SpecSources = {};
    for (const f of SPEC_FIELDS) {
      const s = sources[f];
      if (!s.code || specValue[f] === null) continue;   // 값이 없으면 출처도 없다
      specSources[f] = s.url.trim() ? { code: s.code, url: s.url.trim() } : { code: s.code };
    }
    const hasPriceSource = Boolean(price && priceSource);
    return {
      brand: brand.trim(),
      model: model.trim(),
      purpose,
      stability,
      lineKey: lineKey.trim() || null,
      generation: generation === "" ? null : Number(generation),
      isCurrent,
      gender: gender || null,
      midsole: specValue.midsole,
      weight: specValue.weight,
      weightSize: specValue.weight === null ? null : weightSize || null,
      drop: specValue.drop,
      stackHeight: specValue.stackHeight,
      width: specValue.width,
      wideAvailable: specValue.wideAvailable,
      carbon: triValue(carbon),
      price: toNumber(price),
      priceSource: hasPriceSource ? priceSource : null,
      priceCheckedAt: hasPriceSource ? priceCheckedAt || null : null,
      priceKind: hasPriceSource ? "발매가" : null,   // 종류는 늘 발매가(2026-10-30 — 크림 발매가 · 공식몰 · ABC마트)
      specSources: Object.keys(specSources).length ? specSources : null,
      image: imageDraft.trim(),   // 등록을 누르지 않고 저장해도 칸에 적힌 주소를 쓴다
      images: imageLines,
      summary,
      description,
    };
  };

  /** 실패 응답 → 화면 문구. 데모 관리자는 서버 문구를 그대로 */
  const failure = async (res: Response) => {
    const blocked = await demoBlocked(res);
    if (blocked) return blocked;
    if (res.status === 403) return "관리자만 저장할 수 있어요.";
    if (res.status === 401) return "로그인이 끝났어요. 다시 로그인해 주세요.";
    const msg = await serverMessage(res);   // 스펙 출처 형식 · 와이드 없음 · 숨긴 세대 — 서버 문구
    if (msg) return msg;
    if (res.status === 409) return "같은 라인키 · 세대 · 성별의 신발이 이미 있어요.";
    return "저장하지 못했어요. 입력을 확인해 주세요.";
  };

  const save = async () => {
    const err = check();
    if (err) return setError(err);
    setBusy(true);
    const res = await apiFetch(isEdit ? `/shoes/${id}` : "/shoes", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody()),
    }).catch(() => null);
    setBusy(false);
    if (!res) return setError("서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.");
    if (!res.ok) {
      const msg = await failure(res);
      if (isDemoAdmin) setNotice(msg);
      return setError(msg);
    }
    setNotice(isEdit ? "수정했어요." : "등록했어요.");
    navigate("/admin");
  };

  // 삭제 = 숨김(V8) — 리뷰 · 찜은 남는다
  const remove = async () => {
    setBusy(true);
    const res = await apiFetch(`/shoes/${id}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    setConfirmOpen(false);
    if (!res) return setError("서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요.");
    if (!res.ok) {
      const msg = await failure(res);
      setNotice(msg);
      return setError(msg);
    }
    setNotice(`'${model}'을(를) 숨겼어요. 숨긴 신발에서 되살릴 수 있어요.`);
    navigate("/admin");
  };

  const setImageAt = (i: number, v: string) => setImages((list) => list.map((x, j) => (j === i ? v : x)));
  const removeImageAt = (i: number) => setImages((list) => (list.length === 1 ? [""] : list.filter((_, j) => j !== i)));
  const legacyPrice = priceSource && !PRICE_SOURCES.includes(priceSource);

  return (
    <div className="form">
      <h2 className="form__title">
        {isEdit ? "러닝화 수정" : "러닝화 등록"}
        {isDemoAdmin && <span className="form__demo">데모 관리자 · 저장되지 않아요</span>}
      </h2>

      <h3 className="form__section">기본</h3>
      <div className="form__grid">
        <label className="form__field">
          <span>브랜드</span>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} />
        </label>
        <label className="form__field">
          <span>모델명</span>
          <input value={model} onChange={(e) => setModel(e.target.value)} />
        </label>
        <label className="form__field">
          <span>용도</span>
          <select value={purpose} onChange={(e) => setPurpose(e.target.value)}>
            {PURPOSES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="form__field">
          <span>안정성</span>
          <select value={stability} onChange={(e) => setStability(e.target.value)}>
            {STABILITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h3 className="form__section">세대</h3>
      <div className="form__gen">
        <label className="form__field form__field--linekey">
          <span>라인키</span>
          <input value={lineKey} onChange={(e) => setLineKey(e.target.value)} placeholder="asics:gel-kayano" spellCheck={false} />
        </label>
        <label className="form__field form__field--short">
          <span>세대</span>
          <input inputMode="numeric" value={generation} onChange={(e) => GENERATION.test(e.target.value.trim()) && setGeneration(e.target.value.trim())} />
        </label>
        <label className="form__check">
          <input type="checkbox" checked={isCurrent} onChange={(e) => setIsCurrent(e.target.checked)} />
          현행
        </label>
        <label className="form__field form__field--short">
          <span>성별</span>
          <select value={gender} onChange={(e) => setGender(e.target.value)}>
            <option value="">정보 없음</option>
            {GENDERS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <h3 className="form__section">스펙</h3>
      <div className="form__rows">
        <Row label="중량" htmlFor="f-weight" source={<SourcePicker id="s-weight" value={sources.weight} onChange={(s) => setSource("weight", s)} />}>
          <span className="form__unit">
            <input id="f-weight" inputMode="decimal" value={weight} onChange={numeric(DECIMAL, "weight", setWeight)} />
            <em>g</em>
          </span>
          <select aria-label="중량 기준 사이즈" className="form__size" value={weightSize} onChange={(e) => { setWeightSize(e.target.value); setSource("weight", NO_SOURCE); }}>
            {WEIGHT_SIZES.map((s) => (
              <option key={s} value={s}>
                US {s}
              </option>
            ))}
            <option value="">불명</option>
          </select>
        </Row>
        <Row label="드롭" htmlFor="f-drop" source={<SourcePicker id="s-drop" value={sources.drop} onChange={(s) => setSource("drop", s)} />}>
          <span className="form__unit">
            <input id="f-drop" inputMode="decimal" value={drop} onChange={numeric(DECIMAL, "drop", setDrop)} />
            <em>mm</em>
          </span>
        </Row>
        <Row label="스택하이트" htmlFor="f-stack" source={<SourcePicker id="s-stack" value={sources.stackHeight} onChange={(s) => setSource("stackHeight", s)} />}>
          <span className="form__unit">
            <input id="f-stack" inputMode="decimal" value={stackHeight} onChange={numeric(DECIMAL, "stackHeight", setStackHeight)} />
            <em>mm</em>
          </span>
        </Row>
        <Row label="미드솔" htmlFor="f-midsole" source={<SourcePicker id="s-midsole" value={sources.midsole} onChange={(s) => setSource("midsole", s)} />}>
          <input id="f-midsole" className="form__text" value={midsole} onChange={(e) => changeSpec("midsole", setMidsole, e.target.value)} placeholder="모르면 비워 두세요" />
        </Row>
        <Row label="발볼" htmlFor="f-width" source={<SourcePicker id="s-width" value={sources.width} onChange={(s) => setSource("width", s)} />}>
          <select id="f-width" value={width} onChange={(e) => changeSpec("width", setWidth, e.target.value)}>
            {WIDTHS.map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
            <option value="">정보 없음</option>
          </select>
        </Row>
        <Row label="와이드 모델" htmlFor="f-wide" source={<SourcePicker id="s-wide" value={sources.wideAvailable} onChange={(s) => setSource("wideAvailable", s)} />}>
          <select id="f-wide" value={wide} onChange={(e) => changeSpec("wideAvailable", (v) => setWide(v as Tri), e.target.value)}>
            <option value="true">있음</option>
            <option value="false">없음</option>
            <option value="">정보 없음</option>
          </select>
          {wide === "false" && !sources.wideAvailable.code && <span className="form__need">없음은 출처가 필요해요</span>}
        </Row>
        <Row label="카본 플레이트" htmlFor="f-carbon">
          <select id="f-carbon" value={carbon} onChange={(e) => setCarbon(e.target.value as Tri)}>
            <option value="true">있음</option>
            <option value="false">없음</option>
            <option value="">정보 없음</option>
          </select>
          <span className="form__exempt">출처 면제</span>
        </Row>
        <Row
          label="가격"
          htmlFor="f-price"
          source={
            <div className="form__source">
              <select aria-label="가격 출처" className={legacyPrice ? "is-legacy" : ""} value={priceSource} onChange={(e) => setPriceSource(e.target.value)} disabled={!price}>
                <option value="">출처 없음</option>
                {legacyPrice && (
                  <option value={priceSource} disabled>
                    {priceSource}(기존 값)
                  </option>
                )}
                {PRICE_SOURCES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          <span className="form__unit">
            <input id="f-price" inputMode="numeric" value={price} onChange={changePrice} />
            <em>원</em>
          </span>
          <input aria-label="확인한 날" className="form__date" type="date" value={priceCheckedAt} onChange={(e) => setPriceCheckedAt(e.target.value)} disabled={!price} />
          {price && <span className="form__hint">{Number(price).toLocaleString("ko-KR")}원{priceSource ? " · 발매가" : ""}</span>}
        </Row>
      </div>

      <h3 className="form__section">이미지</h3>
      <div className="form__grid">
        <div className="form__field form__field--wide">
          <label htmlFor="f-image">대표 이미지 경로</label>
          <div className="form__imgrow">
            <input id="f-image" value={imageDraft} onChange={(e) => setImageDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && setImage(imageDraft.trim())}
              placeholder="https://images.stockx.com/…" spellCheck={false} />
            <button type="button" className="form__imgbtn" onClick={() => setImage(imageDraft.trim())}>
              등록
            </button>
            <button type="button" className="form__imgbtn is-danger" onClick={() => { setImage(""); setImageDraft(""); }}>
              삭제
            </button>
          </div>
          {image && (
            <span className="form__thumbs">
              <Thumb src={image} />
            </span>
          )}
        </div>
        <div className="form__field form__field--wide">
          <span>추가 이미지 (최대 {MAX_IMAGES}개까지 추가 가능합니다)</span>
          {images.map((u, i) => (
            <div className="form__imgrow" key={i}>
              <input aria-label={`추가 이미지 ${i + 1}`} value={u} onChange={(e) => setImageAt(i, e.target.value)} placeholder="https://…" spellCheck={false} />
              <button type="button" className="form__imgbtn is-icon" onClick={() => removeImageAt(i)} aria-label={`추가 이미지 ${i + 1} 빼기`}>
                −
              </button>
            </div>
          ))}
          <button type="button" className="form__imgadd" onClick={() => setImages((list) => [...list, ""])} disabled={images.length >= MAX_IMAGES}>
            + 이미지 칸 추가{images.length >= MAX_IMAGES ? ` (${MAX_IMAGES}개까지)` : ""}
          </button>
          {imageLines.length > 0 && (
            <span className="form__thumbs">
              {imageLines.map((u, i) => (
                <Thumb key={`${i}:${u}`} src={u} />
              ))}
            </span>
          )}
        </div>
      </div>

      <h3 className="form__section">문구</h3>
      <div className="form__grid">
        <label className="form__field form__field--wide">
          <span>한 줄 요약</span>
          <input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="○○한 분에게" />
        </label>
        <label className="form__field form__field--wide">
          <span>상세 설명</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} />
        </label>
      </div>

      {error && (
        <p className="form__error" role="alert">
          {error}
        </p>
      )}

      <div className="form__actions">
        {isEdit && (
          <button className="form__delete" onClick={() => setConfirmOpen(true)}>
            삭제
          </button>
        )}
        <button className="form__cancel" onClick={() => navigate("/admin")}>
          취소
        </button>
        <button className="form__save" onClick={save} disabled={busy}>
          {busy ? "저장 중…" : isEdit ? "수정" : "등록"}
        </button>
        {confirmOpen && loaded && (
          <HideShoeConfirm shoe={loaded} busy={busy} onConfirm={remove} onCancel={() => setConfirmOpen(false)} />
        )}
      </div>
    </div>
  );
}

export default ShoeForm;
