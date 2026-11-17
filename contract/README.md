# contract — API 응답 기준선 (Spring 전환 Phase 0)

Node 앱(Express + json-server 0.17.4)이 **실제로** 돌려주는 응답을 녹화해 두고, Spring 구현 뒤 같은 시나리오를 다시 돌려 비교한다.
계획: [docs/archive/SPRING_MIGRATION_PLAN.md](../docs/archive/SPRING_MIGRATION_PLAN.md) Phase 0·2.

```
scenarios.mjs     시나리오 — V3_SCENARIOS(읽기 R · 쓰기 W, 72건) · AUTH_SCENARIOS(인증 · 시도 제한 · 조회 기록 A, 43건) · SUMMARY_V14_SCENARIOS(요약 V14, 23건) · SUMMARY_V3_SCENARIOS(V14 전 요약, 10건 — 이력) · SEARCH_SCENARIOS(검색, 24건) · V4_SCENARIOS(세대 구조, 21건) · V6_SCENARIOS(출처 · 데모 관리자 · 숨김 · 탈퇴 · 품번 · 수정 이력 · 영구 삭제 · V12 와이드 · V13 영어 이름 · 영문 브랜드 검색 · 비교 기록, 98건)
                  V3 전: SCENARIOS(본 녹화, 50건) · SUMMARY_SCENARIOS(요약, 9건) — 이력
record.mjs        시나리오를 차례로 보내 <out>/<id>.json(요청 · 상태코드 · 헤더 전체 · 본문)과 index.json 을 쓴다
diff.mjs          두 녹화를 비교 — PASS/FAIL, FAIL 이 있으면 exit 1
mock-ollama.mjs   고정 응답 Ollama(:3109) — 호출 수 · 실패 모드 · 마지막 프롬프트
baseline/node/          운영 Node 앱 녹화(2026-10-18, 시드 db.json 에서 시작)
baseline/node-summary/  요약 녹화 — 로컬 server.cjs(같은 커밋) + mock-ollama
baseline/spring-search/ 검색 녹화 — json-server 에 없던 기능이라 Spring(2026-10-21, 시드 직후)이 기준선. 굳히기 전 시드로 따로 계산한 기대값과 24건 모두 맞췄다
baseline/spring-v3/         V3(로그인) 뒤 계약 — 지금의 정답. 쓰기는 토큰으로, 401 · 403 · 405 · 409 포함(docs/05_api_contract.md 1-4)
baseline/spring-v3-search/  V3 뒤 검색(작성자 · 8번 신발 · 비로그인 liked)
baseline/spring-v4/         V4(세대 구조) 새 기능만 21건 — 옛 기준선은 다시 녹화하지 않고 diff --allow-added 로 V4 키 추가만 허용(2026-10-24). V5 키(priceSource · priceCheckedAt · priceKind)도 같은 방식(2026-10-29)
baseline/spring-v3-summary/ V3 뒤 요약 — 로그인(S0) 뒤 리뷰를 쓴다. S9 프롬프트는 Node 기준선과 S5 리뷰 한 줄만 다르다.
                        **폐기(V14, 2026-11-10)**: 조회가 Ollama 를 부르고 메모리에 캐시하던 시절의 계약이다. V14 에서 조회가 DB 만 읽게 바뀌어 지금 앱에서는 S2 · S3 · S7 이 FAIL 한다 — 원래 깨져 있던 것이 아니다. 지금의 요약 계약은 spring-v14-summary
baseline/spring-v14-summary/ V14 요약 — 녹화 전에 배치(batch 프로필)를 한 번 돌리고 읽기 · stale · 3건 미만 삭제 · 관리 건수를 녹화. Y90 ~ Y92 는 mock 상태(INFO)
baseline/spring-v6/         V6 뒤 새 기능만 98건 — 옛 기준선은 다시 녹화하지 않고 --allow-added 로 V4 · V5 · V6 · V11 · V12 · V13 키 추가만 허용
run-spring-local.sh     로컬 Spring 을 시드에서 띄워 녹화 · 비교 — v3 | v3-search | v14-summary | v4 | v6 (V14 전: v3-summary) (V3 전: main | summary | search)
```

## 녹화 · 비교

시나리오는 **시드(git `db.json`)에서 시작**해야 한다 — 쓰기가 섞여 있고 앞 단계의 id 를 뒤에서 쓴다(`{{newShoe}}`).

