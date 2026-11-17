<!--
다루는 곳: catalog/, db.json, scripts/load-prod.sh, backend/src/main/resources/db/migration/V4__shoe_generations.sql, backend/src/main/resources/db/migration/V5__price_reference.sql, backend/src/main/resources/db/migration/V12__wide_scope.sql, backend/src/main/resources/db/migration/V15__weight_norm_270.sql
읽은 커밋: 606b730
-->
> 상태: 2026-11-17 코드와 맞춰 봄. 운영 310켤레(카탈로그 적재 309 + 시드 1, 2026-11-17 공개 API 로 310 다시 셈), 적재 대상 309 중 현행 167(`catalog/shoes.jsonl` 의 ok, partial). 스펙, 가격, 발볼 규칙 확정. 와이드는 값 넷(V12)으로 전체 재조사를 마쳐 운영에 넣었다(2026-11-02, 1-7). [c:fa31029] [code:catalog/shoes.jsonl] [code:backend/src/main/resources/db/migration/V12__wide_scope.sql:1-8]

#### 0. 한 줄 요약

브랜드 14개, 라인 233개의 **현행 + 직전 1세대**(후보 408행)를, 약관과 robots 가 허락하는 곳에서 **사실 값만** 모으고, 값마다 출처 URL 을 붙이고, 못 구한 값은 기본값으로 메우지 않고 비운다. 사람이 내린 판단은 수집값보다 먼저 적용한다. [code:catalog/decisions.json:2] [code:catalog/build.mjs:223-237]

#### 1. 최종 설계

#### 1-1. 범위(무엇을 넣나)

- **후보 목록** `catalog/candidates.csv`. 세대마다 한 행. 408행, 라인 233, 현행 233, 브랜드 14(2026-11-03 기준, 파일을 세어서). [code:catalog/candidates.csv:1] [c:55e8910]
- **현행 = 국내에서 팔리는 가장 새 세대**(2026-11-01 사용자). 글로벌에 신형이 나와도 국내 미출시면 넣지 않는다(린콘 5 → 린콘 4 가 현행, 엔돌핀 스피드 6 → 5 가 현행). [code:catalog/candidates.csv:150] [code:catalog/candidates.csv:219]
- **라인마다 현행 + 직전 1세대.** 2세대 전은 넣지 않는다. 예외는 리뷰가 붙은 시드(엔돌핀 스피드 4)뿐이다. 지우지 않는다. 직전 세대가 세대 번호로 이어지지 않는 라인은 현행만 둔다(울트라부스트 5, 직전은 번호 없는 울트라부스트 라이트, 3절). [code:catalog/candidates.csv:124]
- **한 행 = 브랜드 + 라인 + 세대(+ 성별).** 어디까지가 같은 신발의 변형이고 어디부터 다른 모델인지(2026-11-03 사용자):
  - **한 행(필드)**: 폭(2E, 4E, 와이드), 색상, 품번, 사이즈 차이. 신발이 같고 공시 스펙과 발매가도 같다. 와이드는 `wideAvailable` 칸이다. [code:catalog/build.mjs:299]
  - **별도 행(별도 `line_key`)**: 공시 스펙(무게, 스택, 드롭)이나 발매가 중 하나라도 다른 판. 방수 멤브레인(GTX, Waterproof), 갑피 구조가 다른 판(케이지 없는 울트라부스트 5X, BOA, Mid 컷). 스펙이 다른 파생(페가수스 트레일)도 다른 라인이다. **판정: 같은 출처가 두 판의 값을 따로 적으면 다른 모델이다.** `(line_key, generation, gender)` 가 UNIQUE 라 이름이 다른 라인 키를 쓴다(`adidas:ultraboost-5x`). [code:backend/src/main/resources/db/migration/V4__shoe_generations.sql:69] [code:catalog/candidates.csv:125]
  - **넣지 않음**: 콜라보, 특별판, 아동. 색만 다르고 스펙은 같다.
  - 지금 별도 행으로 들어간 것은 울트라부스트 5X 하나다. GTX 는 기준만 정했다(3절, `TODO.md`). [code:catalog/candidates.csv:125] [docs:TODO.md]
- **남성 기준.** 여성 행은 보류한다. 여성 스택과 드롭이 허용 출처에 거의 없고, 남성 값을 빌려 오지 않는다.
- **적재 조건**(`build.mjs`, 상태 `ok` 와 `partial` 만 운영에 간다): [code:catalog/build.mjs:369-375]
  - 무게, 드롭, 힐 스택 중 2개 이상, 이미지 1장 이상, 값마다 출처 URL [code:catalog/build.mjs:370-374] [code:catalog/build.mjs:368] [code:catalog/build.mjs:286]
  - 비어도 막지 않는 칸: 발볼, 와이드, 카본, 정가 [code:catalog/build.mjs:361-364] [code:catalog/build.mjs:373-375]
  - 범위 밖(무게 80~400g, 드롭 0~14mm, 스택 10~65mm, 정가 1만~60만 원)이면 `review` [code:catalog/build.mjs:14] [code:catalog/build.mjs:365] [code:catalog/build.mjs:374]
  - 지금: `ok` 195, `partial` 114, `review` 75, `failed` 24(`shoes.jsonl` 408행, 2026-11-10) [code:catalog/build.mjs:371-375] [c:6bef573]

#### 1-2. 수집처(어디서 읽나)

| 구분 | 곳 | 읽는 방법 |
|---|---|---|
| 국내 공식몰(`sources.yaml` fetch 9곳, 호스트 12) | asics.co.kr, nbkorea.com, saucony.co.kr, brooksrunning.co.kr, kor.mizuno.com(+ m.), salomon.co.kr, kr.puma.com, altra.co.kr, merrellkorea.co.kr(www, m., www 없음, 2026-11-15) | 정적 HTML 은 `local/fetch.mjs`, JS 목록은 Playwright(2026-11-01 사용자 승인) [code:catalog/sources.yaml:25-192] <!-- 확인 못 함: 수집기 local/fetch.mjs 와 Playwright 렌더러는 git 에 없다(catalog/local 은 gitignore) --> |
| 해외 공식몰(`sources.yaml` fetch, `scope: specs` 2, 2026-11-09) | saucony.com, usa.mizuno.com(**스펙 칸만**, 1-2a) | `local/fetch.mjs` [code:catalog/sources.yaml:223-232] <!-- 확인 못 함: local/fetch.mjs 가 scope: specs 를 어떻게 다루는지는 git 에 없다 --> |
| 리뷰, 소매, 보도자료, 위키백과(`sources-media.yaml` fetch 11) | BITR(believeintherun), RSG(runningshoesguru), fit2run, weartesters, 브랜드 보도자료 몇 곳, 위키백과 en 과 ko(2026-11-15, 사실만, 1-2b) | `local/fetch.mjs`, **사이트맵 색인에 있는 주소만** [code:catalog/sources-media.yaml:10-270] [code:catalog/audit.mjs:98] [code:catalog/fit2run.mjs:2] [code:catalog/weartesters.mjs:2] |
| 국내 판매처 | ABC마트, GRAND STAGE(같은 a-rt.com) | Playwright(2026-10-28, 11-02 사용자 승인) [code:catalog/audit.mjs:96] [code:catalog/build.mjs:105] |
| 웹 검색 | 검색 결과의 제목과 요약만 | 페이지를 열지 않는다. 브랜드 1곳 또는 비실측 도메인 2곳이 같을 때만 판정 |
| 이미지 | KicksDB(StockX, GOAT) | `01b` [docs:01b_catalog_images.md] [code:catalog/build.mjs:46-48] |
| **열지 않는 곳** | 나이키, 알트라 글로벌, 리닝, 엑스텝, 푸마 미국, 살로몬 글로벌, 호카(약관이 자동 수집 금지, `blocked`), 아디다스, 온, 언더아머, 아식스, 뉴발란스, 브룩스 글로벌, 머렐 미국, 미즈노 EMEA(약관을 못 읽음, 403, 지역 리다이렉트, `unknown`), 국내몰 다른 이름 호스트 5(m.nbkorea.com, pay.nbkorea.com, m.asics.co.kr, asics.co.kr, brooksrunning.co.kr, `unknown`, www 주소로 바꿔 읽는다, 1-2b), 리뷰 매체 20곳(`blocked`), solereview, i-run(실측, `excluded`) | 코드가 거절한다(`fetch.mjs HARD_BLOCK` 과 모드 검사) [code:catalog/sources.yaml:19-273] [code:catalog/sources-media.yaml:55-58] [code:catalog/sources-media.yaml:97-121] [code:catalog/sources-media.yaml:165-166] [code:catalog/sources-media.yaml:208-209] <!-- 확인 못 함: fetch.mjs HARD_BLOCK 과 모드 검사는 catalog/local 에 있어 git 에 없다 --> |

- **요청 예절**(코드가 강제): 호스트마다 5초에 1회, 동시 1개, 우리 UA(`RUNSHOES-catalog/0.1 … +https://runshoes.ronanlab.dev`), robots 의 `*` 와 `$` 까지 해석, 403, 418, 429, 캡차면 그 호스트를 멈춘다. **우회하지 않는다.** Playwright 는 HeadlessChrome UA 뒤에 우리 UA 를 붙인다. 일반 브라우저로 위장하지 않는다. [code:catalog/sources.yaml:11-15] <!-- 확인 못 함: 간격, 동시 1, robots 해석, 멈춤, Playwright UA 를 실제로 강제하는 local/fetch.mjs 는 git 에 없다. sources.yaml 의 user_agent 는 「RUNSHOES-catalog/0.1 (+non-commercial portfolio; contact in README)」라 문서가 적은 꼴과 다르고, 수집기가 실제로 보내는 UA 는 볼 수 없다 -->
- **웹 검색 요약을 근거로 쓸 때는 단위가 붙은 수치나 상표명이 그대로 있어야 한다. 모호한 서술은 쓰지 않는다**(2026-11-06 사용자). "283 g", "10.0 oz", "Heel-to-Toe Drop (mm) 8", "FF Blast Max"는 쓰고, "가벼운 편", "쿠션이 두툼하다"는 쓰지 않는다. 요약은 판단 메모에 「인용」으로 남긴다. 11-06 조사에서 검색 요약만 근거인 칸 139개(무게 91, 미드솔 19, 스택 14, 드롭 9, 카본 5, 와이드 1)는 모두 이 조건을 만족해 그대로 뒀다(목록 `catalog/local/work/linkcheck-20261106/search-summary-fields.csv`). [c:8874ee6] <!-- 확인 못 함: 목록 파일은 catalog/local 에 있어 git 에 없다 -->
- **검색 요약은 스펙 칸에만 쓰고 설명문의 근거로는 쓰지 않는다**(2026-11-15 사용자). 요약은 원문이 아니라 검색 도구가 만든 글이다. 스펙 칸은 위 조건(단위가 붙은 수치, 상표명)이 있어 틀릴 위험이 작고, 설명문은 문장을 쓰는 자리라 요약이 틀리면 글이 틀린다(`01d` 1-5). 스펙 칸은 이 조건대로 두고, 요약을 근거로 한 스펙 칸(운영 출처 WEB 375, 1-8)을 다시 보지 않는다. [docs:01d_catalog_copy.md] (2026-11-15 기준) [c:af920b8]
- **주소를 지어내지 않는다.** 사이트맵, 검색 결과, 그 사이트 안의 링크로 얻은 주소만 연다.
- **글과 사진은 옮기지 않는다.** 저장하는 것은 숫자, 상표명, 상품명, 출처 URL 이다.

