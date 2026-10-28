# RUNSHOES — API 계약과 설계 근거

RUNSHOES 의 REST API(`/api/shoes`, `/api/reviews`, `/api/terms`)는 **이미 프런트와 맞물려 돌던 API 의 응답을 바이트 수준까지 재현**하도록 만들었다.
Spring Boot 로 처음 설계했다면 하지 않았을 선택이 몇 있다 — 이 문서는 그 이유를 적는다. 어떻게 그 API 를 녹화하고 비교했는지는 [HISTORY.md](HISTORY.md) 3장.

- 계약의 정답은 **녹화본** `contract/baseline/node`(50 시나리오) · `contract/baseline/node-summary`(요약 9) — 문서나 계획서가 아니다
- 검증: `contract/run-spring-local.sh`(로컬) · `node contract/diff.mjs --read-only …`(운영). 2026-10-21 운영 PASS 23 · FAIL 0
- 원래 API 는 `server.cjs`(Express + json-server 0.17.4 + `db.json`)다. 레포에 남겨 둔 이유는 이 녹화를 다시 뜰 수 있게(기준선)와 되돌리기용이다 — 운영 이미지에는 들어가지 않는다

---

## 1. 데이터 표현 — 스키마가 이상해 보이는 곳

### 1.1 id 는 AUTO_INCREMENT 가 아니라 `max(id) + 1`

새 신발 · 리뷰의 id 는 **지금 남아 있는 최대 id + 1** 이다. 마지막 행을 지우고 다시 만들면 **지운 id 를 다시 쓴다**(시나리오 48 → 51: 21 을 지우고 POST 하면 다시 21).
InnoDB AUTO_INCREMENT 는 지운 값을 다시 쓰지 않으므로 컬럼에 AUTO_INCREMENT 를 두지 않고 앱이 매긴다(`ShoeCollection.create` · `ReviewCollection.create`).

- POST 본문에 `id` 가 있으면 그 id 를 쓴다. 이미 있으면 500 `{}`
- JVM 안에서는 쓰기를 한 줄로 잠근다. Pod 가 둘 겹치는 짧은 순간(롤링)에 동시 POST 가 오면 PK 충돌이 500 으로 드러난다 — 트래픽에서 감수

### 1.2 terms 에 id 12 가 둘

용어 시드에 `id: 12` 가 두 번(weight, outsole) 있고, 응답(시나리오 03)도 그대로 둘 다 12 다. 재번호화하면 계약이 깨진다.
그래서 `terms.id` 는 키가 아니고, 순서와 PK 는 `row_no`(AUTO_INCREMENT)가 맡는다. 프런트는 `term.key` 로만 찾으므로 화면에는 영향이 없다. 용어는 읽기 전용(쓰기 405).

### 1.3 숫자 스펙이 DOUBLE

`weight` · `drop` · `stack_height` · `price` · `rating` 이 `DOUBLE` 이다. 등록 · 수정 폼은 입력을 `Number(값)` 으로 그대로 보내고(250.5 도 된다), 원래 API 는 받은 JSON 숫자를 그대로 저장했다.
INT · DECIMAL 이면 잘리거나 반올림돼 돌아온다. JSON 숫자와 같은 표현이 DOUBLE 이다. 응답에서는 정수 값을 `300.0` 이 아니라 `300` 으로 낸다(`JacksonConfig`).

### 1.4 createdAt — `DATETIME(3)`, UTC, ms 까지

시드에는 날짜만(`2026-07-18`, 69건)과 ms+Z ISO(`2026-07-28T08:41:06.821Z`, 36건)가 섞여 있고, 프런트는 새 리뷰를 `new Date().toISOString()`(ms+Z)으로 보낸다.

- 저장: UTC `DATETIME(3)` — 날짜만은 그날 00:00:00.000, 오프셋이 있으면 UTC 로
- 응답: 언제나 `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'` — 날짜만이던 값은 `2026-07-18T00:00:00.000Z`. `Date.parse` 로 같은 순간이다
- ms 를 버리거나 오프셋 없이 내면 프런트의 상대 시간이 틀어진다(KST 에서 "방금 전"이 "9시간 전")

### 1.5 키가 없는 필드

- `reviews.likeCount` — 시드 2건과 새로 쓴 리뷰는 키가 없다. 컬럼은 NULL, 응답에서는 키를 뺀다
- `reviews.liked` — 시드 92건은 키가 없다. 응답은 늘 `true/false` 로 낸다(프런트에서 없음 = false, 녹화 비교도 같게 본다)
- 그 밖의 null 은 그대로 `null` 로 낸다 — shoe 4 의 `midsole: null` 이 "정보 없음" 표시의 근거다(글로벌 NON_NULL 을 쓰지 않는다)

