> 상태: 운영에서 쓰는 중(2026-11-02, V12). 계약 시험(2026-11-10 로컬, 작업 3): v6 PASS 116 · FAIL 0 · v3 PASS 100 · FAIL 12(의도한 변경, 3절) · v3-search 24 · v4 21 · v14-summary 20(v3-summary 는 V14 전 계약 — 이력). 원천: `backend/…/api` · `auth` · `config` · `contract/`

#### 0. 한 줄 요약

REST API 는 **원래 돌던 json-server API 의 응답을 녹화해 두고 그대로 재현**한 것이다. 그 위에 로그인 · 권한 · 신발 세대 · 출처 같은 새 기능을 **키를 더하는 방식으로만** 얹었다. 정답은 문서가 아니라 녹화본(`contract/baseline/*`)이고, 바꿀 때마다 계약 시험으로 비교한다.

#### 1. 최종 설계

#### 1-1. 엔드포인트

| 경로 | 무엇 | 누가 |
|---|---|---|
| `GET` · `POST` · `PATCH` · `PUT` · `DELETE /api/{shoes,reviews,terms}[/{id}]` | json-server 모양의 컬렉션(`JsonServerController`) | 읽기는 누구나, 쓰기는 1-4 |
| `GET /api/brands` | 브랜드 이름 배열(id 순으로 처음 나온 순서) | 누구나 |
| `GET /api/shoes/{id}/summary` | 리뷰 AI 요약 — DB(`shoe_summaries`, V14)만 읽는다, Ollama 를 부르지 않는다. 만들었으면 `{summary: {positive, negative}, reviewCount, generatedAt}`(다시 만들 차례여도 그대로), 리뷰 3개 미만 · 없는 신발이면 `{summary: null, reason: "리뷰가 3개 미만입니다"}`, 아직 만들지 않았으면 `{summary: null, reason: "요약을 아직 만들지 않았습니다"}`. 만드는 것은 하루 한 번 배치(`09_chatbot_rag.md` 5절) | 누구나 |
| `PUT` · `DELETE /api/{shoes,reviews}/{id}/like` | 찜 · 리뷰 공감 → `{liked, likeCount}`, 멱등 | 로그인 |
| `/api/auth/{signup,login,refresh,logout,demo,demo-accounts,nickname-available}` | 인증 · 체험 로그인(`04_auth.md`) | — |
| `GET` · `DELETE /api/me`, `PATCH /api/me/nickname`, `PUT /api/me/password` | 내 정보 · 탈퇴 · 닉네임 · 비밀번호 | 로그인 |
| `POST /api/activity` | 조회 · 비교 기록(`compare.view` 는 2~5켤레). 기록하면 204(30분 안 같은 기록은 다시 쓰지 않아도 204). type 이 없거나 모르는 값 · `shoeId` 없음 · 2~5켤레 밖은 400, 없는 신발은 404 | 로그인 |
| `GET /api/admin/shoes/hidden` · `POST /api/admin/shoes/{id}/restore` | 숨긴 신발 · 되살리기 | admin(목록은 데모 관리자도) |
| `DELETE /api/admin/shoes/{id}` · `GET /api/admin/shoes/purged` | 영구 삭제(숨긴 신발만) · 영구 삭제 기록 | admin(기록은 데모 관리자도) |
| `GET /api/compare?pick=<id>` · `?ids=<id,…>` | 비교하기 계산(2026-11-10, 작업 3 — 브라우저에서 옮김). `pick` 이면 자동 채우기 `cols:[{id, why}]`(08 1-3)까지, `ids` 는 1~5켤레(숫자 아님 · 모르는 id · 겹침은 버림). 응답 `fields`(칸마다 모집단 `{n, values}` 오름차순 — 그래프 막대용) · `shoes`(칸마다 `{value, order, band, word}`, 무게는 `converted` — 등수를 말할 수 없으면 `value: null` 만). 둘 다 없거나 둘 다 있으면 400 `{}` | 누구나 |
| `GET /api/recommend?purpose=…&width=…&stability=…&cushion=…&price=…` | 추천받기 상위 3 `{results:[{id, score, reasons:[{hit, text}]}]}`(02 1-4). 다섯 칸 모두 화면 선택지 값만(`unknown` · `중립화-outer` 포함), 빠지거나 모르는 값이면 400 `{}`. 이유 문장의 가격은 한국 표기(`199,000원`) | 누구나 |
| `GET /api/admin/summaries` | 리뷰 요약 건수 `{stale, pending, generated, total}`(보이는 신발만) — 읽기만, 화면에서 돌리는 버튼은 없다(V14) | admin · 데모 관리자 |
| 그 밖 | SPA — 파일이 있으면 그 파일, 없으면 `index.html`. `/actuator/health/*` 는 프로브용 | — |

