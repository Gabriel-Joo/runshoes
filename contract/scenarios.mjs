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

// ---- V3(로그인) 뒤 계약 — 기준선 contract/baseline/spring-v3(Spring 녹화). docs/AUTH_DESIGN.md
// Node 기준선(SCENARIOS)은 이력으로 둔다 — 쓰기에 토큰이 필요해져 그대로는 돌지 않는다.
// R: 위의 읽기 01~26 그대로(비로그인) · W: 쓰기(30~53 의 흐름을 계정으로, 401 · 403 · 405 · 409 를 끼워) · A: 인증
// expect 는 그 단계의 상태코드 — record.mjs 가 다르면 표시하고 exit 1. volatile: 서버가 그때 정하는 값(createdAt)은 형식만 본다
// 사용자: runner01(id 1, 산길10년차 — 신발 18 · 19 · 20 에 리뷰) · runner02(id 2, 산악울트라) · admin(id 31). 리뷰 1 은 평발러너, 61 은 runner01
const bearer = (t) => ({ Authorization: `Bearer {{${t}}}` });
const jb = (t) => ({ ...json, ...bearer(t) });
const W = (id, name, method, path, extra = {}) => ({ id, name, method, path, ...extra });
const login = (id, email, pw, token) => W(id, `로그인 ${email}`, "POST", "/api/auth/login",
  { headers: json, body: { email, password: pw }, capture: { [token]: "body.accessToken" }, expect: 200 });
const contractShoe = { ...newShoe, rating: undefined, reviewCount: undefined, likeCount: undefined, liked: undefined };

