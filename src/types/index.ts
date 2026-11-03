export interface Shoe {
  id: number;
  brand: string;
  model: string;

  purpose: string;
  stability: string;
  midsole: string | null;

  weight: number | null;
  drop: number | null;
  stackHeight: number | null;
  // 근거가 없으면 null — 화면은 "정보 없음"(칸을 숨기지 않는다). 기본값('보통' · false)으로 메우지 않는다
  width: string | null;
  wideAvailable: boolean | null;
  /** 와이드가 있을 때 어디에 나오나(V12) — domestic 국내 · overseas 해외에만. 없음 · 정보 없음 · 예전 값이면 null */
  wideScope?: "domestic" | "overseas" | null;
  carbon: boolean | null;

  price: number | null;
  // 가격 메타(V5) — 출처 · 읽은 날(YYYY-MM-DD) · 늘 "발매가"(2026-10-30 "정가"에서 통일). 출처 기록이 없으면 null(화면은 가격만)
  priceSource?: "공식몰" | "ABC마트" | "다나와" | "크림" | "MAN(직접 확인)" | null;
  priceCheckedAt?: string | null;
  priceKind?: "발매가" | null;
  image: string;
  images?: string[];
  summary: string;
  description: string;

  rating: number;
  reviewCount: number;
  likeCount: number;
  liked: boolean;

  // 세대 구조(V4) — 관리 화면이 보고 고친다
  lineKey?: string | null;
  generation?: number | null;
  isCurrent?: boolean | null;
  gender?: "men" | "women" | "unisex" | null;
  weightSize?: string | null;
  // 스펙 출처(V6) — 칸마다 {code, url?}. 카본은 출처 면제
  specSources?: SpecSources | null;
  // 숨긴 때(V8) — 관리 화면의 숨긴 신발 목록에만 온다
  deletedAt?: string;
  // V11 — 품번(모델 번호, 색상 코드 뺌 — 색상이 번호에 붙은 브랜드는 그대로) · 관리자가 마지막으로 고친 때 · 그때 바뀐 칸 이름(API 이름, created · hidden · restored 도). 고친 적 없으면 null
  sku?: string | null;
  /** 영어 이름(V13) — KicksDB 상품명(SX) 또는 line_en. 상세 모달의 브랜드 줄에 가운뎃점으로 */
  modelEn?: string | null;
  /** 검색용 다른 표기(V13) — 쉼표로 나눈다. 화면에 보이지 않는다 */
  modelAlias?: string | null;
  updatedAt?: string | null;
  lastChange?: string[] | null;
}

/** 스펙 출처 코드 — 화면에서 고르는 것(BITR … MAN)과 기존 값에만 보이는 것(DB · SX) */
export type SourceCode = "BITR" | "RSG" | "STORE" | "PR" | "WEB" | "MAN" | "DB" | "SX" | "NOTFOUND";   // NOTFOUND = 검색 결과 없음(와이드만)
export type SpecField = "weight" | "drop" | "stackHeight" | "midsole" | "width" | "wideAvailable";
export type SpecSources = Partial<Record<SpecField, { code: SourceCode; url?: string }>>;

export interface Review {
  id: number;
  shoeId: number;
  userId: number | null;        // 작성자(V3). author 는 그 사람의 닉네임
  author: string;
  rating: number;
  content: string;
  createdAt: string;
  likeCount?: number;
  liked?: boolean;              // 요청한 사람이 공감했는지
  reviewType: "FIRST" | "FOLLOWUP";
  parentReviewId: number | null;
  distanceKm: number | null;
  proofImageUrl: string | null;
  verified: boolean;
}

export interface Term {
  id: number;
  key: string;
  name: string;
  short: string;
  description: string;
}