#### 1-2. json-server 와 같게 한 것

| 항목 | 동작 |
|---|---|
| 404 | 없는 id · 비숫자 id(`abc`, `01`) · 없는 컬렉션 · 그 밖의 `/api` 경로 — 본문 `{}` |
| POST | 201, `Location: <요청 URL>/<id>`(절대 URL), `Access-Control-Expose-Headers: Location` |
| PATCH | 본문에 **있는 키만** 바꾼다 — `null` 도 반영(수정 폼이 빈 칸을 null 로 보낸다) |
| PUT | 본문으로 통째로 바꾸고 id 만 남긴다(신발만 — 리뷰 PUT 은 405, 1-4) |
| DELETE | 200 `{}` |
| 정렬 | `_sort` · `_order`(여러 키), lodash `orderBy` — stable(동점은 id 순), 오름차순에서 null 은 뒤 |
| 필터 | 컬렉션에 있는 필드면 필터(`?brand=호카`, 값 여럿은 OR), 없는 필드는 무시. `_ne` · `_lte` · `_gte` · `_like` · `q`. 비교는 JS 문자열(`rating=4` 는 맞고 `4.0` 은 아니다) |
| 자르기 | `_start` · `_end` · `_limit` + `X-Total-Count` |
| 캐시 헤더 | `/api/*` 는 `Cache-Control: no-cache` + `Pragma` + `Expires: -1`, 요약만 `no-store` |
| CORS | `Access-Control-Allow-Origin: *`, `/api` 는 Origin 이 오면 그 값 + `Allow-Credentials: true`. OPTIONS 는 204 |

- 헤더는 Spring CORS 지원 대신 필터 하나(`ApiHeadersFilter`)가 만든다 — 204 · Origin 이 없을 때 `*` 같은 모양이 Spring 기본과 다르다.
- 목록 쿼리는 SQL 이 아니라 메모리에서 한다(`ListQuery`) — JS 문자열 비교 · lodash 정렬을 SQL 로 흉내 내는 것보다 정확하다.
- **검색은 서버가 한다**(json-server 에 없던 것): `search` 는 brand · model · modelEn · modelAlias(V13)에서 낱말마다 AND — brand 는 영문 이름도 같이 본다(`BrandNames`, "nike" · "new balance", 2026-11-09), 대소문자 무시 · NFC, 공백을 뺀 글자로도 맞춘다(`젤카야노` → 젤 카야노 32). 순서는 `q` → `search` → 필드 필터 → 정렬 → 자르기. 관리 화면의 "전체 N개"는 `?_limit=0` 의 `X-Total-Count`.

#### 1-3. 데이터 표현

- **id** — DB 의 AUTO_INCREMENT(V10). 지운 리뷰 id 는 다시 쓰지 않는다. 신발 POST 본문에 id 가 있으면 그 id 를 쓴다(이미 있으면 500 `{}` — json-server 와 같다).
- **숫자** — 스펙 · 가격 · 평점은 DOUBLE. 정수 값은 `300.0` 이 아니라 `300` 으로 낸다(`JacksonConfig`).
- **`createdAt`** — 언제나 `yyyy-MM-dd'T'HH:mm:ss.SSS'Z'`(UTC, ms). 시드의 날짜만인 값은 그날 00:00:00.000Z.
- **null** — 그대로 `null` 로 낸다(전역 NON_NULL 을 쓰지 않는다 — `midsole: null` 이 "정보 없음" 표시의 근거). 예외: 리뷰 `likeCount` 는 값이 없으면 키를 뺀다. `liked` 는 늘 `true/false`.
- **`terms`** — 시드에 `id 12` 가 둘이고 응답도 그대로다. 읽기 전용(쓰기 405).
- 스키마 쪽 이유는 `07_database.md`.