export const V3_SCENARIOS = [
  ...SCENARIOS.filter((s) => s.id < "30").map((s) => ({ ...s, id: `R${s.id}` })),

  login("W00", "admin@runshoes.test", "{{adminPassword}}", "admin"),
  login("W01", "runner01@runshoes.test", "{{seedPassword}}", "u1"),
  login("W02", "runner02@runshoes.test", "{{seedPassword}}", "u2"),
  W("W03", "admin 의 찜 — liked=true 가 사용자별(V3 가 옮긴 2 · 6 · 16)", "GET", "/api/shoes?liked=true", { headers: bearer("admin"), expect: 200 }),
  W("W04", "admin 이 본 리뷰 14 — 공감 liked true(V3 가 옮긴 것)", "GET", "/api/reviews/14", { headers: bearer("admin"), expect: 200 }),

  W("W30a", "POST shoe 비로그인 → 401", "POST", "/api/shoes", { headers: json, body: contractShoe, expect: 401 }),
  W("W30b", "POST shoe USER → 403", "POST", "/api/shoes", { headers: jb("u1"), body: contractShoe, expect: 403 }),
  W("W30", "POST shoe admin → 201, 셈하는 값은 0(본문의 것은 버린다)", "POST", "/api/shoes",
    { headers: jb("admin"), body: { ...newShoe, rating: 5, reviewCount: 9, likeCount: 99, liked: true }, capture: { newShoe: "body.id" }, expect: 201 }),
  W("W31", "summary 새 신발 → 리뷰<3 (Ollama 안 부름)", "GET", "/api/shoes/{{newShoe}}/summary", { expect: 200 }),
  W("W32a", "POST review 비로그인 → 401", "POST", "/api/reviews", { headers: json, body: { shoeId: "{{newShoe:num}}", rating: 4, content: "로그인 없이 쓰는 계약 리뷰" }, expect: 401 }),
  W("W32", "POST review u1 → 201, author · userId · createdAt 은 서버(본문 author · createdAt 은 버린다)", "POST", "/api/reviews",
    { headers: jb("u1"), body: { shoeId: "{{newShoe:num}}", author: "사칭", rating: 4, content: "계약 테스트 리뷰 — 작성자는 토큰에서", createdAt: "2000-01-01T00:00:00.000Z" },
      capture: { newReview: "body.id" }, volatile: ["createdAt"], expect: 201 }),
  W("W32b", "같은 신발 두 번째 첫 리뷰 → 409", "POST", "/api/reviews", { headers: jb("u1"), body: { shoeId: "{{newShoe:num}}", rating: 5, content: "두 번째 첫 리뷰를 써 본다" }, expect: 409 }),
  W("W32c", "내용 10자 미만 → 400", "POST", "/api/reviews", { headers: jb("u2"), body: { shoeId: "{{newShoe:num}}", rating: 5, content: "짧다" }, expect: 400 }),
  W("W33", "GET 새 review", "GET", "/api/reviews/{{newReview}}", { volatile: ["createdAt"], expect: 200 }),
  W("W34a", "PATCH shoe 1 {liked, likeCount}(예전 찜 모양) USER → 403", "PATCH", "/api/shoes/1", { headers: jb("u1"), body: { liked: true, likeCount: 999 }, expect: 403 }),
  W("W34", "찜 PUT /api/shoes/1/like u1 → {liked, likeCount +1}", "PUT", "/api/shoes/1/like", { headers: bearer("u1"), expect: 200 }),
  W("W34b", "u1 이 본 shoe 1 — liked true", "GET", "/api/shoes/1", { headers: bearer("u1"), expect: 200 }),
  W("W35", "PATCH 새 shoe {midsole:null, price:null} admin — null 반영", "PATCH", "/api/shoes/{{newShoe}}", { headers: jb("admin"), body: { midsole: null, price: null }, expect: 200 }),
  W("W36", "PATCH 새 shoe — ShoeForm 수정 본문 전체(빈 칸 null) admin", "PATCH", "/api/shoes/{{newShoe}}",
    { headers: jb("admin"), body: { ...contractShoe, midsole: null, weight: null, drop: null, stackHeight: null, price: null, model: "Contract Runner 1 수정" }, expect: 200 }),
  W("W37", "PATCH 내 review {rating, content} — 평점 서버가 다시 셈", "PATCH", "/api/reviews/{{newReview}}",
    { headers: jb("u1"), body: { rating: 2, content: "수정한 계약 리뷰입니다", author: "바꿔치기" }, volatile: ["createdAt"], expect: 200 }),
  W("W37a", "PATCH 남의 review(u2) → 403", "PATCH", "/api/reviews/{{newReview}}", { headers: jb("u2"), body: { rating: 1 }, expect: 403 }),
  W("W37b", "PATCH 남의 review(admin) → 403", "PATCH", "/api/reviews/{{newReview}}", { headers: jb("admin"), body: { rating: 1 }, expect: 403 }),
  W("W38", "공감 PUT /api/reviews/1/like u1 → +1", "PUT", "/api/reviews/1/like", { headers: bearer("u1"), expect: 200 }),
  W("W38a", "내 리뷰 공감 → 403", "PUT", "/api/reviews/{{newReview}}/like", { headers: bearer("u1"), expect: 403 }),
  W("W39", "PATCH 새 shoe {rating, reviewCount} admin — 버린다(서버가 센 값 그대로)", "PATCH", "/api/shoes/{{newShoe}}", { headers: jb("admin"), body: { rating: 5, reviewCount: 9 }, expect: 200 }),
  W("W40", "PATCH 없는 shoe admin → 404", "PATCH", "/api/shoes/9999", { headers: jb("admin"), body: { summary: "x" }, expect: 404 }),
  W("W40a", "PATCH 없는 shoe 비로그인 → 401(404 보다 먼저)", "PATCH", "/api/shoes/9999", { headers: json, body: { summary: "x" }, expect: 401 }),
  W("W40b", "PATCH 없는 shoe USER → 404(403 보다 먼저)", "PATCH", "/api/shoes/9999", { headers: jb("u1"), body: { summary: "x" }, expect: 404 }),
  W("W41", "PATCH 없는 review → 404", "PATCH", "/api/reviews/9999", { headers: jb("u1"), body: { rating: 1 }, expect: 404 }),
  W("W42", "PUT 새 shoe 전체 치환 admin — 셈하는 값은 그대로", "PUT", "/api/shoes/{{newShoe}}", { headers: jb("admin"), body: { ...newShoe, model: "Contract Runner PUT" }, expect: 200 }),
  W("W42a", "PUT review → 405(작성자여도)", "PUT", "/api/reviews/{{newReview}}", { headers: jb("u1"), body: { rating: 1, content: "PUT 으로 통째로 바꾸기" }, expect: 405 }),
  W("W43", "POST 없는 컬렉션 → 404", "POST", "/api/foo", { headers: jb("admin"), body: { a: 1 }, expect: 404 }),
  W("W44a", "DELETE 남의 review(u2) → 403", "DELETE", "/api/reviews/{{newReview}}", { headers: bearer("u2"), expect: 403 }),
  W("W44", "DELETE 내 review → 200 {}", "DELETE", "/api/reviews/{{newReview}}", { headers: bearer("u1"), expect: 200 }),
  W("W45", "DELETE 없는 review → 404", "DELETE", "/api/reviews/9999", { headers: bearer("u1"), expect: 404 }),
  W("W46", "POST review u1(지운 뒤 다시 첫 리뷰) — cascade 준비 1", "POST", "/api/reviews",
    { headers: jb("u1"), body: { shoeId: "{{newShoe:num}}", rating: 5, content: "cascade 준비 리뷰 하나" }, volatile: ["createdAt"], expect: 201 }),
  W("W47", "POST review u2 — cascade 준비 2", "POST", "/api/reviews",
    { headers: jb("u2"), body: { shoeId: "{{newShoe:num}}", rating: 3, content: "cascade 준비 리뷰 둘" }, volatile: ["createdAt"], expect: 201 }),
  W("W47b", "새 shoe — 평점 · 리뷰 수를 서버가 셌다((5+3)/2 = 4, 2건)", "GET", "/api/shoes/{{newShoe}}", { expect: 200 }),
  W("W48a", "DELETE shoe USER → 403", "DELETE", "/api/shoes/{{newShoe}}", { headers: bearer("u1"), expect: 403 }),
  W("W48", "DELETE 새 shoe admin → 200", "DELETE", "/api/shoes/{{newShoe}}", { headers: bearer("admin"), expect: 200 }),
  W("W49", "cascade — 새 shoe 의 reviews 가 남지 않았는지", "GET", "/api/reviews?shoeId={{newShoe}}", { expect: 200 }),
  W("W50", "DELETE 없는 shoe → 404", "DELETE", "/api/shoes/9999", { headers: bearer("admin"), expect: 404 }),
  W("W51", "POST 다시 → id 가 max+1(지운 21 을 다시 쓴다)", "POST", "/api/shoes", { headers: jb("admin"), body: { ...contractShoe, model: "Contract Runner 2" }, expect: 201 }),
  W("W52", "끝 상태 — shoes 전체(비로그인: liked 전부 false, shoe 1 likeCount 43)", "GET", "/api/shoes", { expect: 200 }),
  W("W52b", "끝 상태 — u1 이 본 shoes(shoe 1 liked)", "GET", "/api/shoes", { headers: bearer("u1"), expect: 200 }),
  W("W53", "끝 상태 — reviews 전체(review 1 likeCount 3)", "GET", "/api/reviews", { expect: 200 }),
];