```bash
# Node 기준선 (이미 녹화됨 — 다시 할 일 없음)
node contract/record.mjs --base http://192.168.122.240 --host runshoes.ronanlab.dev --out contract/baseline/node

# Spring — 로컬(빈 MySQL, Flyway 시드 직후)에서 — run-spring-local.sh 는 계약 전용 임시 MySQL(:3309)을 쓴다
node contract/record.mjs --base http://127.0.0.1:3000 --host runshoes.ronanlab.dev --out contract/run/spring
node contract/diff.mjs contract/baseline/node contract/run/spring

# 요약 — Spring 을 OLLAMA_URL=http://127.0.0.1:3109 로 띄우고
node contract/mock-ollama.mjs 3109 &
node contract/record.mjs --base http://127.0.0.1:3000 --set summary --mock http://127.0.0.1:3109 --out contract/run/spring-summary
node contract/diff.mjs contract/baseline/node-summary contract/run/spring-summary

# 검색 — 전부 읽기(시드 상태)
node contract/record.mjs --base http://127.0.0.1:3000 --set search --out contract/run/spring-search
node contract/diff.mjs contract/baseline/spring-search contract/run/spring-search
```

로컬에서는 `contract/run-spring-local.sh [v3|v3-search|v3-summary|v4|v6]` 가 계약 전용 임시 MySQL(`runshoes-mysql-contract` :3309, tmpfs — 개발 DB 가 아니다)을 새로 띄워 시드부터 위를 한 번에 한다.
V3 세트는 로그인해야 하므로 비밀번호를 env(`SEED_USER_PASSWORD` · `ADMIN_PASSWORD`)로 앱과 record.mjs 에 같이 준다 — 스크립트가 매번 새로 만든다(Secret 과 상관없다).
기록에는 비밀번호 · JWT · refresh 쿠키 값을 남기지 않는다(`<가림>` · `<jwt>`). 시나리오의 `expect`(상태코드)가 다르면 record.mjs 가 표시하고 exit 1,
`volatile: ["createdAt"]` · `["retryAfter"]` 은 서버가 그때 정하는 값이라 diff 가 형식(날짜 · 숫자)만 본다.

전환 뒤 운영(MySQL)처럼 쓰기를 되돌리기 어려운 곳에서는 읽기 시나리오(01~26)만 — 양쪽에 `--read-only`(검색 세트는 전부 읽기라 `--set search` 도 그대로 된다 — 운영 데이터가 시드와 같을 때만 PASS):

```bash
node contract/record.mjs --read-only --base http://192.168.122.240 --host runshoes.ronanlab.dev --out contract/run/prod-spring
node contract/diff.mjs --read-only contract/baseline/node contract/run/prod-spring
```

`--host` 는 Host 헤더만 바꾼다(Location 이 이 이름으로 만들어진다 — diff 는 경로만 비교한다).
운영 Pod 에 직접 붙을 때는 MetalLB VIP(ingress-nginx)로 간다. Cloudflare 를 거치면 헤더가 바뀐다.

**GPU 주의**: 시드의 신발은 전부 리뷰가 3개 이상이다 — 운영에서 `/api/shoes/<시드 id>/summary` 를 부르면 Ollama(GPU)가 돈다.
본 녹화에는 Ollama 를 부르지 않는 두 경우(없는 신발, 새로 만든 신발)만 있다. 나머지 요약 동작은 mock-ollama 로.

## diff 정규화

- `createdAt` 은 `Date.parse` 가 같으면 같다 · 숫자는 1e-9 · `liked` 가 없으면 `false` · 객체 키 순서는 보지 않는다
- **배열은 순서까지 본다** — 정렬 동점이 id 오름차순으로 나오는 것도 계약이다
- 헤더는 `content-type`(미디어 타입만) · `location`(경로만) · `cache-control` · `access-control-*` · `x-total-count` 만
- `contract: false`(프런트가 쓰지 않는 json-server 동작)와 HTML 본문 해시는 INFO — FAIL 로 세지 않는다

## 결과

