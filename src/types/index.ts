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
  width: string;
  wideAvailable: boolean;
  carbon: boolean;

  price: number | null;
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