// 인증 — 가입 · 로그인 · refresh(교체 · 동시) · 로그아웃 · 회원 정보 · CSRF/CORS. 계약 계정은 이 녹화의 DB 에만 생긴다
export const AUTH_SCENARIOS = [
  W("A01", "가입 이메일 형식 → 400", "POST", "/api/auth/signup", { headers: json, body: { email: "bad", password: "abcd1234", nickname: "계약러너" }, expect: 400 }),
  W("A02", "가입 비밀번호 8자 미만 → 400", "POST", "/api/auth/signup", { headers: json, body: { email: "contract@runshoes.test", password: "abc123", nickname: "계약러너" }, expect: 400 }),
  W("A03", "가입 예약어 닉네임 → 400", "POST", "/api/auth/signup", { headers: json, body: { email: "contract@runshoes.test", password: "abcd1234", nickname: "관리자" }, expect: 400 }),
  W("A04", "가입 이미 있는 이메일(대소문자 무시) → 409", "POST", "/api/auth/signup", { headers: json, body: { email: "RUNNER01@runshoes.test", password: "abcd1234", nickname: "계약러너" }, expect: 409 }),
  W("A05", "가입 이미 있는 닉네임(대소문자 무시) → 409", "POST", "/api/auth/signup", { headers: json, body: { email: "contract@runshoes.test", password: "abcd1234", nickname: "느긋한lsd" }, expect: 409 }),
  W("A06", "가입 → 201 + 토큰 + refresh 쿠키", "POST", "/api/auth/signup",
    { headers: json, body: { email: " Contract@RunShoes.test ", password: "contract123", nickname: "계약러너" }, capture: { c: "body.accessToken", cr: "cookie.runshoes_refresh" }, expect: 201 }),
  W("A07", "로그인 틀린 비밀번호 → 401", "POST", "/api/auth/login", { headers: json, body: { email: "contract@runshoes.test", password: "wrongpass1" }, expect: 401 }),
  W("A08", "로그인 없는 이메일 → 같은 401", "POST", "/api/auth/login", { headers: json, body: { email: "nobody@runshoes.test", password: "wrongpass1" }, expect: 401 }),
  W("A09", "로그인 빈 값 → 400", "POST", "/api/auth/login", { headers: json, body: { email: "", password: "" }, expect: 400 }),
  W("A10", "GET /api/me 토큰 없음 → 401", "GET", "/api/me", { expect: 401 }),
  W("A11", "GET /api/me", "GET", "/api/me", { headers: bearer("c"), expect: 200 }),
  W("A12", "닉네임 미리 확인 — 빈 것 200", "GET", "/api/auth/nickname-available?nickname=새닉네임", { expect: 200 }),
  W("A13", "닉네임 미리 확인 — 쓰는 것 409", "GET", "/api/auth/nickname-available?nickname=산길10년차", { expect: 409 }),
  W("A14", "닉네임 미리 확인 — 형식 400", "GET", "/api/auth/nickname-available?nickname=ㅁㅁㅁ", { expect: 400 }),
  W("A15", "닉네임 변경 — 지금과 같음 400", "PATCH", "/api/me/nickname", { headers: jb("c"), body: { nickname: "계약러너" }, expect: 400 }),
  W("A16", "닉네임 변경 → 200", "PATCH", "/api/me/nickname", { headers: jb("c"), body: { nickname: "계약러너2" }, expect: 200 }),
  W("A17", "비밀번호 변경 — 지금 것 틀림 400", "PUT", "/api/me/password", { headers: jb("c"), body: { currentPassword: "wrongpass1", newPassword: "contract456" }, expect: 400 }),
  W("A18", "비밀번호 변경 → 204", "PUT", "/api/me/password", { headers: jb("c"), body: { currentPassword: "contract123", newPassword: "contract456" }, expect: 204 }),
  W("A19", "refresh 쿠키 없음 → 401", "POST", "/api/auth/refresh", { expect: 401 }),
  W("A20", "refresh → 새 토큰 · 새 쿠키(교체)", "POST", "/api/auth/refresh", { headers: { Cookie: "runshoes_refresh={{cr}}" }, capture: { cr2: "cookie.runshoes_refresh" }, expect: 200 }),
  W("A21", "바뀐 쿠키를 10초 안에 다시 — 동시 refresh 로 보고 200", "POST", "/api/auth/refresh", { headers: { Cookie: "runshoes_refresh={{cr}}" }, expect: 200 }),
  W("A22", "로그아웃 → 204 + 쿠키 지움", "POST", "/api/auth/logout", { headers: { Cookie: "runshoes_refresh={{cr2}}" }, expect: 204 }),
  W("A23", "로그아웃한 쿠키로 refresh → 401", "POST", "/api/auth/refresh", { headers: { Cookie: "runshoes_refresh={{cr2}}" }, expect: 401 }),
  W("A24", "다른 Origin 의 로그인 → 403", "POST", "/api/auth/login", { headers: { ...json, Origin: "https://evil.example" }, body: { email: "contract@runshoes.test", password: "contract456" }, expect: 403 }),
  W("A25", "/api/auth preflight → 204, CORS 헤더 없음", "OPTIONS", "/api/auth/refresh",
    { headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" }, expect: 204 }),
  W("A26", "바꾼 비밀번호로 로그인 → 200(성공하면 그 계정의 실패는 처음부터 센다)", "POST", "/api/auth/login", { headers: json, body: { email: "contract@runshoes.test", password: "contract456" }, capture: { c: "body.accessToken" }, expect: 200 }),

  // 시도 제한(3단계, docs/AUTH_RATELIMIT_DESIGN.md) — 같은 계정 15분에 실패 5번이면 맞는 비밀번호도 429. 없는 이메일도 같다.
  // 녹화기는 한 IP(127.0.0.1)라 IP 기준(20번)은 이 녹화에서 넘지 않는다 — 실패는 모두 13번
  ...[27, 28, 29, 30, 31].map((n, i) => W(`A${n}`, `계약 계정 틀림 ${i + 1}번째 → 401`, "POST", "/api/auth/login",
    { headers: json, body: { email: "contract@runshoes.test", password: `wrongpass${i}` }, expect: 401 })),
  W("A32", "6번째 — 맞는 비밀번호도 429 + Retry-After · retryAfter", "POST", "/api/auth/login",
    { headers: json, body: { email: "contract@runshoes.test", password: "contract456" }, volatile: ["retryAfter"], expect: 429 }),
  ...[33, 34, 35, 36, 37].map((n, i) => W(`A${n}`, `없는 이메일 틀림 ${i + 1}번째 → 401`, "POST", "/api/auth/login",
    { headers: json, body: { email: "nobody-contract@runshoes.test", password: `wrongpass${i}` }, expect: 401 })),
  W("A38", "없는 이메일 6번째 → 같은 429(가입 여부가 드러나지 않게)", "POST", "/api/auth/login",
    { headers: json, body: { email: "nobody-contract@runshoes.test", password: "wrongpass9" }, volatile: ["retryAfter"], expect: 429 }),

  // 조회 기록(3단계) — 로그인한 사람만. 남겼는지는 말하지 않는다(언제나 204)
  W("A39", "POST /api/activity shoe.view → 204", "POST", "/api/activity", { headers: jb("c"), body: { type: "shoe.view", shoeId: 3 }, expect: 204 }),
  W("A40", "POST /api/activity 비로그인 → 401", "POST", "/api/activity", { headers: json, body: { type: "shoe.view", shoeId: 3 }, expect: 401 }),
  W("A41", "POST /api/activity 모르는 type → 400", "POST", "/api/activity", { headers: jb("c"), body: { type: "hack" }, expect: 400 }),
  W("A42", "POST /api/activity 없는 신발 → 404", "POST", "/api/activity", { headers: jb("c"), body: { type: "shoe.view", shoeId: 9999 }, expect: 404 }),
  W("A43", "POST /api/activity compare.view(2개) → 204", "POST", "/api/activity", { headers: jb("c"), body: { type: "compare.view", shoeIds: [16, 2] }, expect: 204 }),
];

// 요약 — V3 에서는 리뷰를 쓰려면 로그인해야 한다(S0). S5 내용은 10자 이상(V3 규칙) — 그래서 S9 프롬프트의 그 한 줄만 Node 기준선과 다르다
export const SUMMARY_V3_SCENARIOS = [
  login("S0", "runner01@runshoes.test", "{{seedPassword}}", "u1"),
  ...SUMMARY_SCENARIOS.map((s) => s.id !== "S5" ? s : { ...s, headers: jb("u1"),
    body: { shoeId: 1, rating: 5, content: "요약 캐시 무효화 리뷰" }, volatile: ["createdAt"], expect: 201 }),
];

// V4(세대 구조 · 공시값 기준 사이즈 · 실측값, 2026-10-24) — 새 기능만 담는다. 기존 115건(V3 · AUTH)은 기준선 spring-v3 그대로 두고
// diff --allow-added 로 "응답에 V4 키가 더해졌을 뿐"인지만 본다(다시 녹화하지 않는다 — 무엇이 바뀌었는지 추적이 남게).
// 시드(V4 가 기존 20켤레에 line_key · generation · is_current · gender 를 채운 상태)에서 시작한다. 목록 기본은 전체 노출(isCurrent 필터는 고를 때만)
const v4Shoe = { ...contractShoe, model: "Contract Runner V4", lineKey: "contract:runner", generation: 1, isCurrent: true, gender: "men",
  weightSize: "M9", specSize: null, measuredWeight: 262, measuredWeightSize: "M10", measuredStackHeight: null, measuredDrop: null,
  measuredSource: "https://example.test/review", measuredCount: 1 };
export const V4_SCENARIOS = [
  login("V00", "admin@runshoes.test", "{{adminPassword}}", "admin"),
  W("V01", "GET shoe 1 — V4 키(lineKey · generation · isCurrent · gender …)가 붙는다", "GET", "/api/shoes/1", { expect: 200 }),
  W("V02", "목록 기본 = 전체 노출(필터 없음) — 20켤레 그대로", "GET", "/api/shoes", { expect: 200 }),
  W("V03", "?isCurrent=true — 현행만", "GET", "/api/shoes?isCurrent=true", { expect: 200 }),
  W("V04", "?isCurrent=false — 지난 세대만", "GET", "/api/shoes?isCurrent=false", { expect: 200 }),
  W("V05", "?lineKey=asics:gel-kayano — 같은 라인(상세의 이전 · 다음 세대)", "GET", "/api/shoes?lineKey=asics:gel-kayano", { expect: 200 }),
  W("V06", "?lineKey=없는 라인 → 빈 배열", "GET", "/api/shoes?lineKey=nobrand:noline", { expect: 200 }),
  W("V10", "POST V4 칸 포함 admin → 201", "POST", "/api/shoes", { headers: jb("admin"), body: v4Shoe, capture: { v4a: "body.id" }, expect: 201 }),
  W("V11", "POST 같은 lineKey · generation · gender → 409", "POST", "/api/shoes", { headers: jb("admin"), body: { ...v4Shoe, model: "중복 세대" }, expect: 409 }),
  W("V12", "POST 같은 라인 · 세대, 성별 women → 201(남녀는 별도 행)", "POST", "/api/shoes", { headers: jb("admin"), body: { ...v4Shoe, model: "Contract Runner V4 W", gender: "women" }, capture: { v4b: "body.id" }, expect: 201 }),
  W("V13", "POST gender 형식 틀림(male) → 400", "POST", "/api/shoes", { headers: jb("admin"), body: { ...v4Shoe, gender: "male", generation: 7 }, expect: 400 }),
  W("V14", "POST generation 정수 아님(1.5) → 400", "POST", "/api/shoes", { headers: jb("admin"), body: { ...v4Shoe, generation: 1.5 }, expect: 400 }),
  W("V15", "POST isCurrent 문자열 → 400", "POST", "/api/shoes", { headers: jb("admin"), body: { ...v4Shoe, generation: 8, isCurrent: "yes" }, expect: 400 }),
  W("V20", "PATCH 새 세대로(generation 2 · isCurrent false) admin → 200", "PATCH", "/api/shoes/{{v4a}}", { headers: jb("admin"), body: { generation: 2, isCurrent: false }, expect: 200 }),
  W("V21", "PATCH women 행을 men · 2세대로 → 409(V20 과 겹친다)", "PATCH", "/api/shoes/{{v4b}}", { headers: jb("admin"), body: { gender: "men", generation: 2 }, expect: 409 }),
  W("V22", "PATCH 자기 자신과 같은 값 → 200(자기 행은 겹침이 아니다)", "PATCH", "/api/shoes/{{v4a}}", { headers: jb("admin"), body: { lineKey: "contract:runner", generation: 2, gender: "men" }, expect: 200 }),
  W("V23", "?lineKey=contract:runner — 두 행", "GET", "/api/shoes?lineKey=contract:runner", { expect: 200 }),
  W("V24", "PUT 전체 치환 — 본문에 없는 V4 칸은 null(PUT 의미 그대로)", "PUT", "/api/shoes/{{v4b}}", { headers: jb("admin"), body: { ...contractShoe, model: "Contract Runner PUT V4" }, expect: 200 }),
  W("V30", "DELETE 새 shoe a", "DELETE", "/api/shoes/{{v4a}}", { headers: bearer("admin"), expect: 200 }),
  W("V31", "DELETE 새 shoe b", "DELETE", "/api/shoes/{{v4b}}", { headers: bearer("admin"), expect: 200 }),
  W("V32", "끝 상태 — 시드 20켤레(V4 키 포함)", "GET", "/api/shoes", { expect: 200 }),
];

// V6~V9(2026-10-30) — 스펙 출처 · 데모 관리자 · 신발 숨김 · 회원 탈퇴 · 리뷰 300자 · 가격 출처 크림. 새 기능만 담는다(기준선 spring-v6).
// 옛 기준선(spring-v3 · v4 …)은 다시 녹화하지 않고 --allow-added 로 specSources 가 더해진 것만 허용한다.
//   단 spring-v3 의 W51 · W52(지운 신발 id 를 다시 쓴다)는 숨김(V8)으로 달라진다 — 숨긴 행이 id 를 가지고 있어 새 신발은 22(의도한 변경)
// 시드(Flyway)에서 시작한다: 데모 관리자는 V7 이 넣은 id 32. 체험 로그인은 녹화 때 DEMO_LOGIN_ENABLED=true
export const V6_SCENARIOS = [
  login("X00", "admin@runshoes.test", "{{adminPassword}}", "admin"),
  login("X01", "runner01@runshoes.test", "{{seedPassword}}", "u1"),
  W("X02", "체험 카드 — 시드 30(id 순, 리뷰 수 · 찜 수) + 데모 관리자", "GET", "/api/auth/demo-accounts", { expect: 200 }),
  W("X03", "체험 로그인 — 진짜 관리자 id 31 → 400", "POST", "/api/auth/demo", { headers: json, body: { id: 31 }, expect: 400 }),
  W("X04", "체험 로그인 — 없는 id → 400", "POST", "/api/auth/demo", { headers: json, body: { id: 9999 }, expect: 400 }),
  W("X05", "체험 로그인 — 데모 관리자 32 → 200", "POST", "/api/auth/demo", { headers: json, body: { id: 32 }, capture: { d: "body.accessToken" }, expect: 200 }),
  W("X06", "체험 로그인 — 시드 runner03 → 200", "POST", "/api/auth/demo", { headers: json, body: { id: 3 }, capture: { s3: "body.accessToken" }, expect: 200 }),
  W("X07", "데모 관리자는 비밀번호로 못 들어간다 → 401", "POST", "/api/auth/login", { headers: json, body: { email: "demo-admin@runshoes.test", password: "{{seedPassword}}" }, expect: 401 }),
  W("X10", "데모 관리자 PATCH shoe → 403 {code:demo_admin, message}", "PATCH", "/api/shoes/1", { headers: jb("d"), body: { summary: "x" }, expect: 403 }),
  W("X11", "데모 관리자 DELETE shoe → 403", "DELETE", "/api/shoes/1", { headers: bearer("d"), expect: 403 }),
  W("X12", "데모 관리자 POST review → 403", "POST", "/api/reviews", { headers: jb("d"), body: { shoeId: 1, rating: 5, content: "데모 관리자가 써 보는 리뷰" }, expect: 403 }),
  W("X13", "데모 관리자 찜 → 403", "PUT", "/api/shoes/1/like", { headers: bearer("d"), expect: 403 }),
  W("X14", "데모 관리자 리뷰 지우기 → 403", "DELETE", "/api/reviews/1", { headers: bearer("d"), expect: 403 }),
  W("X15", "데모 관리자 숨긴 신발 목록 → 200 []", "GET", "/api/admin/shoes/hidden", { headers: bearer("d"), expect: 200 }),
  W("X16", "데모 관리자 닉네임 변경 → 403", "PATCH", "/api/me/nickname", { headers: jb("d"), body: { nickname: "바꿔본다" }, expect: 403 }),
  W("X17", "시드 체험 계정 닉네임 변경 → 403", "PATCH", "/api/me/nickname", { headers: jb("s3"), body: { nickname: "바꿔본다" }, expect: 403 }),
  W("X18", "시드 체험 계정 탈퇴 → 403", "DELETE", "/api/me", { headers: bearer("s3"), expect: 403 }),
  W("X19", "관리자 탈퇴 → 403", "DELETE", "/api/me", { headers: bearer("admin"), expect: 403 }),
  W("X20", "숨긴 목록 비로그인 → 401", "GET", "/api/admin/shoes/hidden", { expect: 401 }),
  W("X21", "숨긴 목록 USER → 403", "GET", "/api/admin/shoes/hidden", { headers: bearer("u1"), expect: 403 }),

  W("X30", "신발 20 숨기기 admin → 200 {}", "DELETE", "/api/shoes/20", { headers: bearer("admin"), expect: 200 }),
  W("X31", "숨긴 신발 GET → 404", "GET", "/api/shoes/20", { expect: 404 }),
  W("X32", "목록에서 빠진다 — 19켤레", "GET", "/api/shoes", { expect: 200 }),
  W("X33", "숨긴 신발의 리뷰 — 목록에 없다", "GET", "/api/reviews?shoeId=20", { expect: 200 }),
  W("X34", "숨긴 신발 찜 → 404", "PUT", "/api/shoes/20/like", { headers: bearer("u1"), expect: 404 }),
  W("X35", "숨긴 신발에 리뷰 → 400", "POST", "/api/reviews", { headers: jb("u1"), body: { shoeId: 20, rating: 4, content: "숨긴 신발에 써 보는 리뷰" }, expect: 400 }),
  W("X36", "숨긴 것을 다시 DELETE → 404", "DELETE", "/api/shoes/20", { headers: bearer("admin"), expect: 404 }),
  W("X37", "숨긴 목록 admin — 신발 20 + deletedAt", "GET", "/api/admin/shoes/hidden", { headers: bearer("admin"), volatile: ["deletedAt"], expect: 200 }),
  W("X38", "숨긴 신발과 같은 라인 · 세대 · 성별 POST → 409 hidden_generation", "POST", "/api/shoes",
    { headers: jb("admin"), body: { ...contractShoe, model: "숨긴 세대와 겹침", lineKey: "asics:gel-trabuco", generation: 13, gender: "men" }, expect: 409 }),
  W("X39", "새 신발 → 201, id 21(숨긴 20 을 다시 쓰지 않는다)", "POST", "/api/shoes", { headers: jb("admin"), body: { ...contractShoe, model: "Contract Runner V6" }, capture: { x6: "body.id" }, expect: 201 }),
  W("X40", "데모 관리자 되살리기 → 403", "POST", "/api/admin/shoes/20/restore", { headers: bearer("d"), expect: 403 }),
  W("X41", "되살리기 admin → 200, 리뷰 수 · 찜 수 그대로", "POST", "/api/admin/shoes/20/restore", { headers: bearer("admin"), expect: 200 }),
  W("X42", "되살린 신발의 리뷰가 돌아온다", "GET", "/api/reviews?shoeId=20", { expect: 200 }),
  W("X43", "숨기지 않은 신발 되살리기 → 404", "POST", "/api/admin/shoes/20/restore", { headers: bearer("admin"), expect: 404 }),

  // 와이드 "없음"의 출처 필수는 관리 폼이 본다(서버가 막으면 spring-v3 W30 · W36 이 깨진다) — 여기서는 출처를 함께 저장하는 것만
  W("X51", "와이드 없음 + 출처 STORE · 중량 WEB+주소 → 200", "PATCH", "/api/shoes/1",
    { headers: jb("admin"), body: { wideAvailable: false, specSources: { wideAvailable: { code: "STORE" }, weight: { code: "WEB", url: "https://example.test/weight" } } }, expect: 200 }),
  W("X52", "WEB 인데 주소 없음 → 400", "PATCH", "/api/shoes/1", { headers: jb("admin"), body: { specSources: { drop: { code: "WEB" } } }, expect: 400 }),
  W("X53", "모르는 출처 코드 → 400", "PATCH", "/api/shoes/1", { headers: jb("admin"), body: { specSources: { drop: { code: "XYZ" } } }, expect: 400 }),
  W("X54", "출처 칸이 아닌 것(carbon) → 400", "PATCH", "/api/shoes/1", { headers: jb("admin"), body: { specSources: { carbon: { code: "MAN" } } }, expect: 400 }),
  W("X55", "다른 칸만 PATCH — specSources 그대로 → 200", "PATCH", "/api/shoes/1", { headers: jb("admin"), body: { summary: "계약 요약 V6" }, expect: 200 }),
  W("X56", "가격 출처 크림 · 발매가 → 200", "PATCH", "/api/shoes/1", { headers: jb("admin"), body: { priceSource: "크림", priceCheckedAt: "2026-10-30", priceKind: "발매가" }, expect: 200 }),
  W("X56a", "가격 종류 정가 → 400(발매가로 통일, 2026-10-30)", "PATCH", "/api/shoes/1", { headers: jb("admin"), body: { priceKind: "정가" }, expect: 400 }),
  W("X56b", "추가 이미지 7장 → 400(6장까지)", "PATCH", "/api/shoes/1", { headers: jb("admin"), body: { images: ["a", "b", "c", "d", "e", "f", "g"] }, expect: 400 }),
  W("X57", "GET shoe 1 — specSources", "GET", "/api/shoes/1", { expect: 200 }),

  W("X60", "리뷰 301자 → 400", "POST", "/api/reviews", { headers: jb("u1"), body: { shoeId: "{{x6:num}}", rating: 4, content: "가".repeat(301) }, expect: 400 }),
  W("X61", "리뷰 300자 → 201", "POST", "/api/reviews", { headers: jb("u1"), body: { shoeId: "{{x6:num}}", rating: 4, content: "가".repeat(300) }, volatile: ["createdAt"], expect: 201 }),

  W("X70", "탈퇴 시험 계정 가입 → 201", "POST", "/api/auth/signup",
    { headers: json, body: { email: "withdraw@runshoes.test", password: "withdraw123", nickname: "탈퇴시험" }, capture: { w: "body.accessToken", wr: "cookie.runshoes_refresh" }, expect: 201 }),
  W("X71", "탈퇴 전 리뷰 → 201", "POST", "/api/reviews", { headers: jb("w"), body: { shoeId: "{{x6:num}}", rating: 3, content: "탈퇴하기 전에 남기는 리뷰" }, capture: { wv: "body.id" }, volatile: ["createdAt"], expect: 201 }),
  W("X72", "탈퇴 전 찜 → likeCount 1", "PUT", "/api/shoes/{{x6}}/like", { headers: bearer("w"), expect: 200 }),
  W("X73", "탈퇴 → 204", "DELETE", "/api/me", { headers: bearer("w"), expect: 204 }),
  W("X74", "리뷰는 남고 작성자 \"탈퇴 회원\"", "GET", "/api/reviews/{{wv}}", { volatile: ["createdAt"], expect: 200 }),
  W("X75", "찜은 지워지고 찜 수 0", "GET", "/api/shoes/{{x6}}", { expect: 200 }),
  W("X76", "탈퇴한 계정 로그인 → 401", "POST", "/api/auth/login", { headers: json, body: { email: "withdraw@runshoes.test", password: "withdraw123" }, expect: 401 }),
  W("X77", "남은 토큰 /api/me → 401", "GET", "/api/me", { headers: bearer("w"), expect: 401 }),
  W("X78", "남은 토큰 찜 → 401", "PUT", "/api/shoes/{{x6}}/like", { headers: bearer("w"), expect: 401 }),
  W("X79", "남은 refresh 쿠키 → 401", "POST", "/api/auth/refresh", { headers: { Cookie: "runshoes_refresh={{wr}}" }, expect: 401 }),
  W("X80", "같은 이메일 · 닉네임으로 다시 가입 → 201(새 계정)", "POST", "/api/auth/signup",
    { headers: json, body: { email: "withdraw@runshoes.test", password: "withdraw123", nickname: "탈퇴시험" }, capture: { w2: "body.accessToken" }, expect: 201 }),
  W("X81", "새 계정 /api/me — createdAt", "GET", "/api/me", { headers: bearer("w2"), volatile: ["createdAt"], expect: 200 }),
  W("X82", "새 계정의 리뷰 — 이전 리뷰는 돌아오지 않는다", "GET", "/api/reviews?userId=34", { expect: 200 }),

  W("X90", "끝 상태 — shoes 전체(specSources 포함)", "GET", "/api/shoes", { expect: 200 }),
  W("X91", "끝 상태 — reviews 전체", "GET", "/api/reviews", { volatile: ["createdAt"], expect: 200 }),
];