| 대상 | 본 시나리오 | 요약(mock) |
|---|---|---|
| Spring — 로컬 jar(2026-10-18) | PASS 47 · FAIL 0 · INFO 3 | PASS 4 · FAIL 0 · INFO 5 |
| Spring — 이미지 `runshoes:phase4`(2026-10-18) | PASS 47 · FAIL 0 · INFO 3 | PASS 4 · FAIL 0 · INFO 5 |
| Spring — 운영 `41f037451184`, 읽기 전용(2026-10-21) | PASS 23 · FAIL 0 · INFO 3 | — |
| Spring — 로컬 jar, 검색 추가 뒤(2026-10-21) | PASS 47 · FAIL 0 · INFO 3 | PASS 4 · FAIL 0 · INFO 5 · 검색 PASS 24 |
| Spring — 로컬 jar, 로그인 2단계 뒤(2026-10-21) · 기준선 spring-v3 | v3 PASS 95 · FAIL 0 · INFO 3 | v3-summary PASS 5 · INFO 5 · v3-search PASS 24 |
| Spring — 로컬 jar · 이미지, 로그인 3단계 뒤(2026-10-21) · 기준선 spring-v3(115건) | v3 PASS 112 · FAIL 0 · INFO 3 | v3-summary PASS 5 · INFO 5 · v3-search PASS 24 |
| Spring — 로컬 jar, V4 세대 구조 뒤(2026-10-24, 미커밋) · 옛 기준선 + `--allow-added`(V4 키) | v3 PASS 112 · FAIL 0 · INFO 3 | v3-summary PASS 5 · INFO 5 · v3-search PASS 24 · **v4 PASS 21**(기준선 spring-v4) |
| Spring — 로컬 jar, V5 정가 메타 뒤(2026-10-29, 미커밋) · 옛 기준선 + `--allow-added`(V4 키 + `priceSource` · `priceCheckedAt` · `priceKind`) | v3 PASS 112 · FAIL 0 · INFO 3 | v3-summary PASS 5 · INFO 5 · v3-search PASS 24 · **v4 PASS 21** |

3단계 기준선을 굳히기 전: 새 녹화를 **옛 기준선(98건)과 먼저 비교**해 PASS 95 — 3단계가 기존 계약을 바꾸지 않았다. 새 17건(A27~A43)은 기대 상태코드로 확인하고 본문을 읽은 뒤 더했다.

