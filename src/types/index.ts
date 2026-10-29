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
  carbon: boolean | null;

  price: number | null;
  // 가격 메타(V5) — 출처 · 읽은 날(YYYY-MM-DD) · 늘 "발매가"(2026-10-30 "정가"에서 통일). 출처 기록이 없으면 null(화면은 가격만)
  priceSource?: "공식몰" | "ABC마트" | "다나와" | "크림" | null;
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
}

/** 스펙 출처 코드 — 화면에서 고르는 것(BITR … MAN)과 기존 값에만 보이는 것(DB · SX) */
export type SourceCode = "BITR" | "RSG" | "STORE" | "PR" | "WEB" | "MAN" | "DB" | "SX";
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
