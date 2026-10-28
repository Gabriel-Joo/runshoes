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
  // 정가 메타(V5) — 출처 · 읽은 날(YYYY-MM-DD) · 늘 "정가". 출처 기록이 없으면 null(화면은 가격만)
  priceSource?: "공식몰" | "ABC마트" | "다나와" | null;
  priceCheckedAt?: string | null;
  priceKind?: "정가" | null;
  image: string;
  images?: string[];
  summary: string;
  description: string;

  rating: number;
  reviewCount: number;
  likeCount: number;
  liked: boolean;
}

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