#### 1-2a. 칸별로 쓸 수 있는 공식몰(2026-11-09 사용자)

"국내 공식몰"로 묶은 까닭은 **가격과 와이드**다. 둘은 나라마다 다르다. 신발 자체의 사실 값(미드솔, 카본, 스택, 드롭, 무게)은 어느 나라 공식몰에서나 같으므로 **해외 공식몰도 쓴다.**

| 칸 | 국내 공식몰 | 해외 공식몰(상품 페이지) | 메모 |
|---|---|---|---|
| 미드솔, 카본 | 쓴다 | 쓴다 | 상표 표기 그대로 |
| 스택, 드롭 | 쓴다 | 쓴다 | 제조사 발표값. 나라마다 다르면(호카 본디 8 드롭, 검색 요약상 US 와 CA 5, UK 와 AU 4) 사람이 본다 (2026-11-09 기준) [c:2f82602] |
| 무게 | 쓴다. 사이즈 표기 없으면 270mm(M9, 2-7) | 쓴다. 페이지의 사이즈 표기를 따른다. **표기가 없으면 M9(270mm)로 본다**(2026-11-09 사용자, 2-7). 남성 UK 는 +1(UK8 = M9). EU 와 cm 표기는 US 로 바꾸지 않고 메모에 그대로 | M9 가정은 브랜드 공식몰에만. 소매점과 리뷰는 사이즈 불명(`build.mjs`, `KR_MALL` 또는 `sourceCode` STORE) [code:catalog/build.mjs:151] [code:catalog/build.mjs:316-319] |
| 가격 | 쓴다(원화 발매가) | **쓰지 않는다** | 1-5 [code:catalog/build.mjs:92] [code:catalog/build.mjs:103-108] |
| 와이드 | 쓴다, "있음(국내)" | "국외에만 있음"의 근거로만(1-7 그대로) | 국내 판정에는 쓰지 않는다 |

- **약관을 확인한 곳만 연다.** 해외 공식몰도 국내와 같은 기준으로 `sources.yaml` 에 적는다. robots 가 상품 페이지를 막지 않고 약관에 자동 수집 금지가 없으면 `mode: fetch` + `scope: specs`. 약관을 못 읽은 곳(지역 리다이렉트, 403, 봇 차단, JS 렌더링)은 `unknown` 으로 두고 **우회하지 않는다**. 지역 차단으로 못 열리면 쓰지 않는다. [code:catalog/sources.yaml:3-6] [code:catalog/sources.yaml:223-232]
- 2026-11-09 확인(우리 UA 로 robots.txt 와 약관 원문):

  | 곳 | 판정 | 까닭 |
  |---|---|---|
  | saucony.com(미국), usa.mizuno.com | `fetch`(스펙만) | 약관에 자동 수집 금지 없음(복제 제한은 글과 사진, 2-2). robots 가 상품 페이지를 막지 않음 [code:catalog/sources.yaml:223-232] |
  | us.puma.com | `blocked` | 약관 "data mining, robots, scraping … 금지" [code:catalog/sources.yaml:237-238] |
  | salomon.com | `blocked` | 이용약관을 못 찾았고 저작권 페이지가 "any means" 내려받기 금지, 보수적으로 [code:catalog/sources.yaml:243-244] |
  | asics.com, newbalance.com, brooksrunning.com, adidas.com | `unknown` | 우리 UA 에 403 또는 지역 리다이렉트(asics.com 루트 → asics.co.kr) [code:catalog/sources.yaml:256-269] |
  | underarmour.com, on.com | `unknown` | 약관이 JS 렌더링 [code:catalog/sources.yaml:83-84] [code:catalog/sources.yaml:272-273] |
  | merrell.com, emea.mizuno.com | `unknown` | 판매 약관만 읽음(이용약관 미확인) [code:catalog/sources.yaml:248-253] |
  | nike.com, altrarunning.com | `blocked` | 원래 판정 그대로(약관이 자동 수집 금지) [code:catalog/sources.yaml:19-20] [code:catalog/sources.yaml:145-146] |
  | hoka.com | `blocked` | 약관이 scraper 금지(사용자 확인). 우리 UA 로는 봇 차단이라 원문을 직접 받지 못했다 [code:catalog/sources.yaml:46-47] |

- 열지 못하는 해외 공식몰도 **웹 검색 요약**(1-2 표의 조건, 단위가 붙은 수치와 상표명, 브랜드 1곳)으로는 쓴다. 이때도 무게는 요약에 사이즈 표기가 있으면 그 사이즈로, 없으면 M9 로 적는다(1-3). 같은 상품의 다른 나라 페이지가 사이즈를 밝혔으면 그쪽을 따른다. 베이퍼플라이 4 의 나이키 190g 은 미국 페이지가 "Men's US 10", 캐나다가 "UK 9"로 밝혀 M10 이었다(11-09 조사). [c:dde8643]
- 출처 코드는 1-8 그대로 `STORE`(해외 공식몰 상품 페이지도 STORE). [code:catalog/live-fields.mjs:24] [code:catalog/live-fields.mjs:28-34]

#### 1-2b. 약관 기록, 판정마다 근거를 남긴다(2026-11-15 사용자)

판정(`mode`, `caution`)만 있으면 「이 판정이 맞나」 싶을 때 약관을 다시 읽어야 한다. 그래서 수집처마다 아래를 `sources-media.yaml`(`sources.yaml` 도) 항목에 같이 적는다. 2026-11-15 BITR 과 RSG 부터 채웠고, 같은 날 둘째 묶음(점검 세션 451)으로 corp.asics.com, mediahub.puma.com, 위키백과 en 과 ko, merrellkorea.co.kr, m.merrellkorea.co.kr, m.kor.mizuno.com 을 채웠다. 나머지는 아직 판정만 있다. [code:catalog/sources-media.yaml:10-54] [code:catalog/sources-media.yaml:59-96] [code:catalog/sources-media.yaml:125-163] [code:catalog/sources-media.yaml:168-206] [code:catalog/sources-media.yaml:212-288] [code:catalog/sources.yaml:92-126] [code:catalog/sources.yaml:160-211]

| 키 | 내용 |
|---|---|
| `verdict` | 판정 문장(무엇을 읽고 무엇을 쓰나). `mode` 와 `caution` 은 그대로 둔다 [code:catalog/sources-media.yaml:11-13] |
| `basis` | 판정을 나눈 목록. `claim`(판정 한 조각), `kind`(`원문` 또는 `해석`), `why` [code:catalog/sources-media.yaml:14-23] |
| `clauses` | 걸리는 조항. `where`(조항 자리), `supports`(받치는 `basis` 조각), `text`(판정에 꼭 필요한 문장만, 원문 그대로). 걸리는 조항이 없으면 빈 목록과 `clauses_note` [code:catalog/sources-media.yaml:37-54] [code:catalog/sources.yaml:209] |
| `terms`, `terms_version` | 약관 주소, 약관에 적힌 날짜(`sources.yaml` 과 같은 이름) [code:catalog/sources-media.yaml:24-25] |
| `read_at`, `read_by`, `pages` | 읽은 시각(UTC), 누가 어떻게 읽었나, 읽은 주소마다 시각과 HTTP 상태 [code:catalog/sources-media.yaml:26-32] |
| `robots` | 우리에게 걸리는 그룹, 막는 경로, AI 봇 줄이 있는지 [code:catalog/sources-media.yaml:33-36] |
| `read_via` | (`unknown` 다른 이름 호스트에만) 그 호스트는 열지 않고 같은 경로를 이 호스트로 바꿔 읽는다. 값은 바꿔 읽을 호스트 이름 하나(`read_via: www.nbkorea.com`) [code:catalog/sources.yaml:56-63] |

