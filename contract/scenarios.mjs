// API 계약 시나리오 — Node(json-server) 기준선을 녹화하고, Spring 구현 뒤 같은 순서로 다시 돌려 diff 한다.
// docs/SPRING_MIGRATION_PLAN.md Phase 2 의 시나리오 1~14 를 그대로 펼쳤다(번호는 이 파일의 id, plan 은 계획서 번호).
//
// - 순서가 곧 상태다. 시드(db.json, sha256 0bccadd4…)에서 시작해 위에서부터 차례로 보낸다 — 앞의 쓰기가 뒤의 응답을 정한다
// - {{이름}} 은 앞 단계 capture 로 잡은 값(예: POST 로 생긴 id)
// - contract: false 는 기록만 하고 diff 에서 빼는 것(프런트가 쓰지 않는 json-server 동작 — 계획서 0장 "계약 이탈로 문서화")
// - 요약(summary)은 시드 신발이 전부 리뷰 3개 이상이라 부르면 Ollama(GPU)가 돈다. 운영 녹화에는 Ollama 를 부르지 않는 두 경우만 넣고
//   (없는 신발, 새로 만든 신발), 나머지는 SUMMARY_SCENARIOS 를 로컬 server.cjs + mock-ollama 로 녹화한다

const json = { "Content-Type": "application/json" };

// ShoeForm.tsx 의 POST 본문 모양 그대로(buildBody + rating/reviewCount/likeCount/liked)
const newShoe = {
  brand: "계약테스트",
  model: "Contract Runner 1",
  purpose: "조깅·회복주",
  stability: "중립화",
  midsole: "테스트폼",
  weight: 250,
  drop: 8,
  stackHeight: 38.5,
  width: "보통",
  wideAvailable: false,
  carbon: false,
  price: 159000,
  image: "/images/gel-kayano-32.png",
  images: ["/images/gel-kayano-32.png"],
  summary: "계약 테스트용 신발",
  description: "Spring 전환 응답 비교용으로 만든 항목이다.",
  rating: 0,
  reviewCount: 0,
  likeCount: 0,
  liked: false,
};

