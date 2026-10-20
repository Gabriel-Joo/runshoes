# contract — API 응답 기준선 (Spring 전환 Phase 0)

Node 앱(Express + json-server 0.17.4)이 **실제로** 돌려주는 응답을 녹화해 두고, Spring 구현 뒤 같은 시나리오를 다시 돌려 비교한다.
계획: [docs/SPRING_MIGRATION_PLAN.md](../docs/SPRING_MIGRATION_PLAN.md) Phase 0·2.

```
scenarios.mjs     시나리오 — SCENARIOS(본 녹화, 50건) · SUMMARY_SCENARIOS(요약, mock-ollama, 9건) · SEARCH_SCENARIOS(검색, 24건)
record.mjs        시나리오를 차례로 보내 <out>/<id>.json(요청 · 상태코드 · 헤더 전체 · 본문)과 index.json 을 쓴다
diff.mjs          두 녹화를 비교 — PASS/FAIL, FAIL 이 있으면 exit 1
mock-ollama.mjs   고정 응답 Ollama(:3109) — 호출 수 · 실패 모드 · 마지막 프롬프트
baseline/node/          운영 Node 앱 녹화(2026-10-18, 시드 db.json 에서 시작)
baseline/node-summary/  요약 녹화 — 로컬 server.cjs(같은 커밋) + mock-ollama
baseline/spring-search/ 검색 녹화 — json-server 에 없던 기능이라 Spring(2026-10-21, 시드 직후)이 기준선. 굳히기 전 시드로 따로 계산한 기대값과 24건 모두 맞췄다
run-spring-local.sh     로컬 Spring 을 시드에서 띄워 녹화 · 비교 — main | summary | search
```

## 녹화 · 비교

시나리오는 **시드(git `db.json`)에서 시작**해야 한다 — 쓰기가 섞여 있고 앞 단계의 id 를 뒤에서 쓴다(`{{newShoe}}`).

```bash
# Node 기준선 (이미 녹화됨 — 다시 할 일 없음)
node contract/record.mjs --base http://192.168.122.240 --host runshoes.ronanlab.dev --out contract/baseline/node

# Spring — 로컬(compose MySQL, Flyway 시드 직후)에서
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

로컬에서는 `contract/run-spring-local.sh [main|summary|search]` 가 DB 를 시드로 되돌리고 위를 한 번에 한다.

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

INFO 24 · 25(필드 필터 · `_limit`)는 기준선과 같다. INFO 26(`/api/db`)은 재현하지 않기로 했다. 요약 S9(mock 이 받은 Ollama 요청 본문 — 프롬프트 글자 단위)도 같다.
계약을 왜 이렇게 맞췄는지는 [docs/API_CONTRACT.md](../docs/API_CONTRACT.md).

## 녹화에서 확인한 것 — 계획서와 다른 점

계획서(2026-09-22, 코드를 읽고 쓴 것)와 실제 응답이 다른 곳. Spring 은 **실제 응답**에 맞춘다.

| 항목 | 계획서 | 실제(json-server 0.17.4 + server.cjs) |
| --- | --- | --- |
| `/api/*` `Cache-Control` | `no-store` | **`no-cache`** — server.cjs 가 `no-store` 를 넣어도 `jsonServer.defaults()` 가 덮어쓴다. `/api/shoes/:id/summary` 만 `no-store`(json-server 앞에서 응답) |
| DELETE 응답 본문 | 지운 entity | **`{}`** (200) |
| OPTIONS preflight | 200 | **204**, `Access-Control-Allow-Origin` 은 요청 Origin 을 그대로(`*` 아님), `Access-Control-Allow-Methods: GET,HEAD,PUT,PATCH,POST,DELETE` |
| 그 외 쿼리 파라미터 | 무시 | 컬렉션에 **있는 필드면 필터한다**(`?brand=호카`). 없는 필드(`junk`)만 무시 — 프런트는 `shoeId` 만 쓰므로 Spring 은 shoeId 만 지원해도 된다(시나리오 24는 INFO) |

그대로 맞은 것: 404 `{}`(없는 id · 비숫자 id · 없는 컬렉션), 정렬 동점 id 순, POST 201 + `Location`(절대 URL) +
`Access-Control-Expose-Headers: Location`, 새 id = max+1(지운 id 를 다시 쓴다), PATCH 는 body 에 있는 키만(null 도 반영),
POST review 응답에 `likeCount` 없음, `createdAt` 은 보낸 문자열 그대로, 요약 캐시(리뷰 수가 같으면 다시 부르지 않음)·실패 시 `reason`.