- **해석한 판정은 `kind: 해석`으로 밝히고 무엇을 어떻게 해석했는지 `why`에 쓴다.** 원문 문장에서 바로 나오면 `원문`이다. BITR 의 「수치만」은 원문에 없고 2-2 를 적용해 너그럽게 본 해석이다(원문은 어떤 부분이든 복제와 저장을 막는다). [code:catalog/sources-media.yaml:21-23]
- 「금지 조항이 없다」는 원문을 읽어 확인한 사실이라 `원문`으로 둔다. 그것을 「열어도 된다」로 읽는 것은 2-2 기준이고 `why`에 그렇게 적는다. [code:catalog/sources-media.yaml:15-17]
- **약관 전문은 저장하지 않는다**(2026-11-15 사용자). git 에는 걸리는 조항 인용, 읽은 날, robots 내용만 적는다. 지문(sha256)이나 원문 파일 자리는 적지 않는다. [code:catalog/sources-media.yaml:3]
- **인용은 판정에 꼭 필요한 문장만, 원문 그대로 옮긴다**(2026-11-15 사용자). `basis` 조각마다 그것을 받치는 문장만 둔다. 문장 안을 잘라야 하면 줄인 자리를 「…」로 밝히고 원문 낱말은 바꾸지 않는다. 줄바꿈 없는 공백(U+00A0)만 보통 공백으로 적는다. [code:catalog/sources-media.yaml:37]
- `fetch.mjs` 는 이 파일을 줄 단위로 읽어 `host` 와 `mode` 만 본다. 기록 안에 `host` 나 `mode` 라는 키를 쓰지 않는다. 같은 호스트를 두 번 적으면 뒤 줄이 앞 줄을 덮는다. 한 호스트는 한 항목으로 둔다(2026-11-15 corp.asics.com 의 unknown 줄과 fetch 줄을, 수집기가 쓰던 fetch 하나로 정리했다). [code:catalog/sources.yaml:9] [code:catalog/sources-media.yaml:4] [code:catalog/sources-media.yaml:125-126] [code:catalog/build.mjs:112] <!-- 확인 못 함: 줄 단위로 host, mode 만 읽고 뒤 줄이 앞 줄을 덮는다는 fetch.mjs 동작은 catalog/local 에 있어 git 에 없다 -->
- **위키백과(en, ko)의 「열어도 된다」는 해석이다**(2026-11-15 사용자). 약관 4절의 「approved by the Wikimedia community」를 Robot policy 준수(우리 UA 를 밝힘, robots 를 지킴, 초당 20회 미만)로 읽었다. 글은 CC BY-SA 라 사실만 쓰고 문장은 옮기지 않는다. 이것은 원문이 아니라 우리 기준이다. 매체 목록(`sources-media.yaml`)에 두어 주소는 색인과 검색 결과로 얻은 것만 읽는다. [code:catalog/sources-media.yaml:212-215] [code:catalog/sources-media.yaml:267-270]
- **보도자료의 쓰는 범위**(2026-11-15 사용자): mediahub.puma.com 은 「사실까지」(수치, 발표일, 기술 이름, 겨냥한 러너처럼 평가가 아닌 것, 문장은 옮기지 않는다). 금지 조항이 없고 첫 화면이 editorial and news use 에 풀어 둔 것이 원문이다(우리 용도가 거기 드는지는 해석). corp.asics.com 은 「수치만」 그대로. 원문은 any content 의 이용을 막고, 「수치만」도 2-2 를 적용한 해석이다. [code:catalog/sources-media.yaml:171] [code:catalog/sources-media.yaml:129]
- **국내몰 다른 이름 호스트는 열지 않고 www 주소로 바꿔 읽는다**(2026-11-15 사용자). 약관을 못 읽은 m.nbkorea.com, pay.nbkorea.com(→ www.nbkorea.com), m.asics.co.kr, asics.co.kr(→ www.asics.co.kr), brooksrunning.co.kr(→ www.brooksrunning.co.kr)은 `unknown` 에 `read_via` 를 단다. **수집기는 아직 바꿔 읽지 않는다**(`TODO.md`). 그때까지 이 호스트의 주소는 거절된다. nbkorea.com 은 www.nbkorea.com 으로 301 이라 항목을 두지 않는다. 약관을 읽어 연 다른 이름 호스트(merrellkorea.co.kr, m.merrellkorea.co.kr, m.kor.mizuno.com)는 `fetch` 로 따로 둔다. m.merrellkorea.co.kr 의 `/skin-*/` 아래 상품 주소는 robots 가 막는다. [code:catalog/sources.yaml:31-38] [code:catalog/sources.yaml:56-63] [code:catalog/sources.yaml:78-80] [code:catalog/sources.yaml:92-93] [code:catalog/sources.yaml:160-161] [code:catalog/sources.yaml:190-192] <!-- 확인 못 함: 수집기가 아직 바꿔 읽지 않고 이 호스트 주소를 거절한다는 것은 local/fetch.mjs 동작이라 git 에 없다(sources.yaml:33 주석만 같은 말을 한다) -->
- **기록과 지금이 다른 곳**(2026-11-15 점검): www.asics.co.kr 은 기록상 `fetch` 인데 첫 화면이 NetFunnel 대기열 페이지이고, `fetch.mjs` 는 캡차 낱말이 없어 이것을 정상 페이지로 캐시한다. www.brooksrunning.co.kr 은 기록상 `fetch` 인데 443 연결이 거절된다. 둘 다 `TODO.md`. [code:catalog/sources.yaml:25-26] [code:catalog/sources.yaml:72-73] [docs:TODO.md] <!-- 확인 못 함: fetch.mjs 의 캡차 낱말 검사와 캐시 동작은 git 에 없다, 대기열 페이지와 443 거절은 사이트 쪽 사실 -->
- **다시 읽는 때**(2026-11-15 사용자): 그 출처에서 새 수집 작업을 하기 전, 판정이 의심될 때, 반년마다. 다시 읽기 전에 매번 기계로 먼저 거른다. 약관 페이지를 받아 `terms_version` 날짜와 `clauses` 인용 문구가 그대로인지만 보고, 달라졌을 때만 사람이 다시 읽는다. 거르는 도구는 아직 없다(`TODO.md`). [docs:TODO.md]
- **채우는 곳**(2026-11-15 사용자): 값을 가져오는 곳(`mode: fetch`)만 채운다. `blocked`, `unknown`, `excluded` 는 채우지 않는다. 둘째 묶음 다음으로 남은 fetch 16항목(호스트 15곳, www.saucony.com 이 두 파일에 다 있다)을 몇 번에 나눠 채운다: [code:catalog/sources.yaml:223-224] [code:catalog/sources-media.yaml:164]
  - `sources-media.yaml` 5: www.fit2run.com, weartesters.com, www.newswire.co.kr, www.saucony.com, www.amersports.com [code:catalog/sources-media.yaml:108] [code:catalog/sources-media.yaml:119] [code:catalog/sources-media.yaml:122-124] [code:catalog/sources-media.yaml:164] [code:catalog/sources-media.yaml:207]
  - `sources.yaml` 11: www.asics.co.kr, www.nbkorea.com, saucony.co.kr, www.brooksrunning.co.kr, kor.mizuno.com, salomon.co.kr, kr.puma.com, altra.co.kr, www.merrellkorea.co.kr, www.saucony.com, usa.mizuno.com [code:catalog/sources.yaml:25-26] [code:catalog/sources.yaml:50-51] [code:catalog/sources.yaml:66-67] [code:catalog/sources.yaml:72-73] [code:catalog/sources.yaml:87-88] [code:catalog/sources.yaml:127-140] [code:catalog/sources.yaml:154-155] [code:catalog/sources.yaml:223-232]

#### 1-3. 무게

- **US M9 기준**이다. 값은 `official_weight_g`, 기준 사이즈는 `official_weight_size`(M9, M10, M9.5 …, 출처가 밝히지 않으면 null). [code:backend/src/main/resources/db/migration/V4__shoe_generations.sql:51] [code:backend/src/main/resources/db/migration/V4__shoe_generations.sql:54-55] [code:catalog/build.mjs:265]
- **브랜드 공식몰(국내와 해외 상품 페이지)에 사이즈 표기가 없으면 M9(270mm)로 본다**(국내몰 2026-11-06 → 해외 공식몰까지 2026-11-09 사용자, 까닭은 2-7). 다른 사이즈를 밝힌 곳(US 9.5, 275mm, UK 9 등)은 그 사이즈로 적는다. **소매점과 리뷰는 그대로. 밝히지 않으면 null.** 결정은 공식몰 값을 사이즈 표기가 없어도 M9 로 보고 무게 순위(아래)의 맨 앞 묶음에 두는 것인데, 지금 코드는 사이즈 불명을 맨 뒤에 둔다(`TODO.md`). 사람이 판단에 직접 적은 사이즈(`by: user`)는 그대로 둔다. 운영: M9 169, 사이즈 불명 71, M10 35, M9.5 13, M10.5 8, M8.5 7. [code:catalog/build.mjs:110-118] [code:catalog/build.mjs:316-319] (2026-11-09 기준) [c:dde8643] [code:catalog/fill.mjs:36] [code:catalog/fill.mjs:75-76] <!-- 안 맞음: 결정(2-7)은 사이즈 표기 없는 공식몰 값을 M9 로 보고 맨 앞 묶음, 코드는 fill.mjs:36 이 그 값을 null 로 두고 fill.mjs:75 sizeRank 가 맨 뒤(2)에 둔다. 운영 7켤레가 공식몰 값 대신 BITR 값(2026-11-17 공개 API 로 확인), 148과 163은 resolve_official 사람 판단도 무시(fill.mjs:48 HUMAN 에 없음). 코드가 결정을 어긴 쪽이다(사용자) -->
- oz 만 있으면 ×28.35 반올림. 남성 UK 표기는 +1 해서 US 라벨로 적는다(UK8 = M9). 같은 사이즈의 다른 이름이라 g 값은 그대로다. [code:catalog/audit.mjs:40] [code:catalog/audit.mjs:55] [code:catalog/audit.mjs:66] <!-- 확인 못 함: oz 를 g 로 바꿔 적는 일은 수집 단계(catalog/local)라 git 에 없다, audit.mjs 는 28.35 환산으로 대조만 한다 -->
- **우선순위**: M9 로 확인된 값 → 다른 사이즈로 밝힌 값 → 사이즈 불명, 각 묶음 안에서 국내 공식몰과 보도자료 → BITR 스펙 상자 → fit2run → RSG 상자 → BITR 본문 → RSG 본문(`fill.mjs`). [code:catalog/fill.mjs:24-25] [code:catalog/fill.mjs:62-65] [code:catalog/fill.mjs:74-76]
- **작은 차이는 자동으로 고른다**: 두 기록이 무게만 5g 또는 2% 이내로 다르면 위 순서로 고르고 진 값은 `weight_notes` 에 남긴다(`build.mjs smallWeightGap · weightRank`). [code:catalog/build.mjs:113-119] [code:catalog/build.mjs:137-142]
- **자기모순인 출처는 쓰지 않는다**(같은 글에서 g 와 oz 가 안 맞으면). **사이즈 기준을 확인할 수 없는 큰 차이는 비운다.**
- 실측값은 공시값과 따로 둔다(`measured_*`). 사람이 적은 것만. [code:catalog/build.mjs:256-268] [code:backend/src/main/resources/db/migration/V4__shoe_generations.sql:59-65]
- 기준 사이즈가 다른 무게를 서로 견줄 때는 1-3a 환산 규칙을 쓴다. 위 "5g · 2% 이내 자동 고름"은 **같은 신발의 출처끼리** 값을 고르는 규칙이고, 1-3a 의 8g 은 **다른 신발끼리** 우열을 말하는 규칙이다. 서로 다른 규칙이다.

#### 1-3a. 환산 규칙, 무게를 270mm(M9)로 맞춘다(2026-11-10 사용자)