export const SCENARIOS = [
  // ---- 읽기 (plan 1~5, 13) ----
  { id: "01", plan: 1, name: "shoes 전체", method: "GET", path: "/api/shoes" },
  { id: "02", plan: 1, name: "reviews 전체", method: "GET", path: "/api/reviews" },
  { id: "03", plan: 1, name: "terms 전체(id 12 중복 포함)", method: "GET", path: "/api/terms" },
  { id: "04", plan: 2, name: "shoe 4 — midsole null 출력", method: "GET", path: "/api/shoes/4" },
  { id: "05", plan: 2, name: "없는 shoe → 404 {}", method: "GET", path: "/api/shoes/9999" },
  { id: "06", plan: 3, name: "없는 컬렉션 → 404 {}", method: "GET", path: "/api/foo" },
  { id: "07", plan: 3, name: "비숫자 id → 404 {}", method: "GET", path: "/api/shoes/abc" },
  { id: "08", plan: 4, name: "reviews?shoeId=3", method: "GET", path: "/api/reviews?shoeId=3" },
  { id: "09", plan: 4, name: "reviews?shoeId=9999 → []", method: "GET", path: "/api/reviews?shoeId=9999" },
  { id: "10", plan: 4, name: "reviews?shoeId=3&junk=1 — junk 무시", method: "GET", path: "/api/reviews?shoeId=3&junk=1" },
  { id: "11", plan: 5, name: "정렬 rating desc — 동점(4.6×6, 4.4×7) id 순", method: "GET", path: "/api/shoes?_sort=rating&_order=desc" },
  { id: "12", plan: 5, name: "정렬 reviewCount desc — 동점(5×16)", method: "GET", path: "/api/shoes?_sort=reviewCount&_order=desc" },
  { id: "13", plan: 5, name: "정렬 likeCount desc — 동점(55×2, 40×2)", method: "GET", path: "/api/shoes?_sort=likeCount&_order=desc" },
  { id: "14", plan: 5, name: "정렬 rating, _order 생략(asc)", method: "GET", path: "/api/shoes?_sort=rating" },
  { id: "15", plan: 5, name: "정렬 price asc — 동점 6쌍", method: "GET", path: "/api/shoes?_sort=price&_order=asc" },
  { id: "16", plan: 5, name: "정렬 weight desc", method: "GET", path: "/api/shoes?_sort=weight&_order=desc" },
  { id: "17", plan: 1, name: "review 1 — createdAt 날짜만(YYYY-MM-DD)", method: "GET", path: "/api/reviews/1" },
  { id: "18", plan: 1, name: "review 105 — createdAt 형식 확인", method: "GET", path: "/api/reviews/105" },
  { id: "19", plan: 13, name: "OPTIONS preflight", method: "OPTIONS", path: "/api/shoes",
    headers: { Origin: "https://example.com", "Access-Control-Request-Method": "PATCH", "Access-Control-Request-Headers": "content-type" } },
  { id: "20", plan: 14, name: "summary 없는 신발 → 리뷰<3 (Ollama 안 부름)", method: "GET", path: "/api/shoes/9999/summary" },
  { id: "21", name: "SPA index", method: "GET", path: "/" },
  { id: "22", name: "SPA 폴백 /best", method: "GET", path: "/best" },
  { id: "23", name: "SPA 폴백 /about(지운 페이지 — index.html, 앱이 NotFound)", method: "GET", path: "/about" },
  { id: "24", contract: false, name: "json-server 필드 필터 brand=호카(프런트 미사용)", method: "GET", path: "/api/shoes?brand=%ED%98%B8%EC%B9%B4" },
  { id: "25", contract: false, name: "json-server _limit(프런트 미사용, X-Total-Count)", method: "GET", path: "/api/reviews?_limit=2" },
  { id: "26", contract: false, name: "json-server /api/db(프런트 미사용)", method: "GET", path: "/api/db" },

  // ---- 쓰기 (plan 6~12) — 시드를 바꾼다. 녹화 뒤 db.json 을 되돌린다 ----
  { id: "30", plan: 6, name: "POST shoe(ShoeForm 모양) → 201 + Location, id 21", method: "POST", path: "/api/shoes",
    headers: json, body: newShoe, capture: { newShoe: "body.id" } },
  { id: "31", plan: 14, name: "summary 새 신발 → 리뷰<3 (Ollama 안 부름)", method: "GET", path: "/api/shoes/{{newShoe}}/summary" },
  { id: "32", plan: 7, name: "POST review(ReviewSection 모양, likeCount 없음, createdAt ms+Z)", method: "POST", path: "/api/reviews",
    headers: json, body: { shoeId: "{{newShoe:num}}", author: "계약러너", rating: 4, content: "계약 테스트 리뷰", createdAt: "2026-10-18T09:30:15.123Z" },
    capture: { newReview: "body.id" } },
  { id: "33", plan: 7, name: "GET 새 review — createdAt 그대로 돌아오는지", method: "GET", path: "/api/reviews/{{newReview}}" },
  { id: "34", plan: 8, name: "PATCH shoe 1 {liked, likeCount}(ShoeList 좋아요) — 나머지 불변", method: "PATCH", path: "/api/shoes/1",
    headers: json, body: { liked: true, likeCount: 999 } },
  { id: "35", plan: 9, name: "PATCH 새 shoe {midsole:null, price:null} — null 반영", method: "PATCH", path: "/api/shoes/{{newShoe}}",
    headers: json, body: { midsole: null, price: null } },
  { id: "36", plan: 9, name: "PATCH 새 shoe — ShoeForm 수정 본문 전체(빈 칸 null)", method: "PATCH", path: "/api/shoes/{{newShoe}}",
    headers: json, body: { ...newShoe, rating: undefined, reviewCount: undefined, likeCount: undefined, liked: undefined, midsole: null, weight: null, drop: null, stackHeight: null, price: null, model: "Contract Runner 1 수정" } },
  { id: "37", plan: 10, name: "PATCH review {rating, content}(리뷰 수정)", method: "PATCH", path: "/api/reviews/{{newReview}}",
    headers: json, body: { rating: 2, content: "수정한 계약 리뷰" } },
  { id: "38", plan: 10, name: "PATCH review 1 {liked, likeCount}(리뷰 공감)", method: "PATCH", path: "/api/reviews/1",
    headers: json, body: { liked: true, likeCount: 77 } },
  { id: "39", plan: 10, name: "PATCH 새 shoe {rating, reviewCount}(Best·Recommend 재계산)", method: "PATCH", path: "/api/shoes/{{newShoe}}",
    headers: json, body: { rating: 2, reviewCount: 1 } },
  { id: "40", plan: 10, name: "PATCH 없는 shoe → 404 {}", method: "PATCH", path: "/api/shoes/9999", headers: json, body: { liked: true } },
  { id: "41", plan: 10, name: "PATCH 없는 review → 404 {}", method: "PATCH", path: "/api/reviews/9999", headers: json, body: { rating: 1 } },
  { id: "42", name: "PUT 새 shoe 전체 치환(프런트 미사용, harness용)", method: "PUT", path: "/api/shoes/{{newShoe}}",
    headers: json, body: { ...newShoe, model: "Contract Runner PUT" } },
  { id: "43", name: "POST 없는 컬렉션 → 404", method: "POST", path: "/api/foo", headers: json, body: { a: 1 } },
  { id: "44", plan: 11, name: "DELETE 새 review → 200 + 지운 본문", method: "DELETE", path: "/api/reviews/{{newReview}}" },
  { id: "45", plan: 11, name: "DELETE 없는 review → 404 {}", method: "DELETE", path: "/api/reviews/9999" },
  { id: "46", plan: 12, name: "POST review 2건(cascade 준비) — 1", method: "POST", path: "/api/reviews",
    headers: json, body: { shoeId: "{{newShoe:num}}", author: "a", rating: 5, content: "c1", createdAt: "2026-10-18T09:31:00.000Z" } },
  { id: "47", plan: 12, name: "POST review 2건(cascade 준비) — 2", method: "POST", path: "/api/reviews",
    headers: json, body: { shoeId: "{{newShoe:num}}", author: "b", rating: 3, content: "c2", createdAt: "2026-10-18T09:32:00.000Z" } },
  { id: "48", plan: 12, name: "DELETE 새 shoe → 200 + 본문", method: "DELETE", path: "/api/shoes/{{newShoe}}" },
  { id: "49", plan: 12, name: "cascade — 새 shoe 의 reviews 가 남지 않았는지", method: "GET", path: "/api/reviews?shoeId={{newShoe}}" },
  { id: "50", plan: 12, name: "DELETE 없는 shoe → 404 {}", method: "DELETE", path: "/api/shoes/9999" },
  { id: "51", plan: 6, name: "POST 다시 → id 가 max+1 인지(지운 21 을 다시 쓰는지)", method: "POST", path: "/api/shoes",
    headers: json, body: { ...newShoe, model: "Contract Runner 2" }, capture: { newShoe2: "body.id" } },
  { id: "52", name: "끝 상태 — shoes 전체(shoe 1 likeCount 999 반영)", method: "GET", path: "/api/shoes" },
  { id: "53", name: "끝 상태 — reviews 전체(review 1 likeCount 77 반영)", method: "GET", path: "/api/reviews" },
];