spring-v3 를 굳히기 전 검산: R 26건은 Node 기준선에 의도한 변경(작성자 · #81 · 8번 신발 · 비로그인 liked · 리뷰 새 키)을 입힌 것과 같고(INFO 25 는 #81 로 104),
W · A 는 단계마다 서버가 센 값(평점 · 찜 수 · 공감 수 · cascade · id max+1 · 쿠키 속성)을 따로 확인했다. 검색은 Q15(비로그인 `liked=true` → `[]`)만 달라졌다 — 의도한 변경.

**V10(2026-11-01) — id 를 DB 가 매긴다**: spring-v3 는 PASS 101 · FAIL 11. 그전의 FAIL 9(가입 계정 id 32 → 33 여섯 건 · 신발 21 → 22 세 건)에
**W46 · W47 두 건이 더해졌다** — W44 에서 지운 리뷰 id(106)를 다시 쓰지 않아 107 · 108(의도한 변경, [docs/05_api_contract.md](../docs/05_api_contract.md) 1.1).
v4 21 · v3-search 24 · v3-summary 5 · v6 60 은 그대로. 기준선은 다시 녹화하지 않는다(W51 때와 같이 차이를 여기 적는다).

**탈퇴 뒤 남은 토큰(2026-11-01)**: spring-v6 에 X78b · X78c(남은 토큰으로 내 리뷰 수정 · 삭제 → 401)를 더했다 — 이 둘만 녹화해 기준선에 넣었다(본문 `{}` 확인). v6 PASS 62 · FAIL 0, 나머지 세트는 위와 같다.

**V11(2026-11-01) — 품번 · 수정 이력 · 영구 삭제**: 응답에 `sku` · `updatedAt` · `lastChange` 키가 더해졌다 — 옛 기준선은 다시 녹화하지 않고 허용 키(`V11_KEYS`)로 센다.
spring-v6 에 X100 ~ X115(품번 · 바뀐 칸 · 적재기 제외 · 바뀐 것 없는 저장 · 영구 삭제 409/403/200/404 · 기록)를 녹화해 더했다 — `updatedAt` · `purgedAt` 은 날짜 형식만 본다(diff.mjs).
v6 PASS 78 · v3 101/11(그대로) · v4 21 · v3-search 24 · v3-summary 5.

**V14(2026-11-10) — 요약을 배치로**: 조회는 DB 만 읽는다. 새 세트 spring-v14-summary PASS 20 · INFO 3(mock 상태) — 스크립트가 녹화 중 Ollama 호출이 늘지 않았는지(배치 20 → 그대로) · 배치의 동시 요청 최대 1 을 따로 본다.
v3-summary 는 PASS 2 · FAIL 3(S3 캐시 · S7 LLM 실패 · S2 본문 키) — 조회가 Ollama 를 부르던 계약이라 이력으로 둔다. v6 98 · v3 101/11 · v3-search 24 · v4 21 은 그대로.

**V15(2026-11-10) — 270mm 로 맞춘 무게**: 응답에 `weightNorm270` 이 더해졌다(허용 키 `V15_KEYS` — 시드는 기준 사이즈가 없어 null). spring-v6 에 X136 ~ X146(기준 M10.5 · 무게 300 · M8.5 · 실측 PATCH 는 그대로 · 본문의 weightNorm270 은 버림 · W7.5 → null · M10 · 기준 지우기 → null · 새 신발 POST M9.5 · PUT M9 — lastChange 에 weightNorm270 없음 · 끝 상태)를 녹화해 더했다. 저장 직후 응답의 값이 계수와 같은지 녹화 전에 손으로 셈했다(297 ÷ 1.026³ = 274.988… · 300 × 1.026 = 307.8 · 300 ÷ 1.026² = 284.987… · 280 ÷ 1.026 = 272.904…).
v6 PASS 109 · FAIL 0 · v3 101/11(그대로) · v3-search 24 · v4 21 · v14-summary 20(배치의 `validate` 가 새 컬럼으로도 통과).

**V16(2026-11-10) — 무게 용어 설명**: 무게 용어(`weight`) 설명을 환산 규칙(반 사이즈당 약 2.6%)에 맞췄다. spring-v3 **R03**(terms 전체)이 의도한 FAIL 로 바뀐다 — 다른 칸은 weight 의 description 하나, 용어 13개 · 순서 · id 12 중복은 그대로. v3 PASS 100 · FAIL 12(A06 · A11 · A16 · A20 · A21 · A26 · W46 · W47 · W51 · W52 · W52b · **R03**) · v6 109 · v3-search 24 · v4 21 · v14-summary 20.
V16 첫 가드는 이미 고친 DB 에 다시 치면 `ERROR 1242` 로 멈추는 것을 확인했다(로컬).

**V17 · V18(2026-11-12) — 용어 id · 챗봇 기록**: V17 이 아웃솔 용어의 id 를 12 → 13 으로 — spring-v3 **R03** 을 다시 녹화했다(사용자 승인). 다른 칸은 V16 의 무게 설명 하나, 용어 13개 · 순서는 그대로. V18 의 내부 POST · 관리 GET 은 시나리오에 넣지 않고 손으로 봤다(127.0.0.1 204 · 같은 본문 두 번 204 · 잘못된 kind 400 · 다른 주소 + `X-Forwarded-For: 127.0.0.1` 404 · 비로그인 GET 401 · admin GET 묶음 200). 다른 주소 + XFF 는 쿠버네티스 env(`KUBERNETES_SERVICE_HOST`)를 켜고도 봤다 — 켜면 Spring Boot 가 XFF 로 `remoteAddr` 를 바꿔, `remoteAddr` 를 보던 첫 구현은 204 로 뚫렸다. 지금은 `localAddr` 를 본다.
v3 PASS 101 · FAIL 11(A06 · A11 · A16 · A20 · A21 · A26 · W46 · W47 · W51 · W52 · W52b — 그대로) · v6 116 · v3-search 24 · v4 21. 로컬 개발 DB 를 지우지 않으려고 이번에는 임시 MySQL(tmpfs, :3309)을 시드부터 띄워 같은 순서로 돌렸다.
V17 가드는 이미 고친 DB 에 다시 치면 `ERROR 1242` 로 멈추는 것을 확인했다(로컬).

**예산 금액(2026-11-12, 작업 5-1)**: spring-v6 에 X154 ~ X156(`budget=150000` 200 · `price` 와 함께 400 · `budget=15만원` 400). v6 PASS 119 · v3 101/11(그대로).
**녹화 DB 를 나눴다(2026-11-12 사용자)**: `run-spring-local.sh` 는 이제 계약 전용 임시 MySQL(`runshoes-mysql-contract`, 127.0.0.1:3309, tmpfs)을 매번 새로 띄워 시드부터 녹화하고 끝나면 내린다. 로컬 개발 DB(compose `runshoes-mysql-dev` :3307 — 운영 스냅숏 310켤레)는 지우지도 쓰지도 않는다. 전에는 `docker compose down -v` 로 그 볼륨을 지우고 시작했다.

**작업 3(2026-11-10) — 비교 · 추천 API**: spring-v6 에 X147 ~ X153(compare pick · ids 거르기 · 둘 다 없음 400 · 모르는 pick → cols [] · recommend 다섯 칸 · 모르는 값 400 · 칸 빠짐 400). 여기는 모양 · 상태코드만 — 값이 이관 전 브라우저 계산과 같은지는 `scripts/parity/check.mjs` 가 전수(신발마다 pick · 다섯 켤레씩 ids · 추천 960 조합)로 본다.
v6 PASS 116 · FAIL 0 · v3 100/12(그대로) · v3-search 24 · v4 21 · v14-summary 20.

**작업 3-1(2026-11-10) — 추천: 데이터 없음 중립**: X151 을 다시 녹화했다 — 시드 신발 3(스택 없음)이 쿠션을 못 보고 100/120 이 되어 110/140 인 신발 8 을 앞선다(의도한 변경, `docs/10_recommend.md`). 응답에 `max` · `checked` · `notes` 가 더해졌다. v6 116/0 · v3 100/12 · v3-search 24 · v4 21 · v14-summary 20.

**작업 3-2(2026-11-11) — 예산 상한**: X151 을 다시 녹화했다 — "30만원까지"(mid)에서 18만 · 17만원 신발이 "생각하신 것보다 저렴해요"(안 맞음)에서 "예산에 맞아요"로(의도한 변경, `docs/10_recommend.md` 2-3a).

**작업 3-3(2026-11-11) — 추천 문구 정리**: X151 을 다시 녹화했다 — 세 켤레의 "예산에 맞아요 (189,000원)"가 "예산에 맞아요 (발매가 189,000원)"로. id · 순서 · score · max 는 그대로(의도한 변경, `docs/10_recommend.md` 1-4). v6 116/0 · v3 100/12(그대로) · v3-search 24 · v4 21 · v14-summary 20.

**작업 3-4(2026-11-11) — 예산 배점 20 → 10**: X151 을 다시 녹화했다 — 세 켤레의 score/max 가 120/120 → 110/110 · 130/140 → 120/130 · 120/140 → 110/130. id · 순서 · 문장은 그대로(의도한 변경, `docs/10_recommend.md` 2-3b). v6 116/0 · v3 100/12(그대로) · v3-search 24 · v4 21 · v14-summary 20.

**V12(2026-11-02) — 와이드 범위 · 출처 NOTFOUND**: 응답에 `wideScope` 가 더해졌다(허용 키 `V12_KEYS`). spring-v6 에 X116 ~ X122(국외에만 · 모르는 값 400 · 없음 + NOTFOUND · NOTFOUND 를 다른 칸에 400 · 모르는 코드 400 · 데모 관리자 403 · 끝 상태)를 녹화해 더했다.
같은 날 다시 녹화한 두 건 — X101(품번 오류 문구: 11-01 품번에 `.` `/` 를 허용하며 바뀌었는데 기준선이 옛 문구였다) · X53(출처 코드 오류 문구가 받는 코드 아홉을 모두 알리게). 상태코드는 둘 다 400 그대로.
v6 PASS 85 · FAIL 0.

**비교하기(2026-11-09) — 영문 브랜드 검색 · compare.view 다섯 켤레**: 검색이 brand 의 영문 이름도 본다(`BrandNames`). spring-v6 에 X130 ~ X135(nike · hoka 클리프톤 · new balance · nike 클리프톤 → [] · compare.view 5개 204 · 6개 400)를 녹화해 더했다.
같은 날 X124 · X125(V13 검색)에 `volatile: ["updatedAt"]` 를 붙였다 — 앞 단계 PATCH 시각이 그대로 비교돼 녹화한 날이 아니면 FAIL 이었다(시나리오 · 기준선 둘 다).
v6 PASS 98 · FAIL 0 · v3-search 24 · v4 21 · v3 101/11(그대로).

**관리자 마이페이지 1(2026-11-14) — 리뷰 숨기기(V22)**: `/api/reviews` 의 동작이 바뀐다 — 관리자가 숨긴 리뷰는 공개 목록에서 빠지고 단건 · 도움이 돼요는 404, 신발의 평점 · 리뷰 수에서도 빠진다. 옛 기준선에는 숨긴 리뷰가 없어 차이가 없다(의도한 차이 0건). spring-v6 에 X157 ~ X176(관리 목록 401 · 403 · 데모 관리자 200 · 날짜 400 · 숨기기 403/200/409 · 숨긴 리뷰 단건 404 · 신발 8 목록에서 28 이 빠짐 · 리뷰 수 4 → 3 · 도움이 돼요 404 · 숨긴 목록 · 보이는 리뷰 영구 삭제 409 · 되살리기 200 · 리뷰 수 4 · 다시 되살리기 409 · 영구 삭제 403/200 · 지운 뒤 404)를 녹화해 더했다 — 상태코드 · 본문을 읽고 넣었다. `diff.mjs` 는 `hiddenAt` 을 날짜 키로 본다(volatile 이면 형식만).
v6 PASS 139 · FAIL 0 · v3 101/11(그대로) · v3-search 24 · v4 21 · v14-summary 20.

**관리자 마이페이지 2(2026-11-14) — 회원 목록 · 로그인 잠금 풀기**: spring-v6 에 X177 ~ X191(목록 admin 이메일 검색 · 데모 관리자는 이메일로 못 찾음 · 일반 회원 403 · runner05 틀린 비밀번호 5번 401 · 6번째 429 · 목록에 잠김 · 풀기 데모 관리자 403 · admin 200 · 다시 409 · 맞는 비밀번호 로그인 200 · 없는 계정 404). `diff.mjs` 는 `lastLoginAt` · `lockedUntil` · `withdrawnAt` 도 날짜 키로 본다(시드 계정의 `createdAt` 은 Flyway 가 넣은 때라 volatile).
v6 PASS 154 · FAIL 0. 한 번은 X00(관리자 로그인)부터 줄줄이 401 이 났다 — 같은 이름의 계약 컨테이너(`runshoes-spring-dev` :3200 · `runshoes-mysql-contract` :3309)를 다른 작업이 동시에 띄운 것으로 보고 다시 돌려 통과했다. 계약 시험을 둘이 함께 돌리지 않는 규칙은 정해지지 않음.

**관리자 마이페이지 3(2026-11-14) — 대화 보기**: spring-v6 에 X192 ~ X199(내부 POST 로 턴 둘 204 — 녹화는 127.0.0.1 로 보내 내부 길이 받는다 · 목록 admin 첫 질문 · 데모 관리자 첫 질문 null · 턴 admin 질문 · 답 · 데모 관리자 null · 일반 회원 403 · 없는 대화 404). `startedAt` · `lastAt` 도 날짜 키.
v6 PASS 162 · FAIL 0. 이 덩어리에서도 X00(관리자 로그인 401)부터 줄줄이 실패한 실행이 한 번 더 있었고 다시 돌리면 통과했다 — 두 번 다 94문항 평가가 함께 돌던 때다. 원인은 확인하지 못했다.

**관리자 마이페이지 4(2026-11-14, V23) — 챗봇 문의 처리 상태 · 사전 추가**: `GET /api/admin/chatbot-misses` 의 응답이 배열(최근 200개)에서 `{items, total, page, size}` 로 바뀌었다 — V18 때는 시나리오 없이 손으로 봤던 길이라 기준선 차이는 없다. spring-v6 에 X200 ~ X215(내부 POST · 목록 · 처리함 403 · 사전 추가 403/201/409/400 · `/api/terms` 쓰기 405 그대로 · terms 14개 · 처리함 200 · 처리함 목록 · 같은 이름 새 질문 → 다시 처리 안 함 · 되돌리기 · status 400 · 없는 묶음 404). `decidedAt` 도 날짜 키.
v6 PASS 178 · FAIL 0(X200 ~ X215 를 넣은 뒤).

**관리자 마이페이지 5(2026-11-14) — 실사용 인증**: spring-v6 에 X216 ~ X221(데모 관리자 403 · 불린 아님 400 · 켜기 200 · 공개 리뷰 `verified: true` · 끄기 200 · 없는 리뷰 404). `verifiedAt` 도 날짜 키. 영구 삭제 기록 화면은 이미 있는 `GET /api/admin/shoes/purged`(X113)를 읽어 새 시나리오가 없다.
v6 PASS 184 · FAIL 0 · v3 101/11(그대로) · v3-search 24 · v4 21 · v14-summary 20.

**상세 모달은 숨기기만(2026-11-15 사용자) — 의도한 계약 변경**: admin 도 남의 보이는 리뷰를 `DELETE /api/reviews/{id}` 로 지우지 못한다(403 `{code:"hide_first"}`, 작성자 지우기는 그대로). 옛 기준선 spring-v14-summary 의 Y40 · Y41 · Y43 은 admin 이 남의 리뷰를 지워 신발 8 의 리뷰를 2건으로 줄였다 — 이제 그 길이 403 이라 Y40 · Y41 은 숨기기(`POST /api/admin/reviews/{id}/hide`, 응답 `{id, hiddenAt, summaryStale}`)로, Y43 은 작성자(u1)가 지우기로 바꾸고 Y42(admin 지우기 → 403)를 더해 넷을 다시 녹화했다. 숨긴 리뷰는 세지 않아 Y44(요약 → 리뷰<3) · Y45(total 19) 이후는 옛 기준선 그대로 PASS. spring-v6 에 X222(남의 보이는 리뷰 29 admin 지우기 → 403) · X223(29 그대로). spring-v3 에는 admin 이 리뷰를 지우는 시나리오가 없어 그대로다.
v6 PASS 186 · FAIL 0 · v3 101/11(그대로) · v14-summary 21.

**데모 관리자는 읽기를 다 한다(2026-11-15 사용자) — 의도한 계약 변경**: 회원 목록의 이메일 · 대화 원문을 데모 관리자에게 가리던 것을 풀었다(쓰기 403 은 그대로). 응답에서 `emailHidden` · `textHidden` 키를 뺐다. spring-v6 에서 일곱 건을 다시 녹화했다 — X177 · X186 · X194 · X196(admin, 그 키가 빠짐) · X178(데모 관리자 이메일 검색이 0건에서 1건 · 이메일이 보임) · X195 · X197(데모 관리자 첫 질문 · 질문 · 답이 null 에서 원문으로). 시나리오 이름도 새 동작으로 바꿨다.
v6 PASS 186 · FAIL 0(다시 녹화한 기준선으로).

**관리자 마이페이지 화면 수정(2026-11-15 사용자, V24) — 의도한 계약 변경**: 실사용 인증 API(`POST /api/admin/reviews/{id}/verify`)를 뺐다. X216 은 그 주소가 없는지(admin 404 `{}`), X219 는 공개 리뷰 79 의 `verified: false` 로 바꿔 다시 녹화하고, X217 · X218 · X220 · X221(불린 아님 · 켜기 · 끄기 · 없는 리뷰)은 시나리오와 기준선에서 지웠다. 토큰 없이 그 주소에 POST 하면 보안 설정이 쓰기를 먼저 막아 401 이다. 공개 리뷰의 `verified` 키는 계약 키라 그대로 나간다.
회원 목록 응답에 `years`(가입한 해들)가 더해져 X177 · X178 · X186 을, 챗봇 문의 목록에 `lastDecision` · `lastDecidedAt` · `decidedNote` · 처리 응답에 `note` 가 더해져 X201 · X209 · X210 · X212 · X213 을 다시 녹화했다(그 키만 다르다). 새 시나리오는 X224 ~ X226(가입 연도 2001 → 0개 · 숫자 아님 400 · 범위 밖 400)과 X227 ~ X232(사유 200자 넘음 400 · 글 아님 400 · 무시 + 사유 200 · 같은 이름 새 질문 204 · 다시 처리 안 함인데 전에 무시한 사유가 보임 · 되돌리기는 사유도 비움) — 상태코드 · 본문을 읽고 넣었다.
`diff.mjs`: `lastDecidedAt` 을 날짜 키로, volatile 인 배열은 원소도 형식만 본다(`years` — 시드 계정은 녹화한 해에 생겨 해마다 바뀐다).
v6 PASS 191 · FAIL 0 · v14-summary 21(INFO 3).

**신발 관리 목록을 서버에서 나눔(2026-11-15 사용자)** — 새 관리자 API `GET /api/admin/shoes`. spring-v6 에 X233 ~ X242(데모 관리자 등록순 3개 · counts · gapCounts / 보완 필요 빈 칸 품번 2쪽, 한 줄에 `gaps` / 나이키 · 페가수스 모델명순 ↑ / 숨긴 신발 탭 / 영구 삭제 기록 탭 / 비로그인 401 / 일반 회원 403 / 모르는 탭 400 / 모르는 빈 칸 400 / 한 쪽 101개 400) — 상태코드 · 본문을 읽고 넣었다. 공개 `/api/shoes` 와 옛 `/api/admin/shoes/hidden` · `/purged` 시나리오는 바뀌지 않았다(그대로 PASS).
v6 PASS 201 · FAIL 0.

**관리자 로그인 401 — 증거 남기기(2026-11-17)**: 다른 일 없이 v6 를 65번 돌려 1번 X00 만 401(`INVALID_CREDENTIALS`)이었다(바로 뒤 X01 · X02 는 200, 걸린 시간도 다른 실행과 같은 19초). 같은 조건에 이름 · 포트만 바꿔 200번 더 돌렸을 때는 0번 — 265번 중 1번이고 그때 앱 로그가 없어 원인은 찾지 못했다(`docs/TODO.md`).
`:3200` 에 다른 Spring 을 띄워 두면 준비 확인이 그 앱의 `/readyz` 에 걸려 그 앱을 녹화하는 것은 재현했다 — 그때는 X00 · X01 이 **둘 다** 401 이라 이번과 꼴이 다르다. 그래서 `run-spring-local.sh` 가 이제
- 시작할 때 `:3200` 을 이미 누가 쓰고 있으면 멈춘다
- 90초 안에 준비되지 않으면 녹화하지 않고 실패로 끝낸다(전에는 그대로 녹화했다)
- `ADMIN_PASSWORD` · `SEED_USER_PASSWORD` 를 밖에서 물려받았는지 한 줄 남긴다(값은 내지 않는다)
- X00 이 200 이 아니면(또는 준비 안 됨) 컨테이너를 내리기 전에 `contract/run/spring-<세트>-evidence/` 에 앱 로그 · 관리자 행(해시는 앞 7자 · NULL 여부 · 고친 때 · 마지막 로그인) · 처음 인증 기록 10줄 · X00 응답을 남긴다

다음에 나면 그 폴더의 `SeedPasswords` 줄 시각 · 관리자 행의 `updated_at` · `auth.login.failure` 시각을 견줘 본다.

INFO 24 · 25(필드 필터 · `_limit`)는 기준선과 같다. INFO 26(`/api/db`)은 재현하지 않기로 했다. 요약 S9(mock 이 받은 Ollama 요청 본문 — 프롬프트 글자 단위)도 같다.
계약을 왜 이렇게 맞췄는지는 [docs/05_api_contract.md](../docs/05_api_contract.md).

## 녹화에서 확인한 것 — 계획서와 다른 점

계획서(2026-09-22, 코드를 읽고 쓴 것)와 실제 응답이 다른 곳. Spring 은 **실제 응답**에 맞춘다.

| 항목 | 계획서 | 실제(json-server 0.17.4 + server.cjs) |
| --- | --- | --- |
| `/api/*` `Cache-Control` | `no-store` | **`no-cache`** — server.cjs 가 `no-store` 를 넣어도 `jsonServer.defaults()` 가 덮어쓴다. `/api/shoes/:id/summary` 만 `no-store`(json-server 앞에서 응답) |
| DELETE 응답 본문 | 지운 entity | **`{}`** (200) |
| OPTIONS preflight | 200 | **204**, `Access-Control-Allow-Origin` 은 요청 Origin 을 그대로(`*` 아님), `Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE` |
| 그 외 쿼리 파라미터 | 무시 | 컬렉션에 **있는 필드면 필터한다**(`?brand=호카`). 없는 필드(`junk`)만 무시 — 프런트는 `shoeId` 만 쓰므로 Spring 은 shoeId 만 지원해도 된다(시나리오 24는 INFO) |

그대로 맞은 것: 404 `{}`(없는 id · 비숫자 id · 없는 컬렉션), 정렬 동점 id 순, POST 201 + `Location`(절대 URL) +
`Access-Control-Expose-Headers: Location`, 새 id = max+1(지운 id 를 다시 쓴다 — Spring 은 V10 부터 DB AUTO_INCREMENT 라 리뷰는 다시 쓰지 않는다, 아래), PATCH 는 body 에 있는 키만(null 도 반영),
POST review 응답에 `likeCount` 없음, `createdAt` 은 보낸 문자열 그대로, 요약 캐시(리뷰 수가 같으면 다시 부르지 않음)·실패 시 `reason`.
