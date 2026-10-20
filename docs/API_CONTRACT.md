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

## 3. 일부러 다르게 둔 것 (녹화에 없고 프런트가 쓰지 않는 경우)

| 경우 | 원래 API(json-server) | RUNSHOES |
|---|---|---|
| 모르는 필드(POST · PATCH) | 그대로 저장 · 응답 | 버린다 |
| 타입이 다른 값(숫자 칸에 문자열) | 그대로 저장 | 400 `{}` |
| 없는 신발의 리뷰 | 받는다 | 400 `{}`(FK) |
| PUT 에서 빠진 필드 | 키가 사라진다 | null — NOT NULL 칸이면 500 `{}` |
| POST review 에 createdAt 없음 | 키 없이 저장 | 지금 시각 |
| terms 쓰기 | 받는다 | 405 |
| `_page`(Link) · `_embed` · `_expand` · `/api/db` | 있다 | 없다(무시 또는 404) |
| BASE_PATH 가 있을 때 | `/api` 를 루트와 BASE 아래 양쪽에서 | context-path 아래에서만 |
| `/actuator/health/*` | 없다 | 프로브용 |
| 상태줄 · `Vary` 표기 | `200 OK`, `Origin, Accept-Encoding` | `200`, `origin,accept-encoding`(의미 같음) |

## 4. 코드 위치

`backend/src/main/java/com/kopo17/runshoes/` — `api/`(JsonServerController · ShoeCollection · ReviewCollection · TermCollection · ListQuery · Js · Values),
`config/`(ApiHeadersFilter · JacksonConfig · SpaConfig · BasePathConfig), `summary/`(SummaryService). 스키마 `db/migration/V1__schema.sql` 의 주석에도 같은 근거가 있다.