---

## 2. HTTP 동작 — json-server 와 같게 한 것

아래는 json-server 의 모양 그대로다. 로그인(V3) 뒤에는 그 위에 권한 · 서버가 정하는 값이 얹힌다 — **쓰기는 로그인해야 하고(401 → 404 → 403), PATCH 로 바꿀 수 있는 키 · PUT · 셈하는 값이 달라졌다**(2.2).

| 항목 | 동작 | 녹화 |
|---|---|---|
| 404 | 없는 id · 비숫자 id(`abc`, `01`) · 없는 컬렉션 · 그 밖의 `/api` 경로 — 본문 `{}` | 05 · 06 · 07 · 40 · 41 · 43 · 45 · 50 |
| POST | 201, `Location: <요청 URL>/<id>`(절대 URL), `Access-Control-Expose-Headers: Location` | 30 · 32 · 51 |
| PATCH | 본문에 **있는 키만** 바꾼다 — 값이 `null` 이어도 반영(수정 폼이 빈 칸을 null 로 보낸다). 없는 키는 그대로 | 34~39 |
| PUT | 본문으로 통째로 바꾸고 id 만 남긴다 | 42 |
| DELETE | 200 **`{}`**(지운 문서가 아니다). 신발을 지우면 그 리뷰도 지운다 | 44 · 48 · 49 |
| 목록 정렬 | `_sort` · `_order`(여러 키), lodash `orderBy` — **stable**(동점은 id 순), 오름차순에서 null 은 뒤 | 11~16 |
| 목록 필터 | 컬렉션에 **있는 필드면 필터**(`?brand=호카`, 값 여럿은 OR), 없는 필드는 무시(`?junk=1`). `_ne` · `_lte` · `_gte` · `_like` · `q`. 비교는 JS 문자열(`rating=4` 는 맞고 `4.0` 은 아니다) | 08~10 · 24 |
| 자르기 | `_start` · `_end` · `_limit` + `X-Total-Count`, `Access-Control-Expose-Headers: X-Total-Count` | 25 |
| 캐시 헤더 | `/api/*` 는 `Cache-Control: no-cache` + `Pragma: no-cache` + `Expires: -1`. 요약만 `no-store`. SPA · 정적 파일은 `public, max-age=0` | 전부 |
| CORS | 모든 경로 `Access-Control-Allow-Origin: *`. `/api` 는 Origin 이 오면 그 값을 돌려주고 `Allow-Credentials: true` | 전부 |
| OPTIONS | **204**, `Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE`, 요청 헤더 반사, `no-store` | 19 |
| 요약 | `/api/shoes/{id}/summary` 언제나 200. 리뷰 3개 미만 · LLM 실패면 `{summary: null, reason}`. 리뷰 수가 같으면 캐시. 프롬프트는 글자 단위로 같다 | 20 · 31 · S1~S9 |
| SPA | 파일이 있으면 그 파일, 없으면 index.html(없는 `/assets/*.js` 도) | 21~23 |

헤더는 Spring 의 CORS 지원(`@CrossOrigin` · `CorsRegistry`)을 쓰지 않고 필터 하나(`ApiHeadersFilter`)로 만든다 — 204 · Origin 이 없을 때 `*` 같은 모양이 Spring 기본과 다르다.
목록 쿼리는 SQL 이 아니라 메모리에서 한다(`ListQuery`) — 수십~백여 행이고, JS 문자열 비교 · lodash 정렬 규칙을 SQL 로 흉내 내는 것보다 정확하다. 데이터가 커지면 SQL 로 옮길 자리다.

### 2.1 json-server 에 없던 것 — 검색과 브랜드 목록

홈과 등록·관리의 검색창은 **서버가 거른다** — 프런트가 목록 전체를 받아 거르지 않는다. 기준선은 Node 녹화가 아니라 Spring 녹화(`contract/baseline/spring-search`, Q01~Q24)다.