#### 1-4. 로그인 뒤 — 권한과 서버가 정하는 값

- **쓰기 판정 순서: 401 → 404 → 403.** 토큰이 없으면 대상이 있는지 보기 전에 401 `{}`. 그 뒤 없는 대상은 404, 있으면 권한(신발 쓰기 admin · 리뷰 PATCH 작성자 · 리뷰 DELETE 작성자 또는 admin).
- **서버가 정하는 값** — 리뷰의 `author` · `userId` · `createdAt`, 신발의 `rating` · `reviewCount`(FIRST 리뷰만, 소수 한 자리) · `likeCount` · `updatedAt` · `lastChange`. 본문에 와도 버린다 — 신발은 `ShoeCollection.apply` 가 받는 칸만 읽고, 리뷰는 서버가 덮어쓴다(`ReviewCollection`).
- **`liked`** 는 요청한 사람 기준이다(비로그인은 false). `?liked=true` 도 그 사람의 찜.
- 리뷰 POST — 한 신발에 첫 리뷰 하나(409), 별점 1~5 · 내용 10~300자(400). 리뷰 PATCH 는 `rating` · `content` 만, PUT 은 405.
- 데모 관리자(`DEMO_ADMIN`)는 관리 화면을 다 보지만 모든 쓰기 · 찜 · 리뷰가 403 `{code:"demo_admin", message}` — 이 오류만 본문이 있다(화면이 문구를 그대로 띄운다).
- 인증 API(`/api/auth/*` · `/api/me`)의 오류는 `{error:{code, field, message}}`. 로그인 시도 제한(429 + `Retry-After`)은 `04_auth.md`.
- 저장 오류는 DB 제약 이름으로 가른다 — `uk_reviews_user_first_shoe` 409, `uk_shoes_line_generation_gender` 409(숨긴 행과 겹치면 `{code:"hidden_generation"}`), 그 밖(PK 등) 500.

#### 1-5. 신발 문서에 더한 키

옛 키의 순서 · 값은 그대로 두고 **끝에 더한다**.

| 들어온 때 | 키 | 쓰기 검증(400) |
|---|---|---|
| V4 | `lineKey` · `generation` · `isCurrent` · `gender` · `weightSize` · `specSize` · `measuredWeight` · `measuredWeightSize` · `measuredStackHeight` · `measuredDrop` · `measuredSource` · `measuredCount` | generation 정수 · isCurrent 불린 · gender `men` · `women` · `unisex` |
| V5 | `priceSource` · `priceCheckedAt` · `priceKind` | 출처 `공식몰` · `ABC마트` · `다나와` · `크림` · `MAN(직접 확인)`, 종류 `발매가` 하나, 날짜 `YYYY-MM-DD` |
| V6 | `specSources` — `{"weight":{"code":"BITR","url":"…"}, …}` | 코드 BITR · RSG · STORE · PR · WEB · MAN · DB · SX · NOTFOUND. WEB 은 url 필수, NOTFOUND 는 `wideAvailable` 에만 |
| V11 | `sku` · `updatedAt` · `lastChange` | 품번은 영문 · 숫자 · `- . /` · 공백 50자 |
| V12 | `wideScope` | `domestic` · `overseas` |
| V13 | `modelEn` · `modelAlias` | 100자 · 255자까지, 빈 칸은 null. 검색이 두 칸도 본다 |
| V15 | `weightNorm270` | 읽기 전용 — DB 가 공시 무게 · 기준 사이즈로 계산한다(270mm 로 맞춘 값, `01a_catalog_sources.md` 1-3a). 본문에 와도 버리고, 수정 이력(`lastChange`)에 넣지 않는다. 기준이 없거나 다섯 사이즈 밖이면 null |