공시 무게의 기준 사이즈가 신발마다 달라(1-3, M8.5, M9, M9.5, M10, M10.5) 그대로는 줄을 세울 수 없다. 270mm(US M9)로 맞춘 값을 DB 가 계산해 둔다. `shoes.weight_norm_270`(V15 생성 컬럼, API `weightNorm270`). 비교하기의 등수, 그래프, 비슷한 신발과 챗봇이 이 값 하나를 쓴다(`08_compare.md` 1-7, `09_chatbot_rag.md` 1-5절). [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:8-16] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:336] [code:backend/src/main/java/com/kopo17/runshoes/compare/ComparePolicy.java:43] [code:chatbot/facts.py:88-89] [docs:08_compare.md] [docs:09_chatbot_rag.md]

| 기준 | 270mm 로 |
|---|---|
| M8.5(265mm) | × 1.026 [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:11] |
| M9(270mm) | 그대로 [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:12] |
| M9.5(275mm) | ÷ 1.026 [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:13] |
| M10(280mm) | ÷ 1.026² (약 −5.0%) [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:14] |
| M10.5(285mm) | ÷ 1.026³ (약 −7.4%) [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:15] |

- **계수: 반 사이즈당 2.6%.** RunRepeat 실측. 반 사이즈당 중앙값 2.6%, 모델별 1.66~3.60%(300g 신발이면 반 사이즈당 5~10.8g). 측정 범위 US 8~12.5, 러닝화 4종. 출처 https://runrepeat.com/guides/how-much-does-the-weight-vary-across-different-running-shoe-sizes (2026-11-10 사용자 확인). 브랜드, 모델마다 다르게 두지 않는다. 모델별 값이 없다. [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:3] [code:chatbot/facts.py:19] [c:2e05859]
- **공시값에서만 환산한다.** 실측(`measured_weight_g`, 19켤레)은 넣지 않는다. 사이트의 무게는 공시값이고(1-3), 실측은 일부 켤레에만 사람이 적은 값이라 섞으면 한 줄에 두 종류의 값이 놓인다. [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:3] [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:9-16] (2026-11-10 기준) [c:2e05859]
- **기준 사이즈가 없거나 위 다섯 값 밖이면 null(= "기준 모름").** 추측으로 채우지 않는다. 서버는 기준 사이즈 글자를 검사하지 않아(관리 폼이 다섯 값만 고르게 한다) 다른 값이 들어가도 환산값이 null 이 될 뿐이다. 비교에서 빠지는 쪽이 안전한 기본이다. [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:10-16] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:427] [code:src/pages/ShoeForm.tsx:16]
- **반올림하지 않은 값을 둔다.** 화면과 답변이 정수로 반올림하고 "약"을 붙인다. 원값을 먼저, 환산값은 보조로 쓴다("285g(280mm 기준) · 270mm로 약 271g"). [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:4] [code:src/components/compare/CompareTable.tsx:140] [code:chatbot/facts.py:6]
- **8g 규칙, 챗봇에서 적용한다.** 환산 뒤 차이가 8g 미만이면 우열을 말하지 않고 "거의 같은 수준"이라 한다. 계수 2.6% 는 중앙값이고 모델별로 1.66~3.60% 라, 8g 은 그 편차에서 나올 수 있는 오차 범위다. 비교하기 화면은 우열을 단언하는 곳이 없어(표는 숫자, 배지는 전체에서의 위치, 그래프는 순위) 넣지 않았다. 문장으로 결론을 내는 챗봇(`09_chatbot_rag.md` 1-5절)이 쓴다. [code:chatbot/facts.py:19] [code:chatbot/facts.py:247] [docs:09_chatbot_rag.md]
- 생성 컬럼인 까닭: 무게가 바뀌는 길이 셋(관리 화면, 적재기, SQL)이라 따로 저장하면 한 길만 빠뜨려도 어긋난다. [code:backend/src/main/resources/db/migration/V15__weight_norm_270.sql:5]

#### 1-4. 드롭, 스택, 미드솔, 카본

- 드롭과 스택은 **제조사 발표값**이다. 기준 사이즈는 대부분 밝히지 않아 null 로 두고, 사이즈로 보정하지 않는다. 포어풋 스택은 두지 않는다(힐 − 드롭). 셋 다 적힌 출처면 맞는지(±0.5) 본다. [code:catalog/build.mjs:251] [code:backend/src/main/resources/db/migration/V4__shoe_generations.sql:52] [code:catalog/check-forefoot.mjs:1] [code:catalog/check-forefoot.mjs:40]
- 출처끼리 0.5mm 라도 다르면 사람이 본다(무게와 달리 자동으로 고르지 않는다). [code:catalog/build.mjs:137-143] [code:catalog/build.mjs:367] [code:catalog/build.mjs:374]
- 미드솔은 브랜드 상표의 영문 원문(FF Blast Plus, ZoomX). 스펙 상자에서 읽지 않는다(BITR Key Features 는 자유 문장). [code:catalog/fill.mjs:6] [code:catalog/fill.mjs:54-55]
- 카본은 예/아니오라 출처 URL 을 요구하지 않는다(모델과 용도로 거의 정해진다). 비어도 적재를 막지 않는다. [code:catalog/build.mjs:363-364] [code:catalog/build.mjs:373-374] [code:catalog/live-fields.mjs:18]
- **카본은 판(plate) 형태일 때만 true 다**(2026-11-09 사용자, 화면 칸 이름이 "카본 플레이트"다). 카본이 섞인 테, 막대처럼 판이 아닌 구조는 false. 아디제로 아디오스 프로 5 와 아디오스 프로 에보 3 의 EnergyRim(BITR "No rods, no plate under the ball of the foot")을 false 로 바꿨다. 그 구조는 설명문에 이름(EnergyRim)으로 쓴다. 카본이 섞인 고무("carbon rubber" 아웃솔)도 판이 아니다. [code:catalog/decisions.json:3977] [code:catalog/decisions.json:5723]
- **출처가 갈리면, 다수 쪽 근거가 있으면 남기고 flag, 다수가 없으면 비운다**(2026-11-09 사용자).
  - 다수 쪽 값이 근거 조건(1-2)을 채우면 그 값을 남기고 판단에 `flag` 를 단다(사람이 다시 볼 목록에 남는다). 본디 8 드롭 4. 호카 공식 드롭이 나라마다 4, 5 로 갈리지만 다수 쪽 근거가 있어 남겼다(같은 행의 힐 스택은 2026-11-15 사용자가 41mm 로 고쳤다. 9세대 43mm 와 RSG 「9세대가 8세대보다 힐 · 앞발 모두 2mm 더 두껍다」에서). 비우면 숫자 칸이 하나만 남아 적재 조건(1-1)에 걸려 행이 빠진다. 인기 라인을 빼는 것이 더 손해다. [code:catalog/decisions.json:2] [code:catalog/build.mjs:227-228] [code:catalog/build.mjs:369-374]
  - 다수가 없거나 브랜드와 리뷰가 맞서면 비운다(벨로시티 엘리트 2 드롭. 리뷰 2, 언더아머 공식 8). (2026-11-09 기준) [c:e6bdd7d]
  - 실측(Running Warehouse, RunRepeat 등)은 다수를 셀 때 넣지 않는다.
- **다른 판, 다른 모델, 모음 글은 어느 칸에도 쓰지 않는다**(`variant.mjs`). 주소에 라인 이름에 없는 변형 낱말(GRVL, GTX, Hike, Mid, Max, Trail …)이 있거나 `best-…`, `…-vs-…` 글이면 다른 신발이다. [code:catalog/variant.mjs:6] [code:catalog/variant.mjs:16-19] [code:catalog/fill.mjs:100] [code:catalog/audit.mjs:104-106]

#### 1-5. 가격, 발매가(정가)만

- **할인가, 최저가, 쿠폰가는 어디서도 쓰지 않는다.** 출처 순서는 국내 공식몰 → ABC마트(상품 페이지 메인 표시가) → 크림(발매가 표기) → MAN(직접 확인, 공식몰에서 내려간 모델을 관리자가 다른 자료로 확인한 발매가). [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:341-344] [code:catalog/build.mjs:103-108]
- **가격 출처는 발매가를 확인할 수 있는 곳이다**. 공식몰, ABC마트, 크림, 그리고 관리자가 직접 확인한 MAN. 크림은 리셀 플랫폼이지만 상품 페이지에 발매가가 표시된다. 거래가가 아니라 그 발매가를 쓴다(브랜드가 정한 값이라 판매처 가격과 같다). 리뷰, 영상, 기사에 나온 가격은 쓰지 않는다(2026-11-02 사용자). [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:342-344]
- 메타 셋을 같이 둔다(V5): `price_source`, `price_checked_at`(읽은 날), `price_kind`(늘 `발매가`). [code:backend/src/main/resources/db/migration/V5__price_reference.sql:10-13] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:347] [code:catalog/build.mjs:105-106]
- 시드 20켤레 중 ABC 와 공식몰에 없는 것은 사용자가 다나와에서 넣은 값을 `다나와` 로 표시해 둔다(6켤레). [code:catalog/build.mjs:322-325] (2026-11-02 기준) [c:a6bf21e]
- 시드 20켤레의 값은 저장소 맨 위 `db.json`에서 온다. 카탈로그 빌드는 이 켤레들을 다시 수집하지 않고 그 값을 읽는다. [code:catalog/build.mjs:150] [code:catalog/build.mjs:155]
- 운영: 공식몰 76, 크림 51, ABC마트 25, 다나와 5, MAN 1, **빈 칸 145**(2026-11-03, API 에서 세어서). 울트라부스트 5 의 다나와 239,000 은 비웠다(11-03, 다나와의 GTX 출시가와 같았고, 아디다스 국내몰은 약관을 못 읽어 열지 않는다). [c:55e8910] [code:catalog/sources.yaml:41-42]

#### 1-6. 발볼(토박스 너비)