| 항목 | 동작 | 녹화 |
|---|---|---|
| `search` | shoes 의 **brand · model** 에서 찾는다. 띄어쓰기로 나눈 낱말이 **모두** 있어야 한다(AND, 낱말마다 브랜드든 모델이든). 대소문자 무시 · NFC 정규화, 공백을 뺀 글자로도 맞춘다(`젤카야노` → 젤 카야노 32). 정규식이 아니라 글자 그대로(`.*` · `(` 도 글자) | Q01~Q13 |
| 빈 값 | `search=` · 공백만이면 거르지 않는다 | Q09 · Q10 |
| 다른 조건과 | 필드 필터(`purpose` · `liked` · `brand`) · `_sort`/`_order` · `_start`/`_end`/`_limit`(+ `X-Total-Count` 는 검색 뒤 개수)과 같이 돈다. 순서: `q` → `search` → 필드 필터 → 정렬 → 자르기 | Q14~Q21 |
| 다른 컬렉션 | 검색 필드가 없어 `search` 를 무시한다(reviews · terms) | Q22 |
| `GET /api/brands` | 브랜드 이름 배열 — id 순으로 처음 나온 순서. 검색 결과와 상관없이 전부(관리의 브랜드 칩) | Q24 |
| 전체 개수 | 관리의 "전체 N개"는 `?_limit=0` 의 `X-Total-Count`(목록을 받지 않는다) | Q23 |

기존 계약과의 관계 — 깨지는 곳은 없다. `search` 는 예전에 "어느 문서에도 없는 필드"라 무시되던 파라미터였고, 녹화(01~53)와 예전 프런트는 보내지 않는다. `/api/brands` 는 예전에 404 `{}` 였고 녹화에 없다.
페이지는 아직 없다. 붙일 때는 프런트가 같은 쿼리에 `_start` · `_limit` 을 더하고 `X-Total-Count` 를 읽으면 된다(Q20 · Q21 이 그 모양) — 서버는 그대로다.

### 2.2 로그인(V3) 뒤 — 권한과 서버가 정하는 값

기준선은 `contract/baseline/spring-v3`(R 읽기 · W 쓰기 · A 인증 115건) — Node 기준선(`baseline/node`)은 V3 전 이력이다. 설계는 [AUTH_DESIGN.md](AUTH_DESIGN.md).

| 항목 | 동작 | 녹화 |
|---|---|---|
| 읽기 | 누구나. 신발 `liked` · 리뷰 `liked` 는 **요청한 사람 기준**(비로그인은 false). `?liked=true` 도 그 사람의 찜 | R01~R26 · W03 · W04 · W34b · W52b |
| 쓰기 401 | 토큰 없이 `/api` 쓰기 → 401 `{}` — 대상이 있는지 보기 전에(없는 신발 PATCH 도 401) | W30a · W32a · W40a |
| 404 → 403 | 그 뒤 없는 대상은 404, 있으면 권한 — 신발 쓰기는 admin, 리뷰 PATCH 는 작성자, 리뷰 DELETE 는 작성자 또는 admin | W30b · W34a · W37a · W37b · W40b · W44a · W48a |
| 리뷰 POST | author · userId · createdAt 은 서버(본문 값은 버린다). 한 신발에 첫 리뷰 하나 → 409. 별점 1~5 · 내용 10~1,000자 → 400 | W32 · W32b · W32c |
| 리뷰 PATCH · PUT | PATCH 는 rating · content 만(다른 키는 버린다). PUT 은 405 — 아무 필드나 덮어쓰는 길을 두지 않는다 | W37 · W42a |
| 셈하는 값 | 신발 rating · reviewCount 는 리뷰를 쓸 때 서버가 센다(FIRST 만, 소수 한 자리 반올림). likeCount 는 찜이 센다. 본문에 와도(admin 이어도) 버리고, PUT 도 지우지 않는다 | W30 · W36 · W39 · W42 · W47b |
| 찜 · 공감 | `PUT` · `DELETE /api/shoes/{id}/like` · `/api/reviews/{id}/like` → `{liked, likeCount}`. 멱등. 내 리뷰에는 403 | W34 · W38 · W38a |
| 응답 키 | 리뷰에 `userId` · `reviewType` · `parentReviewId` · `distanceKm` · `proofImageUrl` · `verified` | R02 · R08 … |
| 인증 API | `/api/auth/*` · `/api/me` — 오류 본문만 `{error:{code, field, message}}`. `/api/auth` 는 CORS 헤더가 없다 | A01~A26 |
| 시도 제한 | 같은 계정 15분 실패 5번이면 **맞는 비밀번호도** 429 + `Retry-After` · `{error:{code:"RATE_LIMITED", message, retryAfter}}`. 없는 이메일도 같은 응답 | A27~A38 |
| 조회 기록 | `POST /api/activity` — 로그인한 사람만, 언제나 204(남겼는지 말하지 않는다). 모르는 type 400 · 없는 신발 404 · 본문 `{}` | A39~A43 |

### 2.3 신발 세대 구조(V4) — 로컬 검증만, 운영 미반영(2026-10-24)