- 추가 이미지 `images` 는 6장까지.
- 적재기의 요청(`X-Runshoes-Client: loader`)은 `updatedAt` · `lastChange` 를 찍지 않는다. 바뀐 칸이 없는 저장도 찍지 않는다.
- 와이드 "없음"에 출처를 요구하는 것은 **관리 폼이 본다** — 서버가 막으면 옛 계약(W30 · W36 의 `wideAvailable:false`)이 깨진다.

#### 1-6. 일부러 다르게 둔 것

녹화에 없고 프런트가 쓰지 않는 json-server 동작은 따르지 않는다.

| 경우 | json-server | RUNSHOES |
|---|---|---|
| 모르는 필드 | 그대로 저장 · 응답 | 버린다 |
| 타입이 다른 값 | 그대로 저장 | 400 |
| 없는 신발의 리뷰 | 받는다 | 400 |
| PUT 에서 빠진 필드 | 키가 사라진다 | null(NOT NULL 칸이면 500) |
| 리뷰 `createdAt` | 받은 값 | 언제나 서버 시각 |
| 신발 DELETE | 행 · 리뷰를 지운다 | 숨긴다(V8). 영구 삭제는 관리 API 로 따로 |
| `_page` · `_embed` · `_expand` · `/api/db` | 있다 | 없다 |

#### 1-7. 계약 시험

```
contract/scenarios.mjs     시나리오 — 세트마다 요청 · 기대 상태코드 · 다음 단계로 넘길 값({{newShoe}})
contract/record.mjs        시나리오를 차례로 보내 <out>/<id>.json(요청 · 상태 · 헤더 · 본문)을 쓴다
contract/diff.mjs          두 녹화를 비교 — PASS/FAIL, FAIL 이 있으면 exit 1
contract/run-spring-local.sh v3|v3-search|v14-summary|v4|v6   로컬 dev DB 를 지우고 새 jar 로 띄워 녹화 · 비교(v14-summary 는 녹화 전에 배치를 한 번 돌린다)
```

| 기준선 | 건수 | 무엇 |
|---|---|---|
| `baseline/node` · `node-summary` | 50 · 9 | 원래 json-server 앱의 녹화(2026-10-18) — 이력, V3 전 |
| `baseline/spring-search` | 24 | 검색 — json-server 에 없어 Spring 이 기준선(2026-10-21) |
| `baseline/spring-v3` · `spring-v3-search` | 115 · 24 | 로그인 뒤 계약 — 지금의 정답 |
| `baseline/spring-v3-summary` | 10 | 요약을 조회 때 Ollama 로 만들던 계약 — 이력, V14 전 |
| `baseline/spring-v14-summary` | 23 | 요약 V14 — 배치가 만든 것을 읽기 · 쓰기 시점 stale · 3건 미만 삭제 · 관리 건수. 녹화 중 Ollama 호출이 늘지 않는지 · 배치가 하나씩 보냈는지는 스크립트가 본다 |
| `baseline/spring-v4` | 21 | 세대 구조의 새 기능만 |
| `baseline/spring-v6` | 116 | 출처 · 데모 관리자 · 숨김 · 탈퇴 · 품번 · 수정 이력 · 영구 삭제 · 270mm 환산 무게(V15) · 비교 · 추천 API 의 새 기능만 |

- **옛 기준선은 다시 녹화하지 않는다.** diff 가 `--allow-added` 로 "응답에 키가 더해졌을 뿐"인지만 본다(`run-spring-local.sh` 의 `V4_KEYS` · `V5_KEYS` · `V6_KEYS` · `V11_KEYS` · `V12_KEYS` · `V13_KEYS` · `V15_KEYS`). 의도한 차이는 `contract/README.md` "결과"에 건수와 이유를 적는다.
- diff 정규화: `createdAt` · `generatedAt` 은 `Date.parse` 가 같으면 같다 · 숫자는 1e-9 · 객체 키 순서는 보지 않는다 · **배열은 순서까지 본다**(정렬 동점의 id 순도 계약) · `volatile` 값(`updatedAt` · `retryAfter`)은 형식만.
- 기록에 비밀번호 · JWT · refresh 쿠키를 남기지 않는다(`<가림>` · `<jwt>`).
- 운영에는 읽기 시나리오만(`--read-only`). 요약 시나리오(v14-summary)는 녹화 전에 배치를 돌리므로 로컬에서 mock Ollama(`mock-ollama.mjs`)로만 한다. 조회(`/api/shoes/{id}/summary`)는 DB 만 읽어 운영에서 불러도 GPU 를 쓰지 않는다.