- 발볼은 **토박스 너비**만 뜻한다(V4 `toebox_width`). 미드풋은 끈으로 조절되고, 힐은 발볼과 무관하다. [code:backend/src/main/resources/db/migration/V4__shoe_generations.sql:66-68]
- 근거로 쓰는 곳:

  | 출처 | 근거로 쓰는 조건 | 출처 코드 |
  |---|---|---|
  | BITR, RSG 리뷰 | 그 모델, 세대의 토박스 서술 문장 | BITR, RSG [code:catalog/live-fields.mjs:33] |
  | 웹 검색 | 브랜드 1곳 또는 서로 다른 도메인 2곳 | WEB [code:catalog/live-fields.mjs:35] |
  | **영상 리뷰(유튜브)** | 리뷰어가 그 모델, 세대를 **직접 신어 보고** 토박스를 말한 영상(2026-11-02 사용자, 러닝화 리뷰는 영상으로 하는 사람이 많고, 신어 보고 말하는 것이라 글 리뷰와 다르지 않다) | MAN + 영상 주소 [code:catalog/build.mjs:332] [code:catalog/live-fields.mjs:41] |

  - **영상 리뷰는 발볼에만 쓴다.** 다른 칸, 특히 가격의 근거로는 쓰지 않는다(1-5).
  - **실측 사이트(RunRepeat, RTINGS, RunMorph)는 착용 서술만 1곳으로 센다(2026-11-05 사용자).** 이 사이트들도 직접 신어 보고 쓴다. "토박스가 좁게 느껴진다"는 다른 리뷰와 같은 근거다. **mm 수치와 그 수치로 내린 판정**("73.2mm 로 평균", "측정으로 확인한 좁은 핏")은 쓰지 않는다. 측정과 체감은 기준이 다르다. 처음 50켤레는 실측 사이트를 통째로 세지 않았고(같은 날 오전), 그 행들은 이 규칙으로 다시 봤다. [c:692e931]
  - **웹 근거 판정, 하나의 기준(2026-11-05 사용자).** 착용 서술을 도메인 단위로 센다(실측 사이트의 착용 서술 포함, mm 수치 제외).

    | # | 상황 | 판정 |
    |---|---|---|
    | 1 | 2곳 이상이 같은 방향 | 넣는다 |
    | 2 | 1곳 + 실측(mm)이 같은 방향 | 넣는다 |
    | 3 | 1곳 + 실측 없음 | 넣는다. 반대 근거가 없다는 뜻이다 |
    | 4 | 1곳 + 실측이 반대(넓음 ↔ 좁음) | 비운다 |
    | 5 | 엇갈리지만 다수가 한쪽 | 다수대로 넣는다 |
    | 6 | 엇갈리고 다수 없음 | 비운다 |
    | 7 | 근거 없음 | 비운다 |

    mm 수치는 근거로 세지 않고 2 와 4 의 방향 확인에만 쓴다. "볼륨(높이)이 낮다"는 너비 근거가 아니다.
    **길이와 사이즈 서술도 너비 근거가 아니다**("runs small/short", "size up", "true to size"). 한 문장에 길이와 너비가 섞이면 너비를 직접 말한 마디만 센다. 예: DOR 인피니티 런 3 "normal to snug in width, with a significant taper … This makes the shoe feel slightly short" 는 테이퍼가 짧게 느껴지는 이유라 좁음이 아니라 보통(2026-11-05 사용자).
    **장단점 목록 한 줄은 누가 썼느냐로 가른다**(2026-11-05 사용자).

    | 출처 | 장단점 목록 | 까닭 |
    |---|---|---|
    | RunRepeat, RTINGS | 쓰지 않는다. 본문의 체감 서술만 센다 | 측정 페이지에 붙은 라벨이다. 본문이 측정값으로 "평균"이라 하면서 장점 목록만 "Roomy toe box"면 자기모순이다(인피니티 런 3) |
    | RSG, BITR | 쓴다 | 리뷰어가 직접 신고 쓴 글의 요약이다 |

    RunRepeat 단점 목록이라도 "Toebox can feel a bit cramped" 같은 체감 문장은 라벨이 아니라 서술로 본다(GT-2000 15). 판정은 Claude 가 목록으로 올리고 사용자가 승인한 것만 넣는다(BITR, RSG 리뷰 본문은 1곳이면 된다. 위 표).
- 제외 필터(`toebox-filter.mjs`, 두 근거에 같게): 표 라벨, 비교급("wider than"), 질문, 조건문, 리뷰어 자기 발, 일반론("shoes tend to be"), 앞발 뒤쪽("rear of the forefoot"). 미드솔 바닥 폭("wide forefoot platform")은 문장을 뽑을 때 `extract-fit.mjs` 의 `NOT_FIT` 이 먼저 뺀다. [code:catalog/toebox-filter.mjs:1-12] [code:catalog/toebox-filter.mjs:26] [code:catalog/fill.mjs:100] [code:catalog/extract-fit.mjs:62-64]
- **자동 판정은 하지 않는다.** 후보 문장을 사람이 보는 승인 목록(`catalog/local/width*.csv`)에 올리고, 승인한 것만 `decisions.json` 에 넣는다. [code:catalog/fill.mjs:92-103] [code:catalog/build.mjs:184] [code:catalog/build.mjs:212] <!-- 확인 못 함: 승인 목록 catalog/local/width*.csv 는 git 에 없어, fill.mjs 가 읽는 width.csv 제안값이 모두 승인된 것인지 볼 수 없다 -->
- **이미 들어간 값의 검증은 Claude 가 판단한 값만 한다(2026-11-05 사용자).** 출처 코드가 아니라 **누가 판단했나**로 가른다. 관리 화면에서 고친 값, 사용자가 원문, 영상, 상품 페이지, 후기를 직접 보고 정한 값은 출처 코드가 BITR 이어도 검증하지 않는다. 사람 판단이 먼저다. Claude 제안을 그대로 승인한 값(`width.csv` 제안값 = 승인, 11-02 승인 19, 190 조사 승인)과 `by: claude` 는 검증한다. 가를 수 없으면 목록으로 보이고 사용자가 정한다. [c:3ee1cef]
- 운영(2026-11-06, 310켤레, API 에서 세어서): 넓음 91, 좁음 88, 보통 54, **빈 칸 77**. 빈 칸 190 조사(1 ~ 4차와 실측 재점검)에서 103 을 채웠고(인용과 회차별 결과는 `catalog/local/width-2026-11-05-*.csv`, `width-survey-20261105/`), 이어서 **이미 들어 있던 값 중 Claude 가 판단한 값을 같은 기준으로 검증**했다. 다른 값 11, 비움 24(경계 사례 4 포함, 인피니티 런 3, 글라이드라이드 맥스 1), 근거만 교체 7(사용자 승인, `width-survey-20261105/verify/`). 여기까지 넓음 90, 좁음 78, 보통 34, 빈 칸 108. 그 뒤 사용자가 관리 화면에서 21칸을 정했다(11-06 가져오기 두 번. 첫 번째 18칸: 빈 칸 17 → 좁음 8, 보통 8, 넓음 1. 윈플로 11 보통 → 좁음. 검증에서 비운 젤 큐뮬러스 28, 글라이드라이드 맥스 1, 스피드고트 6, 보메로 17, 메가블라스트 1, 알파플라이 3 포함 / 두 번째 3칸: 졸트 5, 패트리어트 14, 아리시 v4. 빈 칸 → 보통), 같은 날 오후 가져오기에서 11칸을 더 채웠다(빈 칸 → 보통 10, 좁음 1). 사용자가 직접 판단한 값(관리 화면, 영상, 원문 확인)은 검증하지 않는다. [c:eee325e] <!-- 확인 못 함: 인용과 회차별 결과 파일은 catalog/local 에 있어 git 에 없다 -->

#### 1-7. 와이드 모델, 값 넷(V12, 2026-11-02 사용자)

| 화면 | 뜻 | `wideAvailable` | `wideScope` | 출처 |
|---|---|---|---|---|
| 있음(국내) | 국내에서 와이드를 살 수 있다. 공식몰, 판매처, 크림, 병행수입 포함 | true | `domestic` | 찾은 곳 [code:backend/src/main/resources/db/migration/V12__wide_scope.sql:2] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:346] |
| 국외에만 있음 | 해외에만 있고 국내에서는 살 수 없다 | true | `overseas` | 찾은 곳 [code:backend/src/main/resources/db/migration/V12__wide_scope.sql:2] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:346] |
| 없음 | 어디에도 없다. 다섯 단계를 다 찾아도 안 나온다 | false | 없음 | `NOTFOUND`(검색 결과 없음). 데이터에만, 화면에는 출처를 보이지 않는다 [code:catalog/live-fields.mjs:33] [code:src/pages/ShoeForm.tsx:247-248] [code:backend/src/main/resources/db/migration/V12__wide_scope.sql:4] |
| 정보 없음 | 아직 안 찾아봤거나 조사가 막혔다 | null | 없음 | 없음 [code:catalog/build.mjs:346] [code:backend/src/main/resources/db/migration/V12__wide_scope.sql:4] |

- **찾는 순서**: ① KicksDB 캐시(StockX, GOAT 상품명) ② 브랜드 국내 공식몰(Playwright) ③ ABC마트, GRAND STAGE ④ BITR, RSG 리뷰 본문 ⑤ 웹 검색. 국내 근거(②③, 국내 판매처의 웹 검색 결과)가 해외 근거보다 먼저다.
- **국내에서 살 수 있는 곳**(2026-11-06 사용자, "국내 정식 판매"에서 바꿈, 까닭은 2-8): 브랜드 국내 공식몰, ABC마트, GRAND STAGE, 무신사, 코오롱몰, SSG, 롯데온, 29CM, GS샵, 브랜드 한국 사이트(검색 결과로만), **크림, 병행수입 판매자**(국내 재고를 국내에서 보내는 곳). **해외직구, 구매대행(해외에서 보내는 것), 중고는 국내로 보지 않는다**. 직구로는 거의 모든 신발을 살 수 있어 "국외에만 있음"과 가를 수 없다.
- **크림은 직구가 아니다**(2026-11-06 사용자). 크림 물건은 국내 판매자가 올리고, 크림 검수를 거쳐 국내에서 배송된다. 주문하면 국내 재고가 국내 주소로 온다. 직구와 구매대행은 해외 판매처의 물건이 해외에서 들어온다(통관, 해외 배송 기간). 그래서 크림은 "국내에서 살 수 있음"이고 직구는 아니다.
- **크림 발매가 표기도 남긴다**(2026-11-06 사용자). 크림 상품 페이지의 발매가가 원화면 국내 발매, 외화($, £ …)면 해외 발매로 보인다(표본: 젤 카야노 32 4E 199,000원, 2E $165). 와이드 판단 메모에 `크림 발매가: 원화|외화|없음` 을 적어, 나중에 "국내 정식 발매"와 "국내에서 살 수 있음"을 나눌 때 쓴다. [c:d2e5ad9]
- **근거로 쓰는 곳**(2026-11-02 사용자, 11-06 고침), 국내와 해외 같은 기준:

  | 출처 | 근거로 쓰는 조건 |
  |---|---|
  | 브랜드 국내 공식몰 | 목록, 검색 문구만으로도 "있음(국내)". 직영이 확실하다(품절이어도 "와이드가 나온다"는 사실은 맞다) |
  | 무신사, 코오롱몰 | 개별 상품 페이지가 있어야 한다(검색 요약, 브랜드 목록만으로는 쓰지 않는다) |
  | SSG, GS샵, 신세계몰, 오픈마켓 | 국내 판매자(병행수입 포함)인지 확인한다. 해외직구, 구매대행이거나 모르면 쓰지 않는다 |
  | 크림 | 그 와이드 상품(상품명, 품번에 Wide, 2E, 4E)의 상품 페이지가 있으면 "있음(국내)". **사람이 크림 검색 결과를 열어 와이드 상품을 확인했으면 검색 주소를 출처로 써도 된다**(2026-11-06 사용자. 상품 주소가 더 정확하지만, 확인한 사람이 `by: user` 와 MAN 으로 기록되면 충분하다). Claude 는 검색 요약만으로 넣지 않는다. 상품 주소가 나와야 한다 |
  | 해외 리셀(StockX, GOAT), 발매 정보 사이트 | 근거로 쓰지 않는다 |
  | (해외) 브랜드 공식몰, 실제 소매점 | 쓴다 |

