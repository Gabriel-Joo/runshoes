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
  author: string;
  rating: number;
  content: string;
  createdAt: string;
}

export interface Term {
  id: number;
  key: string;
  name: string;
  short: string;
  description: string;
}