#### 2. 왜 이렇게 했나

- **화면을 고치지 않고 백엔드를 바꾸는 것이 목표였다(2026-10-18~21).** 과제 요건은 json-server 였고, 같은 API 계약을 Spring Boot + MySQL 로 구현했다. 문서나 계획서가 아니라 **실제 응답을 녹화해 정답으로** 삼았다 — 계획서(코드를 읽고 쓴 것)가 실제와 다른 곳이 넷 나왔다(3절).
- **이상해 보이는 모양도 계약이다.** DELETE 의 `{}`, OPTIONS 204, 정렬 동점의 id 순은 프런트가 기대는 동작이라 그대로 뒀다. 프런트가 쓰지 않는 json-server 동작(모르는 필드 저장 등)은 안전한 쪽으로 바꿨다(1-6).
- **키를 더하기만 한다.** 화면 · 적재기 · 계약 시험이 옛 키에 기대고 있다. 키를 바꾸거나 빼면 셋이 함께 깨진다. 그래서 와이드 넷도 `wideAvailable` 을 두고 `wideScope` 를 더했다(V12).
- **기준선을 다시 녹화하지 않는다(2026-10-24).** 다시 녹화하면 무엇이 바뀌었는지 추적이 사라진다. 옛 기준선 + 허용 키 + "의도한 차이 목록"이 변경 이력이 된다.
- **서버가 정하는 값은 본문을 믿지 않는다(V3).** 평점 · 찜 수 · 작성자 · 시각을 본문에서 받으면 누구나 바꿀 수 있다. admin 이 보내도 버린다.

#### 3. 시도했던 것들