- **확실하지 않으면 정보 없음(null)이다**(2026-11-02 사용자). 국내 판매자인지 해외직구 또는 구매대행인지 모르는 상품, 근거가 발매 정보 사이트, 해외 리셀뿐인 것은 "있음"으로도 "국외에만 있음"으로도 넣지 않고 비워 둔다. 비워 둔 것은 사용자가 직접 보고 MAN 으로 넣는다.
- 와이드 = 남성과 남녀공용의 별도 넓은 폭 상품(Wide, 2E, 4E, Extra Wide, SW). 여성 전용, 다른 세대, 변형판의 와이드와 "토박스가 넓다" 같은 착화감 표현은 근거가 아니다.
- 기록: 단계별 검색어와 결과를 `decisions.json` 의 그 행 `wide_available` 판단에 남긴다. [code:catalog/build.mjs:346] [code:catalog/build.mjs:248]
- **재조사 결과**(2026-11-02, 적재 대상 301켤레, 운영 적재와 건조 실행 0건): [c:caecb70]

  | 판정 | 수 | 출처 |
  |---|---|---|
  | 있음(국내) | 67 | 국내 공식몰 상품, 검색 주소(STORE), 무신사 등 상품 페이지(WEB) (2026-11-02 기준) [c:caecb70] |
  | 국외에만 있음 | 73 | 해외 공식몰, 소매점 상품 페이지(WEB) (2026-11-02 기준) [c:caecb70] |
  | 없음 | 156 | `NOTFOUND` (2026-11-02 기준) [c:caecb70] |
  | 정보 없음 | 4 | 사용자가 직접 보고 넣는다. 하이퍼 스피드 5, 젤 펄스 17(발매 정보 사이트와 리셀뿐), 보스턴 12(같은 품번의 "와이드 핏" 설명뿐), 슈퍼노바 솔루션 2(해외 근거 성별 불명) (2026-11-02 기준) [c:caecb70] |

  - 사람 판단 6행은 재조사가 건너뛰었다(01c 1-3 6번). 알파플라이 3(없음)과 있음(국내) 다섯(아디제로 SL 1, 1080 v15, 웨이브 라이더 29, XA 프로 3D V9, 울트라 글라이드 4. 값과 출처는 그대로, 범위만 `domestic`). 여섯 모두 재조사 결과와 같은 방향이었다. [docs:01c_catalog_loader.md] (2026-11-02 기준) [c:caecb70]
  - 운영에서 바뀐 것: 정보 없음 → 없음 154, 있음(범위 없음) → 국내 57 / 국외 54, 정보 없음 → 국외 19 / 국내 9, 있음 → 정보 없음 2(하이퍼 스피드 5, 보스턴 12). **"있음"이 "없음"이 된 신발은 없다.** (2026-11-02 기준) [c:caecb70]
  - **국내에서 뺀 것**(사용자 기준): GS샵, SSG, 신세계몰의 판매자 불명 상품(노바블라스트 5, 인피니티런 4, 레볼루션 7, 다운시프터 12), 무신사 검색 요약뿐(마하 X 3, GT-2000 15), SSG 와 GS샵이 robots.txt 로 막혀 국내를 확인 못 한 것(카야노 32, 님버스 27), 2020년 옛 공식몰 추천 목록(스피드크로스 5) → 해외 근거가 있어 국외에만 있음.
  - **국내로 둔 것**: 브랜드 국내 공식몰 목록과 검색 문구(880 v14, 엘립스 1, 아리시 4, 젤 콘텐드 9, 브룩스 글리세린 22, 고스트 17, 18, 미즈노 웨이브 스카이 8, 9 …), 남녀공용 와이드(울트라 글라이드 4).
  - 사람이 정한 판정(위 사례와 비워 둔 4켤레)은 `by: user` 로 적어 다음 재조사가 건너뛴다. (2026-11-02 기준) [c:caecb70]

#### 1-8. 출처 표시 코드

| 코드 | 뜻 |
|---|---|
| BITR, RSG | 그 모델을 직접 리뷰한 BITR, RSG 페이지 [code:catalog/live-fields.mjs:33] |
| STORE | 브랜드 공식몰의 **상품 페이지**, 국내든 해외든(asics.co.kr, adidas.co.in, saucony.com/CA …, 2026-11-06 사용자) [code:catalog/live-fields.mjs:23-32] [code:catalog/live-fields.mjs:34] |
| PR | 브랜드 보도자료 [code:catalog/live-fields.mjs:34] |
| WEB | 웹 문서, **Claude 가 검색해서 찾은 값**(주소 있음) [code:catalog/live-fields.mjs:35] [code:catalog/live-fields.mjs:41] |
| MAN | 직접 확인, **사람이 보고 넣은 값**(주소를 적는다) [code:catalog/live-fields.mjs:33] [code:catalog/live-fields.mjs:41] [code:catalog/build.mjs:332] |
| DB, SX | 시드의 옛 값, StockX(이미지). 기존 값에만 보인다 [code:catalog/live-fields.mjs:35] |
| NOTFOUND | 검색 결과 없음. 와이드 "없음"에만 [code:catalog/live-fields.mjs:33] [code:src/pages/ShoeForm.tsx:247-248] |

- **STORE 는 브랜드가 직접 운영하는 공식몰의 상품 페이지다(2026-11-06 사용자, 해외 공식몰도 공식몰이다).** 같은 도메인이어도 블로그, 가이드, 도움말, 비교 글은 WEB 이다. 상품 페이지가 아니면 "공식몰에서 확인한 값"이라고 하기 어렵다. 코드는 도메인이 아니라 경로로 가른다(`live-fields.mjs sourceCode`). 판매점과 대리점은 브랜드 이름을 달아도 WEB(stores.brooksrunning.com, 태국 hoka.co.th. 태국 HOKA 는 수입사 REV Edition 이 운영). STORE 주소는 누가 확인했든 STORE 로 나간다(MAN 도). 국내와 해외를 출처 코드로 가르지 않는다. 와이드의 국내와 해외는 `wideScope` 가 갖고, 와이드 판정은 "국내에서 살 수 있나"(1-7)로 가른다. 보도자료 사이트(mediahub.puma, corp.asics, amersports)는 PR. 가격 출처의 "공식몰"(1-5)은 그대로 국내 공식몰이다. 가격은 원화 발매가라서. [code:catalog/live-fields.mjs:23-35] [code:catalog/live-fields.mjs:41] [code:catalog/build.mjs:92] [code:catalog/build.mjs:106]
- WEB 과 MAN 을 가르는 것은 **누가 확인했나**다(2026-11-02 사용자). 판단의 `via`(`web` | `manual`)로 가르고, BITR, RSG, STORE, PR 주소는 누가 확인했든 그 문서 코드로 나간다. [code:catalog/build.mjs:331-333] [code:catalog/live-fields.mjs:41]
- 운영 스펙 출처: BITR 640, WEB 375, RSG 218, STORE 89, MAN 19, PR 11, DB 9, SX 1. (2026-11-02 기준) [c:a6bf21e]

#### 2. 왜 이렇게 했나

#### 2-1. 기본값으로 메우지 않는다

발볼 "보통", 와이드 false, 카본 초안 값을 기본값으로 넣었더니 **결손률이 가려졌다**(얼마나 모르는지가 안 보인다). 그래서 V4 에서 발볼, 와이드, 카본을 NULL 허용으로 바꾸고, 화면은 NULL 을 "정보 없음"으로 보인다. 모르는 것을 모른다고 보이는 것이 "스펙은 빠짐없이"보다 먼저다. [code:backend/src/main/resources/db/migration/V4__shoe_generations.sql:70-76] [code:src/utils/display.ts:1-2]

#### 2-2. 약관은 "사실 값"과 "지재권 정보"를 나눠 읽는다(2026-10-24 사용자)

한국 쇼핑몰 약관 대부분(공정위 표준약관)에 "회사에 지식재산권이 귀속된 정보를 영리 목적으로 이용하지 마라"가 있다. 대상은 글, 사진, 디자인이다. **무게, 드롭, 가격 같은 사실 값은 지재권 대상이 아니다.** 그래서 사실 값만 쓰고 글과 사진은 옮기지 않는다. 다만 세 경우는 쓰지 않는다:
- 사실 값까지 스스로 권리 대상으로 선언한 곳(다나와 판매점 약관 제17조 ① "상품정보 및 가격정보를 포함한 모든 게시물")
- 자동 수집을 직접 금지한 곳(나이키 5조 "데이터 마이닝, 로봇, 스크래핑", 알트라 글로벌, 리닝, 엑스텝, Running Warehouse) [code:catalog/sources.yaml:19-20] [code:catalog/sources.yaml:145-146] [code:catalog/sources.yaml:212-217] [code:catalog/sources-media.yaml:115]
- robots 가 필요한 경로를 막은 곳(무신사, SSG, GS샵은 `User-agent: *` 에 `Disallow: /`. 검색 결과로만 본다)

약관을 못 읽은 곳(봇 방어가 막은 아디다스, 온, 언더아머)은 허용으로 보지 않는다. **정직한 UA 로 못 받는 곳을 위장해서 받지 않는다.** 이 기준은 법률 자문이 아니라 이 프로젝트의 수집 기준이다. [code:catalog/sources.yaml:6] [code:catalog/sources.yaml:41-42] [code:catalog/sources.yaml:83-84] [code:catalog/sources.yaml:150-151]

#### 2-3. 가격은 정가만