// 로컬 전용 — server.cjs(같은 커밋) + mock-ollama. 운영에서 돌리면 GPU 를 쓴다
export const SUMMARY_SCENARIOS = [
  { id: "S1", plan: 14, name: "mock 호출 수 0으로", method: "POST", url: "{{mock}}/__reset", contract: false },
  { id: "S2", plan: 14, name: "summary shoe 1(리뷰≥3) → 정상 요약", method: "GET", path: "/api/shoes/1/summary" },
  { id: "S3", plan: 14, name: "summary shoe 1 다시 → 캐시", method: "GET", path: "/api/shoes/1/summary" },
  { id: "S4", plan: 14, name: "mock 호출 수 = 1(캐시 히트)", method: "GET", url: "{{mock}}/__calls", contract: false },
  { id: "S5", plan: 14, name: "리뷰 추가(개수 변경)", method: "POST", path: "/api/reviews", headers: json,
    body: { shoeId: 1, author: "s", rating: 5, content: "요약 캐시 무효화", createdAt: "2026-10-18T09:40:00.000Z" } },
  { id: "S6", plan: 14, name: "mock 을 500 으로", method: "POST", url: "{{mock}}/__fail", contract: false },
  { id: "S7", plan: 14, name: "summary shoe 1 → LLM 실패: summary null + reason", method: "GET", path: "/api/shoes/1/summary" },
  { id: "S8", plan: 14, name: "mock 호출 수 = 2(개수가 바뀌어 다시 불렀다)", method: "GET", url: "{{mock}}/__calls", contract: false },
  { id: "S9", plan: 14, name: "mock 프롬프트(마지막 호출) — 프롬프트 문구 기준선", method: "GET", url: "{{mock}}/__last", contract: false },
];