기준선은 `contract/baseline/spring-v4`(V 21건 — 새 기능만). 옛 기준선(spring-v3 115건 · v3-search 24 · v3-summary 10)은 **다시 녹화하지 않았다**: diff 가 `--allow-added=<V4 키>`로 "응답에 V4 키가 더해졌을 뿐"인지만 본다(`contract/run-spring-local.sh`). 그래야 무엇이 바뀌었는지 추적이 남는다.

| 항목 | 동작 | 녹화 |
|---|---|---|
| 응답 키 | 신발 끝에 `lineKey` · `generation` · `isCurrent` · `gender` · `weightSize`(공시 무게의 기준 사이즈) · `specSize` · `measuredWeight` · `measuredWeightSize` · `measuredStackHeight` · `measuredDrop` · `measuredSource` · `measuredCount`. 옛 키의 순서 · 값은 그대로 | V01 |
| 목록 | 기본은 **전체 노출**(필터 없음). `?isCurrent=true` · `?isCurrent=false` · `?lineKey=<brand>:<line>`(상세의 이전 · 다음 세대)는 json-server 식 필드 필터로 된다 | V02~V06 · V23 |
| 쓰기 | admin 이 위 키를 POST · PATCH · PUT 으로 보낸다. 타입이 틀리면 400(generation 정수 · isCurrent 불린), gender 는 `men` · `women` · `unisex` 만 | V10 · V13~V15 · V20 |
| 세대 중복 | 같은 `lineKey` · `generation` · `gender` 가 다른 행에 있으면 **409**(id 중복의 json-server 호환 500 과 다르다 — 새 동작). 셋 중 하나라도 null 이면 보지 않는다. 자기 행과 같은 값은 겹침이 아니다 | V11 · V12 · V21 · V22 |
| PUT | 본문에 없는 V4 키는 null(PUT 의미 그대로). 관리 화면은 PATCH 만 써서 지워지지 않는다 | V24 |

### 2.4 가격 메타(V5) — 로컬만, 운영 미반영(2026-10-28)

`price` 는 정가만이다(할인가 · 최저가는 받지 않는다). 기준선은 아직 녹화하지 않았다(계약 녹화는 DB 를 비우므로 적재한 로컬 DB 에서는 돌리지 않았다 — 다음 녹화 때 `--allow-added` 에 아래 세 키를 더한다).

| 항목 | 동작 |
|---|---|
| 응답 키 | 신발 끝(V4 키 뒤)에 `priceSource`(`공식몰` · `ABC마트`, 읽은 곳 기록이 없으면 null) · `priceCheckedAt`(`YYYY-MM-DD`, 읽은 날) · `priceKind`(`정가`) |
| 쓰기 | admin 이 POST · PATCH · PUT 으로 보낸다. 다른 출처 · 종류 문자열이나 날짜 모양이 아니면 400 |

## 3. 일부러 다르게 둔 것 (녹화에 없고 프런트가 쓰지 않는 경우)

| 경우 | 원래 API(json-server) | RUNSHOES |
|---|---|---|
| 모르는 필드(POST · PATCH) | 그대로 저장 · 응답 | 버린다 |
| 타입이 다른 값(숫자 칸에 문자열) | 그대로 저장 | 400 `{}` |
| 없는 신발의 리뷰 | 받는다 | 400 `{}`(FK) |
| PUT 에서 빠진 필드 | 키가 사라진다 | null — NOT NULL 칸이면 500 `{}` |
| POST review 의 createdAt | 받은 값 그대로 | 언제나 서버 시각(V3 — 실사용 후기의 "30일 뒤"가 서버 시각이어야 한다) |
| terms 쓰기 | 받는다 | 405 |
| `_page`(Link) · `_embed` · `_expand` · `/api/db` | 있다 | 없다(무시 또는 404) |
| BASE_PATH 가 있을 때 | `/api` 를 루트와 BASE 아래 양쪽에서 | context-path 아래에서만 |
| `/actuator/health/*` | 없다 | 프로브용 |
| 상태줄 · `Vary` 표기 | `200 OK`, `Origin, Accept-Encoding` | `200`, `origin,accept-encoding`(의미 같음) |

## 4. 코드 위치

`backend/src/main/java/com/kopo17/runshoes/` — `auth/`(SecurityConfig · AuthController · MeController · AuthService · TokenService), `api/`(JsonServerController · BrandController · LikeController · Viewer · Likes · Ratings · ShoeCollection · ReviewCollection · TermCollection · ListQuery · Js · Values),
`config/`(ApiHeadersFilter · JacksonConfig · SpaConfig · BasePathConfig), `summary/`(SummaryService). 스키마 `db/migration/V1__schema.sql` 의 주석에도 같은 근거가 있다.