할인가는 그날 그 가게의 값이라 내일 바뀌고 다른 곳에선 또 다르다. 비교 사이트의 가격이 "그 신발의 값"이 되려면 어디서 봐도 같은 값이어야 한다. 그래서 정가(발매가)만 쓰고, 어디서 언제 읽었는지를 같이 둔다.

#### 2-4. 실측값은 공시값과 섞지 않는다

리뷰 매체가 직접 잰 값(RunRepeat 실험실, RTINGS, Running Warehouse 자체 측정, Doctors of Running, solereview)은 사이즈와 측정법이 매체마다 달라 공시값과 비교할 수 없다. 공시값 칸에는 제조사 값만 넣고, 실측은 사람이 따로 적은 것만 `measured_*` 에 둔다. 어느 쪽을 화면에 쓸지는 비교 페이지에서 정한다. [code:catalog/build.mjs:256-257] [code:catalog/sources-media.yaml:55-58] [code:catalog/sources-media.yaml:115] [code:catalog/sources-media.yaml:121]

#### 2-5. 현행은 "국내 판매" 기준

이 사이트의 사용자는 국내에서 신발을 사는 사람이다. 글로벌 신형이 국내에 없으면 그 사람이 살 수 있는 가장 새 세대가 현행이다.

#### 2-6. 판단을 사람과 Claude 로 나눠 남긴다

웹 검색 판단은 `via: web, by: claude`, 사람 판단은 `by: user` 로 남긴다. 나중에 "이 값을 누가 왜 넣었나"를 물을 수 있어야 하고, Claude 판단만 골라 다시 볼 수 있어야 한다(지금 판단 칸 1,491개. Claude 웹 검색(claude, web) 618, 관리 화면(admin) 471, 사람(by user, via 없음) 150, 사람 웹 확인(user, web) 111, 직접 확인(manual) 46, 그 밖 95). [code:catalog/decisions.json:2] (2026-11-10 기준) [c:6bef573]

#### 2-7. 공식몰 무게는 사이즈 표기가 없으면 270mm(M9)로 본다(국내몰 2026-11-06, 해외 공식몰 2026-11-09 사용자)

국내 공식몰은 대부분 남성 270mm 상품으로 무게를 적고, 270mm 는 대부분 브랜드에서 US M9 다. 사람이 관리 화면에서 국내몰 무게를 넣을 때도 이 기준으로 M9 를 붙여 왔다. null 로 두면 국내몰 값이 해외의 "사이즈 불명" 값과 같은 순위로 밀리고(1-3 우선순위), 같은 신발을 M9 끼리 비교할 수 없다. 모든 브랜드가 그렇다고 확인한 것은 아니라서, 다른 사이즈를 밝힌 곳은 그 사이즈를 따른다. 바꿀 때 영향받는 카탈로그 행은 4개(GT-2000 15, 글라이드라이드 맥스 2, 860 v15, 에어로 글라이드 4)였다. [code:catalog/build.mjs:316-319] (2026-11-06 기준) [c:dde8643]

**해외 공식몰로 넓혔다(2026-11-09 사용자).** 880 v14 는 뉴발란스 호주 공식몰이 사이즈 표기 없이 270g(9.5 oz)이고, RSG 는 "9.5 oz for men's size 9" 다. 같은 값이다. 브랜드가 대표 사이즈로 M9 를 쓰는 것이 해외몰에서도 확인되어, 국내와 해외를 가리지 않고 **브랜드 공식몰**이면 표기가 없을 때 M9 로 본다. 소매점과 리뷰는 넓히지 않는다(사이즈를 밝히지 않으면 어느 사이즈인지 알 길이 없다). 이때 Claude 가 웹 검색 판단에 "사이즈 불명"으로 적어 둔 공식몰 무게 8칸(젤 트라부코 13, 젤 콘텐드 9, 젤 익사이트 11, GT-4000 4, 트라부코 맥스 5, 다이나블라스트 6, 후지 라이트 6, 슈퍼노바 이즈 2)도 M9 가 됐다. 같은 날 880 v15 를 호주 공식몰 304g(M9)으로 바꿨다(관리 화면 299 대신, 공식몰 우선, 사용자). [code:catalog/build.mjs:316-319] [c:dde8643]

#### 2-8. 와이드 "있음(국내)"은 국내에서 살 수 있느냐다(2026-11-06 사용자)

사용자가 알고 싶은 것은 정식 수입 여부가 아니라 이 신발의 와이드를 국내에서 살 수 있느냐다. 그래서 크림과 병행수입도 "있음(국내)"으로 본다(11-02 정의는 "국내 정식 판매"였다). 해외직구는 넣지 않는다. 직구로는 거의 다 살 수 있어 "국외에만 있음"이 뜻을 잃는다. 바꾸기 전에 사용자가 크림을 근거로 넣은 3켤레(마하 X 2, 졸트 5, 520 v9)는 그대로 맞다. (2026-11-06 기준) [c:98547f9]

#### 3. 시도했던 것들

- **수집처 후보를 하나씩 뺐다(2026-10-21 ~ 10-29).**
  - 다나와: robots 가 목록 넘기기를 막고, 판매점 약관이 가격정보를 저작물로 선언 → 뺐다. 시드 20켤레는 사용자가 다나와를 보며 **손으로** 채운 값이었다. [code:catalog/build.mjs:150]
  - 네이버 쇼핑 검색 API: 2026-07-31 종료. 쿠팡 파트너스 API: 최종 승인이 있어야 하고 판매가로 보여 뺐다.
  - 크림: 이미지로 봤을 때는 CDN 이 외부 Referer 에 403, 약관이 이미지 권리를 회사에 둠. 발매가로 다시 봤을 때(10-29)는 약관에 자동 수집 금지는 없었지만 **서버가 비브라우저 접속에 HTTP 500(빈 본문)**. Playwright 도 500 이라 차단 신호로 보고 멈췄다. 브라우저로 위장하지 않았다. 지금 크림 가격 26칸은 관리 화면에서 사람이 넣은 값이다. (2026-11-02 기준) [c:a6bf21e]
  - Running Warehouse: 약관이 수동 추출까지 금지. RunRepeat: 유료 상업 라이선스. [code:catalog/sources-media.yaml:115-116]