// 검색(search) — json-server 에 없던 것이라 Node 기준선이 없다. Spring 녹화(contract/baseline/spring-search)가 기준선이다.
// 전부 읽기(시드 상태). 규칙: shoes 의 brand · model 에서, 띄어쓰기로 나눈 낱말이 모두 있어야(AND), 대소문자 무시, 공백 빼고도 맞춘다.
// 홈은 purpose · liked · _sort 와, 등록·관리는 brand · _sort 와 같이 보낸다(ShoeList.tsx · Admin.tsx). id 가 Q 로 시작 — 운영 --read-only 에도 든다
const S = (id, name, path) => ({ id, name, method: "GET", path });
export const SEARCH_SCENARIOS = [
  S("Q01", "브랜드 — 나이키", "/api/shoes?search=나이키"),
  S("Q02", "모델명 — 페가수스", "/api/shoes?search=페가수스"),
  S("Q03", "낱말 AND, 브랜드+모델 — 아식스 젤", "/api/shoes?search=아식스%20젤"),
  S("Q04", "낱말 AND, 맞는 신발 없음 — 나이키 클리프톤 → []", "/api/shoes?search=나이키%20클리프톤"),
  S("Q05", "공백 무시 — 젤카야노 → 젤 카야노 32", "/api/shoes?search=젤카야노"),
  S("Q06", "대소문자 무시 — x 880 → 프레시폼 X 880 v15", "/api/shoes?search=x%20880"),
  S("Q07", "+ 는 띄어쓰기(URLSearchParams 모양) — 아식스+젤", "/api/shoes?search=아식스+젤"),
  S("Q08", "앞뒤 · 여러 칸 공백 — '  나이키   플라이 '", "/api/shoes?search=%20%20나이키%20%20%20플라이%20"),
  S("Q09", "공백만 → 거르지 않음(전체)", "/api/shoes?search=%20%20"),
  S("Q10", "빈 값 → 거르지 않음(전체)", "/api/shoes?search="),
  S("Q11", "정규식 문자는 글자 그대로 — .* → []", "/api/shoes?search=.*"),
  S("Q12", "괄호 하나 — ( → [] (500 아님)", "/api/shoes?search=("),
  S("Q13", "용도는 찾지 않는다 — 조깅 → []", "/api/shoes?search=조깅"),
  S("Q14", "홈 조합 — 조깅·회복주 + 나이키", "/api/shoes?purpose=조깅·회복주&search=나이키"),
  S("Q15", "홈 조합 — 찜만 + 플라이", "/api/shoes?liked=true&search=플라이"),
  S("Q16", "홈 조합 — 아디다스 + 평점순", "/api/shoes?search=아디다스&_sort=rating&_order=desc"),
  S("Q17", "홈 조합 — 조깅·회복주 + 호카 + 찜순", "/api/shoes?purpose=조깅·회복주&search=호카&_sort=likeCount&_order=desc"),
  S("Q18", "관리 조합 — 브랜드 칩 호카 + 스피드 + 모델명순", "/api/shoes?brand=호카&search=스피드&_sort=model"),
  S("Q19", "관리 — 아디다스 + 브랜드순", "/api/shoes?search=아디다스&_sort=brand"),
  S("Q20", "페이지 대비 — 아디다스 + _limit=2 → X-Total-Count 4", "/api/shoes?search=아디다스&_limit=2"),
  S("Q21", "페이지 대비 — 아디다스 + _start=2&_end=4", "/api/shoes?search=아디다스&_start=2&_end=4"),
  S("Q22", "다른 컬렉션은 search 무시 — reviews?shoeId=3&search=zzz = shoeId=3", "/api/reviews?shoeId=3&search=zzz"),
  S("Q23", "관리 — 전체 개수만(_limit=0 → [] + X-Total-Count 20)", "/api/shoes?_limit=0"),
  S("Q24", "관리 — 브랜드 칩 목록 /api/brands(id 순 첫 등장)", "/api/brands"),
];