- **계획서와 실제 응답이 달랐다(2026-10-18).** 계획서는 `/api/*` 를 `no-store`, DELETE 본문을 지운 문서, OPTIONS 를 200, 모르는 쿼리를 무시로 적었다. 녹화해 보니 `no-cache`(server.cjs 의 `no-store` 를 `jsonServer.defaults()` 가 덮어쓴다), `{}`, 204, "있는 필드면 필터"였다. Spring 은 녹화를 따랐다. 계획서는 `archive/SPRING_MIGRATION_PLAN.md`.
- **로컬 검증 PASS 47 → 운영 PASS 23(2026-10-21).** 로컬 jar 와 이미지에서 본 시나리오 PASS 47 · FAIL 0, 전환 직후 운영에서 읽기 전용 PASS 23 · FAIL 0.
- **기준선을 굳히기 전에 옛 기준선과 먼저 비교했다(2026-10-21).** 로그인 3단계의 새 녹화를 옛 기준선(98건)과 비교해 PASS 95 — 기존 계약을 바꾸지 않았음을 확인한 뒤 새 17건(A27~A43)을 기대 상태코드 · 본문을 읽고 더했다.
- **id 가 계약에서 바뀌었다(V10, 2026-11-01).** `max + 1` 이 롤링 배포 중 PK 충돌을 냈다(`07_database.md` 3절). AUTO_INCREMENT 로 바꾸며 "지운 리뷰 id 를 다시 쓴다"는 계약을 의도한 변경으로 받아들였다 — spring-v3 W46 · W47 이 하나씩 커진다.
- **v3 FAIL 이 쌓인 이유(2026-10-30~11-01).** 데모 관리자(V7)가 id 32 를 가져가 계약 가입 계정이 33 이 됐고(A06 · A11 · A16 · A20 · A21 · A26), 신발 삭제가 숨김이 되어 새 신발 id 가 21 → 22(W51 · W52 · W52b), 그리고 V10 의 W46 · W47 — 합계 11건, 모두 의도한 변경이다. V16(2026-11-10)에 무게 용어 설명을 고쳐 R03(terms 전체)이 더해져 12건.
- **값 이름을 바꾼 적이 있다.** 가격 종류 `정가` → `발매가`(2026-10-30 사용자 — 크림 발매가 · 공식몰 · ABC마트 정가를 한 이름으로), 리뷰 내용 상한 1,000 → 300자(2026-10-30), 가격 출처 "직접 확인" → `MAN(직접 확인)`(2026-11-02 — 스펙 출처의 MAN 과 같은 뜻으로).
- **문서를 쓰다 찾은 세 건(2026-11-02).** X101 은 품번 형식에 `.` `/` 를 허용하며(11-01) 오류 문구가 바뀌었는데 기준선을 다시 녹화하지 않아 FAIL 이었다. `SpecSources` 의 코드 오류 문구는 여섯 개만 알렸는데 받는 코드는 아홉이었다. V12 `wideScope` 는 허용 키로 "더해졌을 뿐"만 보고 쓰기 동작은 녹화돼 있지 않았다. 문구를 고치고 X101 · X53 을 다시 녹화했고, X116 ~ X122(국외에만 · 모르는 값 · 없음 + NOTFOUND · NOTFOUND 를 다른 칸에 · 모르는 코드 · 데모 관리자 · 끝 상태)를 더했다 — v6 PASS 85 · FAIL 0.
- **요약 응답에 키를 더했다(V14, 2026-11-10 사용자).** 요약을 조회 때 Ollama 로 만들던 것을 배치로 옮기며 `reviewCount` · `generatedAt` 을 더했고(화면의 "리뷰 N건 기준"), "아직 만들지 않음" reason 이 생겼다. 조회가 Ollama 를 부르지 않으니 spring-v3-summary(캐시 · LLM 실패 시나리오)는 더 맞지 않아 이력으로 두고 spring-v14-summary 를 새로 녹화했다 — 기준선 다시 녹화가 아니라 새 세트다. 프롬프트 문구는 그대로(Y92).
- **탈퇴 뒤 남은 토큰(2026-11-01).** 탈퇴 뒤 남은 access token(15분)으로 자기 리뷰 수정 · 삭제가 통과했다. 어디서나 401 로 고치고 X78b · X78c 를 녹화해 기준선에 더했다.

#### 4. 남은 한계

- **목록은 메모리에서 거른다.** 302켤레 전체를 읽어 거르고 정렬한다. 데이터가 커지면 SQL 로 옮길 자리다.
- **페이지가 없다.** 목록은 한 번에 전부 온다. 서버는 `_start` · `_limit` · `X-Total-Count` 를 이미 지원한다.
- **계약 시험은 로컬 DB 를 지운다.** 적재한 로컬 카탈로그와 같은 DB 를 쓴다 — 돌린 뒤 적재를 다시 해야 한다.

#### 5. 검증 항목

- `contract/run-spring-local.sh v6` · `v3` · `v3-search` · `v4` · `v14-summary` — PASS 와, FAIL 이 `contract/README.md` 의 의도한 차이 목록과 같은지.
- 녹화만 남았을 때: `node contract/diff.mjs --allow-added=<키> contract/baseline/<세트> contract/run/<세트>` — 서버 없이 다시 센다.
- 운영: `node contract/record.mjs --read-only --base http://192.168.122.240 --host runshoes.ronanlab.dev …` 뒤 `diff.mjs --read-only`(운영 데이터가 시드와 같을 때만 PASS 다. 지금 운영은 카탈로그 302켤레가 들어 있어 신발 목록 시나리오는 맞지 않는다 — 2026-10-21 전환 직후의 PASS 23 이 마지막 운영 비교다).

#### 다음에 할 일

- 페이지 나누기(프런트가 `_start` · `_limit` 을 붙이면 된다 — 서버는 그대로).