- **"참고가로 통일"을 하루 만에 취소했다(2026-10-28).** 웹 검색 100행 시험에서 다나와 공식판매처 23%, 쿠팡 0% 만 나왔고, 값이 최저가(할인가)라 정가 기준과 맞지 않았다. [c:a6bf21e]
- **ABC마트는 처음에 쓰지 않았다가(10-24) Playwright 로 쓰게 됐다(10-28).** 목록이 JS 렌더링이라 주소를 얻을 길이 없었다. 렌더링은 차단을 넘는 것이 아니라 공개 페이지를 읽는 방식이라 같은 조건(우리 UA, 5초, 차단이면 중단)으로 승인받았다. 정가 빈 칸 13행을 채웠다. ABC마트의 "사이즈 추천 통계"는 시험 11행이 전부 "보통"이라 발볼 근거로 쓰지 않았다. [code:catalog/audit.mjs:96] [c:a6bf21e]
- **기존 DB 값 상당수가 Running Warehouse 실측이었다(10-23).** 보스턴 13 스택 37, 베이퍼플라이 4 무게 167 등이 Running Warehouse 가 직접 잰 값과 같았다. "DB 값이 Running Warehouse 값과 같으면 실측으로 본다"를 규칙으로 두고, 공식값이 확인된 칸만 남겼다. [c:a6bf21e]
- **solereview 를 소스에서 뺐다(10-23).** 반 켤레를 직접 달고 스택도 재는 실측이라 공시값이 아니다. 거기서 온 값을 지우고 다른 출처로 채웠다. [code:catalog/build.mjs:77-91] [code:catalog/sources-media.yaml:55-58]
- **와이드 true 17건이 오염됐었다(10-23).** "2E", "와이드" 낱말만으로 잡았더니 몰 메뉴("옴니9 와이드"가 사우코니 12행에), 리뷰어 자기 신발("my 10.5 2E"), 부정문("doesn't come in a wide version", 정반대 뜻), 독자 댓글이 들어왔다. 그 모델, 세대 리뷰 본문만, 댓글 앞까지 읽게 바꿨다. [code:catalog/extract-fit.mjs:29-31] [code:catalog/extract-fit.mjs:46] [c:a6bf21e]
- **국내몰에 없다는 이유로 넣었던 와이드 false 23행을 비웠다(10-24 사용자 정정).** 웨이브 라이더 29 는 국내몰에 와이드가 없었지만 미즈노 미국 공식몰에 2E 가 있었다. 국내 라인업은 글로벌의 일부라 "국내몰에 없음"은 "없음"의 근거가 아니었다. [code:catalog/build.mjs:198-199] [c:a6bf21e]
- **와이드를 둘에서 넷으로 나눴다(11-02 사용자).** "침묵으로 없음을 증명하지 않는다" 규칙 때문에 185켤레가 비어 있었다. 사용자 판단: 다섯 단계를 다 찾아도 안 나오면 실제로 없을 가능성이 높다 → "없음"으로 본다. 대신 10-24 의 문제(국내에 없을 뿐인 것)는 **"국외에만 있음"이라는 값으로 따로 담는다.** 이 결정 직전의 조사에서 웨이브 라이더 29 는 국내몰에 "WAVE RIDER 29 SW"(슈퍼 와이드)가 새로 올라와 있었다. 국내 사정은 바뀐다. [code:backend/src/main/resources/db/migration/V12__wide_scope.sql:1-4] [c:a6bf21e]
- **국내몰 "사이즈 옵션"으로 와이드를 가리려다 그만뒀다(11-02).** 아식스 국내몰의 사이즈 칸은 mm 만 있고, 와이드는 별도 품번 상품으로 판다. "표준만 있으면 없음"으로 읽으면 아식스 전부가 틀린 "없음"이 된다. 여섯 브랜드 71켤레를 Playwright 로 다시 본 결과 새로 찾은 와이드는 0건이었다. 뉴발란스 국내몰은 "퓨어셀", "SC" 처럼 표기가 다르고 검색이 여러 낱말과 품번을 못 찾았다. [c:a6bf21e]
- **StockX 품번으로 와이드를 찾으려다(11-02)** 캐시 전체에 남성 와이드 상품이 14개뿐이라는 것을 알았다(되팔이 시장이라 와이드가 드물다). 새로 알게 된 것은 아디제로 SL 1 하나였다. [c:a6bf21e]
- **발볼, RSG 정형 칸을 쓰지 않기로 했다(11-02).** RSG 페이지의 "Our tester's take … Toebox Normal/Wide/Tight" 칸으로 78켤레를 채울 수 있었지만, 이미 발볼이 있는 49켤레와 **41% 만 일치**했고 값의 75% 가 Normal 이었다(기본값처럼 쓰인 칸). 10-24 에 뺀 "표 라벨"과 같은 것이다. 대신 리뷰 본문 문장 37켤레를 사람이 읽고 승인한 19켤레만 넣었다. 자동 판정은 "loose toebox"를 "tight" 낱말 때문에 좁음으로, "roomy 를 원하면 실망"을 넓음으로 읽는 등 틀린 것이 많았다. [code:catalog/extract-fit.mjs:28] [c:a6bf21e]
- **입문 라인을 되살렸다(10-24 사용자).** "허용 매체에 리뷰가 없다"는 이유로 입문 17라인을 뺐었는데, 국내에서 많이 팔리는 모델이 통째로 빠지면 안 된다는 판단으로 되살렸다(33행). 스펙은 웹 검색으로 채웠다. [c:a6bf21e]
- **트레일을 78라인에서 50으로 줄였다(10-21).** 세대 추정이 약한 것, 하이킹 겸용, S/LAB 판, 브랜드 안에서 겹치는 성격 순으로 뺐다. [c:a6bf21e]
- **울트라부스트 5X 를 별도 행으로 넣었다(11-03 사용자).** 5 와 같은 세대(2024-07)에 함께 나온 케이지 없는 판으로, BITR 이 5X 를 따로 리뷰해 M9 275g, 38/28mm 를 적었다(5 는 아디다스 페이지 292g UK 8.5). 세대 숫자가 이름에 붙어 있어 `adidas:ultraboost-5x` 라인의 1세대로 두었다. 국내 공식몰에 5 와 5X 가 함께 있다(IH3110, IH3103). 같은 날 울트라부스트 5 의 사진을 5 로 확인된 두 장(ID8818, JH9633)만 남겼다. StockX 는 5 와 5X 를 같은 "Ultra Boost 5" 로 묶어 나머지 넷이 어느 판인지 가릴 수 없었다. [code:catalog/candidates.csv:125] [c:55e8910]
- **울트라부스트 4 후보를 뺐다(11-03 사용자).** 직전 세대 자리의 FY9120 은 2017~18년 `Ultra Boost 4.0 DNA` 로, 2024년 울트라부스트 5 의 직전이 아니었다. 직전은 울트라부스트 라이트(2023)지만 세대 번호가 없어 `(line_key, generation, gender)` 한 행으로 이을 수 없고, 이미지 매칭(`stockx.mjs judge`)도 제목의 세대 숫자로 고른다. 번호를 지어 붙이지 않고 행을 뺐다(운영에 없던 `review` 행). 라이트는 넣지 않는다. 번호 없는 세대를 다루려면 매칭기를 고쳐야 하는데 한 켤레 때문에 할 일이 아니다(사용자). [code:catalog/candidates.csv:124-125] [code:catalog/stockx.mjs:51-63] [code:backend/src/main/resources/db/migration/V4__shoe_generations.sql:69]
- **현행 세대를 다시 확인했다(11-01).** 운영 현행 중 확신도가 낮은 65켤레를 BITR 과 RSG 사이트맵으로 대조했다. "리뷰 없음"은 "신형 없음"이 아니라는 원칙(사용자)으로, 확인 못 한 14켤레는 그대로 뒀다. 린콘 5(국내 미출시)를 넣지 않은 일로 "현행 = 국내 판매 중인 최신 세대" 규칙이 생겼다. [code:catalog/candidates.csv:150] [c:a6bf21e]
- **사이트맵으로 새 세대를 다시 훑었다(11-05).** 크림에 클라우드비스타 3 이 있다는 말(사용자)로 BITR, RSG, fit2run 사이트맵을 새로 받아, 운영과 후보 최고 세대보다 높은 번호의 리뷰와 상품을 찾았다(주소의 이름과 번호로만. 표기가 다른 라인은 빠질 수 있다). 후보에도 없는 새 세대는 셋. 엔돌핀 스피드 6(리뷰, 이미 국내 미출시로 판단), 젤 님버스 29, 글리세린 맥스 3(fit2run 상품뿐). 판단(사용자): **클라우드비스타 2 가 현행**(3 은 KicksDB 에 여성용 한 색상 `3WG30195308` 뿐, 리뷰와 국내 판매 없음), **젤 님버스 28 이 현행**(asics.co.kr 러닝 카테고리에 29 없음), 글리세린 맥스 3 은 brooksrunning.co.kr 이 우리 쪽에서 연결 거절이라 미확인. **클라우드서퍼는 후보 번호가 맞다**. 온이 2023년 재설계 때 번호를 1부터 다시 매겼다(옛 계열 1 2011, 2 2012, 4 2016, 6 → RSG 는 2023년판을 "Cloudsurfer 7"로 부른다 → 현 계열 2 2025-02, 3 2026-09, BITR 과 RSG 리뷰 원문). 2023년판(현 계열 1)은 번호가 없어 넣지 않는다(울트라부스트 라이트와 같은 문제, 사용자). [code:catalog/candidates.csv:2] [code:catalog/candidates.csv:291-292] [code:catalog/candidates.csv:306-307]
- **무게 규칙 셋이 생겼다(11-02).** 소닉블라스트 2 가 241g(BITR M9), 242g(국내몰), 245g(fit2run)로 갈려 매번 사람이 보는 것은 낭비라 "5g · 2% 이내는 우선순위로"를 정했다. 제네시스 2 BITR 은 264g 과 9.6oz(=272g)가 같은 글에서 안 맞아 "자기모순 출처 배제"가, 다운시프터 14 나이키 358g(US10)은 실측 303~315g 보다 40g 넘게 무거워 "기준을 모르면 비운다"가 생겼다. [code:catalog/build.mjs:113] [code:catalog/build.mjs:137-142] [c:a6bf21e]
- **GTX 판이 없다**. 별도 행으로 넣기로 했다(2026-11-03 사용자, 리뷰 생성 뒤에). 1-1 기준. 조사(11-03, 캐시와 색인만): 운영 302켤레 중 GTX 판이 확인된 것 30켤레(KicksDB 캐시 22, 리뷰와 소매 색인 8. 신발마다 검색 결과 20개만 받아 둔 캐시라 하한이다, 다나와의 울트라부스트 5 GTX 도 캐시에 없었다). 이미지는 22켤레가 캐시에 있고 8켤레는 KicksDB 8회. 스펙은 BITR 스펙 상자 2(스피드고트 6, 7 GTX), fit2run 상품 주소 약 5, 나머지는 웹 검색(사우코니 글로벌 상품 페이지는 11-03 조사 때 허용 범위가 뉴스룸뿐이었다. 11-09 부터 `www.saucony.com` 은 스펙 칸만 fetch, 1-2a). 국내 판매는 아직 한 켤레도 보지 않았다. 할 일: 수집기가 GTX 를 거르는 곳(`stockx.mjs EXCLUDE`, `variant.mjs`)을 GTX 라인에서는 풀고 매칭 낱말을 따로 준다, 켤레마다 이미지, 스펙 2개 이상, 발매가, 국내 판매, 문구, 영어 이름. 웹 검색 약 60~90회. [code:catalog/stockx.mjs:16-19] [code:catalog/variant.mjs:6] [code:catalog/sources.yaml:223-225] [c:37e665c]

#### 4. 남은 한계

- **여성 행이 없다.** 안 하는 까닭: 여성 스펙이 출처에 거의 없어 보류했다.

**조건: 우리가 고르지 않은 것**
- **운영 빈 칸**(2026-11-03, 303켤레): 무게 2, 드롭 1, 스택 42, 미드솔 17, 카본 44, 발볼 189, 와이드 5(4 는 직접 볼 것, 울트라부스트 5X 는 조사 전), **정가 145**. [c:55e8910]
- **정가 145칸**: 국내 공식몰에서 내려간 직전 세대가 대부분이다. 공식몰과 ABC 에 없으면 출처가 없다(크림은 사람이 넣는다). [code:catalog/build.mjs:103-108] (2026-11-03 기준) [c:55e8910]
- **나이키, 아디다스, 호카, 온, 언더아머는 국내 공식몰을 열 수 없다.** 이 브랜드의 국내 판매와 스펙은 리뷰, 웹 검색, 국내 판매처로만 본다. [code:catalog/sources.yaml:19-20] [code:catalog/sources.yaml:41-47] [code:catalog/sources.yaml:83-84] [code:catalog/sources.yaml:150-151]
- **웹 검색은 세션 한도가 있다**(약 200회, 시간당 약 100회 다시 참). 와이드 재조사는 회차를 나눠 돈다. (2026-11-02 기준) [c:a6bf21e] <!-- 확인 못 함: 웹 검색 한도는 저장소 밖 도구의 값이다 -->

#### 5. 검증 항목

- **출처 감사**(`audit.mjs`): 주소가 색인에 있나, 실제로 200 이었나, 값이 그 페이지 본문에 단위와 함께 있나(`39.5 mm`, `173 g`, `6.1 oz`, 스택과 드롭 ±0.5), 같은 세대 페이지인가. 못 넘으면 출처를 떼고 `review`. [code:catalog/audit.mjs:98-101] [code:catalog/audit.mjs:43-49] [code:catalog/audit.mjs:107-114] [code:catalog/build.mjs:67-74] [code:catalog/build.mjs:374]
- **범위와 표기 검사**(`build.mjs`): 범위 밖 값, 모델명 표기(한글 + 허용 라틴 낱말), 충돌 메모가 있으면 `review`. [code:catalog/build.mjs:17-21] [code:catalog/build.mjs:365-367] [code:catalog/build.mjs:374]
- **포어풋 검산**(`check-forefoot.mjs`): 힐 − 드롭 = 포어풋(±0.5). [code:catalog/check-forefoot.mjs:40]
- **적재 건조 실행**(`scripts/load-prod.sh`): 운영과 카탈로그가 같으면 PATCH 0. [code:scripts/load-prod.sh:3] [code:scripts/load-prod.sh:25-27] [code:catalog/load.mjs:182]
- 사람 확인 목록: `todo.csv`, `conflict-todo.csv`, `weight-todo.csv`, `local/width*.csv`. [code:catalog/todo.csv:1] [code:catalog/conflict-todo.csv:1] [code:catalog/weight-todo.csv:1] <!-- 확인 못 함: local/width*.csv 는 catalog/local 에 있어 git 에 없다 -->
