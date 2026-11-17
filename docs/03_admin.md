<!--
다루는 곳: src/pages/Admin.tsx, src/pages/ShoeForm.tsx, src/pages/AdminMy.tsx, src/pages/adminmy/, src/components/, src/utils/pageGroup.ts, tests/pageGroup.test.ts, backend/src/main/java/com/kopo17/runshoes/api/, backend/src/main/java/com/kopo17/runshoes/auth/, backend/src/main/java/com/kopo17/runshoes/activity/, backend/src/main/java/com/kopo17/runshoes/summary/, backend/src/main/resources/db/migration/, catalog/, contract/
읽은 커밋: 606b730
-->
> 상태: 운영에서 쓰는 중(2026-11-02). 운영 302켤레 중 보완 필요 261 · 관리 화면에서 고친 적 있는 신발 31(공개 API `updatedAt` 로 센 수). 원천: `src/pages/Admin.tsx` · `ShoeForm.tsx` · `components/HideShoeConfirm.tsx` · `api/ShoeCollection.java` · `AdminController.java` [code:src/pages/Admin.tsx] [code:src/pages/ShoeForm.tsx] [code:src/components/HideShoeConfirm.tsx] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminController.java] [c:a6bf21e] <!-- 확인 못 함: 302, 261, 31 은 운영 공개 API 로 센 수 -->

#### 0. 한 줄 요약

신발을 등록 · 수정 · 숨김 · 영구 삭제하는 관리 화면이다. 칸마다 **출처를 같이 저장**하고, 근거 없는 값이 생기지 않게 막는다 — 값을 바꾸면 출처를 다시 고르게 하고, 와이드 "없음"은 출처가 있어야 저장된다. 여기서 고친 값은 다음 적재에서 되돌려지지 않는다(`01c_catalog_loader.md`). [code:src/pages/ShoeForm.tsx:196-201] [code:src/pages/ShoeForm.tsx:247-248] [code:catalog/pull-admin.mjs:5] [docs:01c_catalog_loader.md]

#### 1. 최종 설계

#### 1-1. 목록 — 네 탭

신발 관리 탭(`/admin`)은 신발 전용이다. 챗봇 문의 탭은 관리자 페이지로 옮겼다(2026-11-14 사용자, 1-6). 넷째 탭은 영구 삭제 기록이다. [code:src/pages/Admin.tsx:291-304] [code:src/pages/AdminMy.tsx:43-45]
이름은 2026-11-15 에 바꿨다(사용자 — 문의를 옮겨 신발 전용 탭이 됐다). 머리 메뉴 · 탭 제목 · 화면 글 · 문의에서 가는 단추 모두 「신발 관리」, 주소는 그대로. 그 전 기록(`HISTORY.md` · `archive/`)의 옛 이름은 이 탭이다. [code:src/components/Header.tsx:88] [code:src/pages/adminmy/ChatMisses.tsx:129] [docs:HISTORY.md]


| 탭 | 무엇 | 누가 |
|---|---|---|
| 등록된 신발 | 전체 목록. 정렬 `최근 수정순`(기본) · `등록순` · `브랜드순` · `모델명순` — 고른 것을 다시 누르면 방향이 바뀐다 | admin · 데모 관리자 [code:src/pages/Admin.tsx:18] [code:src/pages/Admin.tsx:37-42] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminController.java:52] [code:backend/src/main/java/com/kopo17/runshoes/api/Viewer.java:57-60] |
| 숨긴 신발 N | 숨긴 신발과 숨긴 시각. 되살리기 · 영구 삭제 | 보기는 둘 다, 쓰기는 admin [code:src/pages/Admin.tsx:402-428] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminShoes.java:118] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminController.java:19-20] |
| 보완 필요 N | 빈 칸이 있는 신발. 칸 하나로 거를 수 있고, 기본은 **빈 칸 적은 순**(한 칸만 빈 신발부터 고치면 목록이 빨리 준다) | admin · 데모 관리자 [code:src/pages/Admin.tsx:59] [code:src/pages/Admin.tsx:360-369] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminShoes.java:70] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminController.java:52] |
| 영구 삭제 기록 N | 영구 삭제한 신발(`shoe_purges`, V11) — 번호 · 모델 · 라인 · 세대 · 성별 · 지울 때의 리뷰 · 찜 수 · 지운 날, 최근 먼저. 읽기만(2026-11-14 — API 는 있었는데 화면이 없었다) | admin · 데모 관리자 [code:src/pages/Admin.tsx:431-452] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminShoes.java:122-125] [code:backend/src/main/resources/db/migration/V11__admin_history.sql:7] [code:backend/src/main/resources/db/migration/V11__admin_history.sql:16] |

- **보완 필요의 "빈 칸"** — 가격 · 발볼 · 와이드 · 스택 · 미드솔 · 카본 · 중량 · 드롭 · 중량 사이즈(중량은 있는데 사이즈가 빈 것) · 품번. 와이드 · 카본은 `null` 만 센다 — `false`(없음)는 확인한 값이다. 지금 운영: 발볼 196 · 와이드 184 · 가격 170 · 중량 사이즈 69 · 카본 43 · 스택 42 · 미드솔 17 · 중량 2 · 드롭 1 · 품번 1. [code:backend/src/main/java/com/kopo17/runshoes/api/AdminShoes.java:36-56] [code:src/pages/Admin.tsx:44-56] (2026-11-02 기준) [c:a6bf21e] <!-- 확인 못 함: 칸별 빈 칸 수는 운영에서 센 값 -->
- **수정 이력 칸** — 마지막 수정의 바뀐 칸 이름(`lastChange`) 두 개까지, 넘으면 "외 N건", 마우스를 올리면 전체. 날짜는 `updatedAt`(MM-DD HH:mm). 등록 · 숨김 · 되살리기도 찍힌다. 대표 · 추가 이미지는 "이미지", 가격 출처 · 날짜 · 종류는 "가격 출처" 하나로 묶는다. [code:src/pages/Admin.tsx:60-84] [code:src/pages/Admin.tsx:336-344] [code:backend/src/main/java/com/kopo17/runshoes/domain/ShoeRepository.java:25-30]
- 최근 수정순에서 고친 적 없는 신발은 방향과 상관없이 뒤에, id 순. 공개 `/api/shoes` 의 `_sort` 로는 "null 은 늘 뒤"를 나타낼 수 없어, 정렬은 관리자 API(`GET /api/admin/shoes`, `AdminShoes.order`)가 한다. 가나다는 브라우저의 `localeCompare("ko")` 와 같게 한글을 영문보다 앞에 둔다. MySQL 에는 한국어 정렬 규칙이 없고 `utf8mb4_0900_ai_ci` 는 영문을 앞에 둬서(310켤레 모델명순 293자리가 달랐다), 한글 · 한자가 아닌 글자 앞마다 그 규칙에서 한글 · 한자 뒤에 오는 글자(U+2A6D6)를 붙인 글로 정렬한다(`AdminShoes.koKey`). [code:backend/src/main/java/com/kopo17/runshoes/api/AdminShoes.java:26-28] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminShoes.java:57-75] (2026-11-15 기준) [c:85b9677]
- 탭 · 거르기 · 정렬 · 브랜드 · 검색은 주소(`?tab=gaps&gap=width …`)에 둔다 — 수정 화면에서 저장 · 취소하면 보던 자리로 돌아온다. [code:src/pages/Admin.tsx:89] [code:src/pages/Admin.tsx:118-130] [code:src/pages/ShoeForm.tsx:120-125]
- **몇 개씩 보기 · 쪽 번호(2026-11-15 사용자)** — 네 탭 모두 20 · 50 · 100개씩(기본 20, 「전체 보기」 없음), 쪽 번호는 관리자 페이지와 같은 `‹‹ ‹ 1 2 3 4 5 › ››`(같은 부품 `adminmy/parts` 의 `SizeChoice` · `Pager`). 주소에 `size` · `page`. 탭 · 브랜드 · 검색 · 정렬 · 빈 칸 · 몇 개씩을 바꾸면 1쪽으로. [code:src/utils/pageGroup.ts:3-19] [code:src/pages/adminmy/parts.tsx:12-29] [code:src/pages/adminmy/parts.tsx:44] [code:src/pages/Admin.tsx:114-116] [code:src/pages/Admin.tsx:127-128] [code:src/pages/Admin.tsx:289]
- **서버가 나눈다(2026-11-15 사용자)** — 네 탭 모두 `GET /api/admin/shoes?tab=&brand=&search=&gap=&sort=&dir=&page=&size=`(`05` 1-1). 리뷰 · 회원 관리와 같은 `{items, total, page, size}` 에 탭 단추 수 `counts`(list · gaps 는 브랜드 · 검색을 건 수, all 은 전체, hidden · purged 는 늘 전체) · 빈 칸 칩 수 `gapCounts`. **거르기 · 정렬 · 자르기(`LIMIT` · `OFFSET`) · 건수(`COUNT` · `SUM`)를 모두 SQL 이 한다** — DB 가 한 쪽만 꺼낸다(같은 날 처음에는 신발 전체를 서버 메모리에 올려 했다). 빈 칸 판정(위 열 칸)도 SQL 조건(`AdminShoes.GAPS`)이고 보완 필요의 한 줄에 `gaps` 로 싣는다. 브랜드 · 검색은 공개 `/api/shoes?brand=&search=` 와 같은 규칙(`ListQuery`)을 SQL 로 옮겼다 — 브랜드는 글자가 정확히 같은 것, 검색은 낱말마다(NFC · 소문자) 「브랜드 · 브랜드 영문 이름(`BrandNames`) · 모델 · 영어 이름 · 다른 표기」를 공백 없이 이은 글에 들어 있어야 한다. 같은 값이면 id 오름차순이라 쪽 사이 순서가 흔들리지 않는다. 요청의 글은 모두 바인딩하고 정렬 · 빈 칸은 정해진 SQL 조각에서 고른다. 화면은 한 쪽만 받고, 브랜드 칩 이름(`/api/brands`) · 요약 건수(`/api/admin/summaries`)만 따로 받는다. 공개 `/api/shoes` 는 그대로(챗봇 · 비교하기 · 홈). 옛 `/api/admin/shoes/hidden` · `/purged` 도 그대로 둔다 — 계약 시나리오와 카탈로그 적재기(`pull-admin`)가 읽는다. [code:backend/src/main/java/com/kopo17/runshoes/api/AdminController.java:14-24] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminShoes.java:19-30] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminShoes.java:91-161] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminShoes.java:165-190] [code:src/pages/Admin.tsx:139-170] [code:catalog/pull-admin.mjs:235]
- 옮길 때 같은지 본 것(로컬 310켤레 사본): 옛 화면 규칙(옮기기 전 `Admin.tsx` 의 빈 칸 · 정렬 함수)으로 공개 목록을 계산한 것과 새 API 를 브랜드 넷(전체 · 아식스 · 나이키 · 호카) × 탭 둘 × 정렬 다섯 × 방향 둘 × 빈 칸(전체 + 열) 480가지에서 견줘 순서 · 건수가 모두 같다(등록 310 · 보완 필요 120, 몇 켤레 숨긴 뒤 302 · 117). 처음에는 모델명순 22가지가 달랐다 — 한글 · 영문 순서(위). [code:backend/src/main/java/com/kopo17/runshoes/api/AdminShoes.java:20-21] (2026-11-15 기준) [c:85b9677]
- SQL 로 옮길 때 같은지 본 것(같은 사본, 숨김 8 · 영구 삭제 기록 25): 옮기기 전 API 로 185가지 요청(탭 넷 × 정렬 다섯 × 방향 둘, 브랜드 넷, 빈 칸 열, 검색 스무 가지 — 한글 · 영문 · 대문자 · 브랜드 영문 · 별칭 · 붙여 쓴 말 · 세대 숫자 · `%` · `_` · 앞뒤 공백, 20 · 50 · 100개씩 첫 · 가운데 · 끝 · 끝 다음 쪽, 전체 순서 스무 가지, 잘못된 값 일곱)의 total · counts · gapCounts · id 순서를 떠 두고 옮긴 뒤 같은 요청과 견줘 **다른 곳 0**. 탭 건수 등록 302 · 숨긴 신발 8 · 보완 필요 117 · 영구 삭제 기록 25, 빈 칸 가격 54 · 발볼 67 · 와이드 6 · 스택 18 · 미드솔 1 · 카본 16 · 중량 0 · 드롭 1 · 중량 사이즈 28 · 품번 1. (2026-11-15 기준) [c:85b9677]
- 휴대폰(767px 이하)은 탭 넷을 두 개씩 두 줄로 — 숫자가 세 자리면 한 줄에 들어가지 않아 390px 에서 10px 넘쳤다(2026-11-15 확인, 그 전부터 있던 것). [code:src/pages/Admin.css:410-418] [c:85b9677]

#### 1-2. 등록 · 수정 폼

```
기본    브랜드 · 모델명 · 영어 이름 · 검색용 다른 표기(쉼표로) · 용도 · 안정성
세대    라인키 · 세대 · 현행 · 성별, 품번
스펙    중량 [g] [기준 사이즈]  출처      드롭 [mm]  출처      스택하이트 [mm]  출처
        미드솔  출처      발볼  출처      와이드 모델  출처      카본 플레이트(출처 면제)
        가격(발매가) · 확인한 날 · 출처
이미지  주소 목록 — 첫 번째가 대표, 6개까지
문구    한 줄 요약 · 상세 설명
```

| 칸 | 선택지 | 저장 값 |
|---|---|---|
| 스펙 출처 | BITR · RSG · STORE · PR · WEB(웹 문서 · Claude 검색) · MAN(직접 확인 · 관리자) | 코드. WEB · MAN 은 주소 칸이 나오고 **둘 다 주소 필수** [code:src/pages/ShoeForm.tsx:18-20] [code:src/pages/ShoeForm.tsx:84-94] [code:src/pages/ShoeForm.tsx:228-234] [code:backend/src/main/java/com/kopo17/runshoes/api/SpecSources.java:11-13] |
| (기존 값에만) | DB · SX | 고를 수 없다 — 회색으로 보이고, 값을 고치면 새 출처를 골라야 저장된다 [code:src/pages/ShoeForm.tsx:21] [code:src/pages/ShoeForm.tsx:66-81] [code:src/pages/ShoeForm.tsx:235] |
| 와이드 모델 | 있음(국내) · 국외에만 있음 · 없음 · 정보 없음 | `true`+`domestic` · `true`+`overseas` · `false` · `null`. 예전 값 "있음(국내 · 국외 미확인)"은 `true`+`null` 로 보인다 [code:src/pages/ShoeForm.tsx:36-38] [code:src/pages/ShoeForm.tsx:222] [code:src/pages/ShoeForm.tsx:272] [code:src/pages/ShoeForm.tsx:543-547] |
| 발볼 · 카본 | 값 · 정보 없음 | 정보 없음 = `null` [code:src/pages/ShoeForm.tsx:14] [code:src/pages/ShoeForm.tsx:532-538] [code:src/pages/ShoeForm.tsx:552-555] [code:src/pages/ShoeForm.tsx:33-35] |
| 중량 기준 사이즈 | US M9 · M9.5 · M10 · M10.5 · M8.5 · 불명 | 불명 = `null` [code:src/pages/ShoeForm.tsx:15-16] [code:src/pages/ShoeForm.tsx:507-513] [code:src/pages/ShoeForm.tsx:267] |
| 가격 출처 | 공식몰 · ABC마트 · 크림 · MAN(직접 확인) | 종류는 늘 `발매가`. 기존 `다나와` 는 회색으로만 [code:src/pages/ShoeForm.tsx:22-23] [code:src/pages/ShoeForm.tsx:277] [code:src/pages/ShoeForm.tsx:392] [code:src/pages/ShoeForm.tsx:564-575] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:341-343] |
| 성별 | 남성 · 여성 · 공용, 정보 없음 | `men` · `women` · `unisex`, 정보 없음은 NULL [code:src/pages/ShoeForm.tsx:17] [code:src/pages/ShoeForm.tsx:477-484] [code:src/pages/ShoeForm.tsx:263] |

**근거 없는 값을 막는 규칙**
- 값을 바꾸면 **그 칸의 출처를 다시 고르게** 한다 — 옛 출처가 새 값에 붙지 않게. 가격을 바꾸면 확인한 날 · 출처도 다시. [code:src/pages/ShoeForm.tsx:196-201] [code:src/pages/ShoeForm.tsx:208-216]
- 값을 비우면 출처도 비운다. [code:src/pages/ShoeForm.tsx:196-201] [code:src/pages/ShoeForm.tsx:249]
- **와이드 "없음"은 출처 면제다**(카본처럼 — 2026-11-02 사용자). 출처 고르는 칸이 없어지고 "출처 면제"가 보인다. "검색 결과 없음"은 작업 과정이지 사용자가 볼 내용이 아니고, "없음"이라 적으면 값과 겹친다. 데이터에는 남긴다 — 불러온 출처는 그대로 저장하고, 새로 "없음"으로 바꾸면 `NOTFOUND`(검색 결과 없음)를 넣는다(추적용). 서버는 지금처럼 `NOTFOUND` 를 `wideAvailable` 에만 받는다(`05_api_contract.md` 1-5). [code:src/pages/ShoeForm.tsx:247-248] [code:src/pages/ShoeForm.tsx:549] [code:backend/src/main/java/com/kopo17/runshoes/api/SpecSources.java:12] [code:backend/src/main/java/com/kopo17/runshoes/api/SpecSources.java:41] [docs:05_api_contract.md]
- 새로 고른 MAN 은 주소가 필수다. 예전에 주소 없이 넣은 MAN 은 그대로 저장할 수 있다. [code:src/pages/ShoeForm.tsx:231-234]

**입력**
- 중량 · 드롭 · 스택은 숫자와 소수점 한 자리, 가격은 정수 7자리. `type="number"` 는 쓰지 않는다 — `e` · `+` · `−` 가 들어가고 휠로 값이 바뀐다. 붙여 넣기도 같은 검사. 서버도 숫자가 아니면 400. [code:src/pages/ShoeForm.tsx:28-31] [code:src/pages/ShoeForm.tsx:202-216] [code:backend/src/main/java/com/kopo17/runshoes/api/Values.java:14]
- 품번은 영문 · 숫자 · `-` `.` `/` · 공백 50자. 힌트 "예: 1011C284 (색상 코드는 빼고 모델 번호만)". [code:src/pages/ShoeForm.tsx:239] [code:src/pages/ShoeForm.tsx:490-491]
- 이미지 — 칸 하나에 주소 하나, `+` 로 칸 추가 · `−` 로 빼기, 왼쪽 핸들(≡)을 끌어 순서를 바꾸고 1번 자리가 대표. 마우스 · 터치 · 펜(Pointer Events), 키보드는 핸들에서 ↑ · ↓. 썸네일은 주소를 멈추고 0.5초 뒤 다시 불러오고, 못 불러오면 빨간 테두리. 저장은 `images` = 빈 칸을 뺀 목록, `image` = 그 첫 번째. [code:src/pages/ShoeForm.tsx:24-26] [code:src/pages/ShoeForm.tsx:48-59] [code:src/pages/ShoeForm.tsx:334-391] [code:src/pages/ShoeForm.tsx:596-608] [code:src/pages/ShoeForm.tsx:633-634] [code:src/pages/ShoeForm.css:529-530] [code:src/pages/ShoeForm.tsx:218] [code:src/pages/ShoeForm.tsx:279-280]
- 수정 화면은 **신발을 받기 전에는 폼을 그리지 않는다** — 빈 폼에 먼저 입력한 값을 늦게 온 응답이 덮지 않게. [code:src/pages/ShoeForm.tsx:394-410]

#### 1-3. 숨김 · 되살리기 · 영구 삭제

- **삭제 버튼은 "숨김"이다**(V8). 확인 창에 그 신발의 리뷰 수 · 찜 수, 현행 세대를 숨겨 그 라인에 현행이 없어지면 "이 라인에 현행이 없어집니다" 경고 — 다른 세대를 저절로 올리지 않는다. "숨긴 신발 탭에서 언제든 되살릴 수 있어요". [code:src/components/HideShoeConfirm.tsx:6-40] [code:src/pages/ShoeForm.tsx:318-321] [code:backend/src/main/resources/db/migration/V8__shoe_soft_delete.sql:1]
- 숨긴 신발은 목록 · 상세 · 찜 · 리뷰 쓰기에서 빠지고, 리뷰 · 찜은 DB 에 남는다. 되살리면 그대로 돌아온다. [code:backend/src/main/java/com/kopo17/runshoes/domain/Shoe.java:24] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:28-29] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:189-197]
- **영구 삭제는 숨긴 신발만**(보이는 신발 409 `not_hidden`), admin 만. 리뷰 · 답글 · 도움이 돼요 · 찜이 함께 지워진다. 지우기 전에 `shoe_purges` 에 남기고, 적재기가 그 기록을 읽어 다시 넣지 않는다. [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:200-228] [code:backend/src/main/java/com/kopo17/runshoes/api/ApiException.java:75] [code:catalog/pull-admin.mjs:235]
- 같은 라인 · 세대 · 성별의 숨긴 신발이 있으면 새로 등록하지 못한다(409 `hidden_generation` — "되살려 주세요"). [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:397-398] [code:backend/src/main/java/com/kopo17/runshoes/api/ApiException.java:31]

#### 1-4. 누가 무엇을

| | admin | 데모 관리자(`DEMO_ADMIN`) | 그 밖 |
|---|---|---|---|
| 목록 · 폼 · 숨긴 신발 보기 | 된다 | 된다 | 메뉴 없음 [code:backend/src/main/java/com/kopo17/runshoes/api/Viewer.java:57-60] [code:src/components/Header.tsx:86-90] [code:src/auth/RequireAuth.tsx:13] |
| 저장 · 숨김 · 되살리기 · 영구 삭제 | 된다 | **서버가 403** — 화면은 그 문구("데모 관리자 계정은 할 수 없습니다")를 그대로 띄운다 | 401 · 403 [code:backend/src/main/java/com/kopo17/runshoes/api/Viewer.java:50-54] [code:backend/src/main/java/com/kopo17/runshoes/api/ApiException.java:22] [code:src/auth/demoAdmin.ts:5] [code:src/pages/ShoeForm.tsx:286-296] |

- 화면만 막지 않는다 — API 로 우회할 수 있으므로 서버(`api/Viewer`)가 막는다. 데모 관리자로 들어가는 길은 `04_auth.md`. [code:backend/src/main/java/com/kopo17/runshoes/api/Viewer.java:8-12] [docs:04_auth.md]

#### 1-5. 기록

- 관리자 등록 · 수정 · 숨김 · 되살리기는 행에 `updated_at` · `last_change` 를 찍고, 활동 로그에 `shoe.create` · `shoe.update`(바뀐 칸 이름만) · `shoe.delete` · `shoe.restore` · `shoe.purge` 를 남긴다. [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:34-35] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:107] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:174] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:196] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:227] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:270] [code:backend/src/main/java/com/kopo17/runshoes/domain/ShoeRepository.java:25-30]
- 바뀐 칸은 저장 전후의 응답 문서를 칸마다 비교해 정한다. 바뀐 것이 없는 저장은 찍지 않는다. [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:258-271]
- 적재기의 쓰기(`X-Runshoes-Client: loader`)는 찍지 않는다 — "최근 수정순"에 사람의 수정만 보이게. [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:36] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:277-282]

#### 1-6. 관리자 페이지(2026-11-14 사용자)

관리자 · 데모 관리자로 로그인하면 `/account` 가 관리자용으로 바뀐다(`src/pages/AdminMy.tsx` · `adminmy/*`). 머리 메뉴 · 서랍 · 왼쪽 목차 제목은 「관리자 페이지」, 일반 회원은 「마이페이지」(2026-11-15 사용자 — 주소는 같다. 그 전 이름은 「관리자 마이페이지」). 일반 회원 메뉴(내 리뷰 · 찜 · 회원 탈퇴)와 회원정보 수정은 없다 — 관리자는 닉네임 변경 · 탈퇴가 서버에서 막혀 있다. 신발은 신발 관리 탭(`/admin`)이 맡고, 첫 화면(할 일 모음)은 두지 않는다(숫자는 Grafana). 모양은 일반 마이페이지 그대로(왼쪽 목차 · 오른쪽 표), 거르기 · 쪽은 주소(`?tab=…&from=…&page=`)에 둔다. 목록은 모두 서버가 페이지를 나눈다(20건씩, `{items, total, page, size}`). [code:src/pages/Account.tsx:39-43] [code:src/pages/AdminMy.tsx:14-46] [code:src/components/Header.tsx:36] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthService.java:294-297] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminPage.java:19-26]

```
리뷰 관리   전체 리뷰   날짜 최신순. 거르기: 날짜(한국 날짜) · 신발(브랜드 · 모델) · 작성자. 숨기기(한 건 · 여러 건). 20 · 50 · 100개씩 보기
            숨긴 리뷰   숨긴 순. 되살리기 · 영구 삭제. 20 · 50 · 100개씩 보기
회원 관리   회원 목록   가입 최신순. 찾기: 이메일 · 닉네임, 거르기: 가입 연도. 로그인 잠금 풀기
챗봇       문의        최근 질문 최신순. 거르기: 날짜 · 종류(신발 · 용어 · 특성) · 처리 상태(처리 안 함 · 처리함 · 무시)
                       신발 [신발 등록하기] → 새 러닝화 등록(모델명에 이름) · 용어 [사전에 추가] → 이 자리에서 · 특성 [신발 수정하기] → 신발 관리 탭
                       처리함 · 무시에 사유(선택, 200자). 질문 원문은 눌러서 전문 보기. 20 · 50 · 100개씩 보기
           대화 보기   마지막 턴 최신순. 거르기: 날짜 · 계정(닉네임, 번호로도 찾는다) · 갈래. 펼치면 질문 · 답 전체, 턴마다 갈래 · 걸린 시간
```

**화면 수정(2026-11-15 사용자 지시서)**
- 쪽 번호는 `‹‹ ‹ 1 2 3 4 5 › ››` — 다섯 개씩, ‹ · › 는 앞 · 다음 묶음의 첫 쪽, ‹‹ · ›› 는 첫 · 마지막 쪽. 첫 묶음은 ‹‹ · ‹, 마지막 묶음은 › · ›› 를 막는다(`src/utils/pageGroup.ts`). 다섯 목록 모두 [code:src/utils/pageGroup.ts:11-19] [code:src/pages/adminmy/parts.tsx:12-29] [code:src/pages/adminmy/Reviews.tsx:171] [code:src/pages/adminmy/Members.tsx:112] [code:src/pages/adminmy/ChatMisses.tsx:140] [code:src/pages/adminmy/Conversations.tsx:118]
- 몇 개씩 보기는 리뷰 두 목록과 문의(주소 `size`, 기본 20 — 같은 `SizeChoice`). 바꾸면 1쪽으로. 서버는 원래 100까지 받는다(`AdminPage.MAX_SIZE`, 문의 API 도 같다 — 101 · 0 은 400). 회원 목록 · 대화 보기에는 두지 않는다(사용자) [code:src/pages/adminmy/Reviews.tsx:105] [code:src/pages/adminmy/ChatMisses.tsx:103] [code:src/utils/pageGroup.ts:3-9] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminPage.java:19-26]
- 가입 연도는 한국 연도(`?year=`, 2000~2100 밖 · 숫자 아님 400). 고를 해는 서버가 목록과 함께 준다(`years` — 가입한 해들, 최근 먼저) [code:backend/src/main/java/com/kopo17/runshoes/api/AdminPage.java:55-58] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminUserController.java:91-92] [code:src/pages/adminmy/Members.tsx:35-38]
- 리뷰 표가 어긋났던 까닭: 머리 줄과 각 줄이 서로 다른 grid 인데 버튼 칸이 `auto` 라 머리 줄(버튼 없음)만 그 칸이 0 이 되고, 그만큼 신발 칸이 넓어져 뒤 칸이 밀렸다. 버튼 칸 폭을 정했다. 문의 줄도 버튼 이름 길이로 횟수 · 날짜가 밀려 버튼 칸 폭을 정했다. 리뷰 글은 둘째 줄(신발 칸부터 날짜 칸까지)이라 머리에 「내용」 칸이 없다 [code:src/pages/AdminMy.css:92] [code:src/pages/AdminMy.css:110]
- 리뷰 안내 문구는 「리뷰 목록 · 평점 계산 · 리뷰 수에서는 바로 빠지고, 챗봇에는 최대 10분 이후부터, 요약은 익일 새벽 03:30에 반영돼요」(`reviewRules.WHEN_APPLIED` — 상세 모달 숨기기 확인 창도 같은 문장) [code:src/components/reviewRules.ts:39] [code:src/components/HideReviewConfirm.tsx:26] [code:src/pages/adminmy/Reviews.tsx:93]
- 회원 목록 안내에 「IP로 막힌 경우는 이 목록에 나오지 않아요. 15분이 지나면 풀려요.」 — IP 로 막힌 계정은 목록에 「정상」으로 보인다 [code:src/pages/adminmy/Members.tsx:65] [code:src/pages/adminmy/Members.tsx:103] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminUserController.java:74]

**챗봇 문의(V23)** — 신발 관리 탭에서 옮겼다. 챗봇에게 물었지만 등록되지 않은 신발 · 사전에 없는 용어 · 답하지 못한 특성 질문(V18)을 같은 이름으로 묶어 보인다. [code:src/pages/adminmy/ChatMisses.tsx:38] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotMissController.java:36-38] [code:backend/src/main/resources/db/migration/V18__chatbot_misses.sql] [code:backend/src/main/resources/db/migration/V23__chatbot_miss_status.sql:4-13]
- **처리 상태** — 처리함 · 무시(없으면 목록이 쌓이기만 한다). 묶음 단위로 고르되 줄마다 적는다(`chatbot_misses.status` · `decided_at` · `decided_by`). 처리한 뒤 같은 이름으로 새 질문이 오면 그 줄은 비어 있어 묶음이 다시 「처리 안 함」에 나온다. 되돌리기는 묶음 전부를 비운다. 활동 기록 `admin.chatbot_miss.done` · `.ignored` · `.open`. [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotMissController.java:102-106] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotMissController.java:144-146] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotMissController.java:166-174]
- **처리 사유(V24, 2026-11-15)** — 「무시」한 뒤 같은 이름으로 새 질문이 와 다시 「처리 안 함」이 되면 왜 무시했는지 알 수 없었다. 처리함 · 무시를 고를 때 사유를 적는다(선택, 200자 — 넘으면 400). 묶음의 줄 전부에 적고(`decided_note`), 되돌리기는 사유도 비운다. 목록은 **마지막으로 처리한 줄**의 상태 · 때 · 사유를 싣는다(`lastDecision` · `lastDecidedAt` · `decidedNote`) — 묶음의 마지막 줄은 새 질문이라 사유가 없기 때문이다. 화면은 다시 처리 안 함이 된 묶음에 「전에 무시 · 때 · 사유」를 보인다. 사전 추가로 처리하면 사유는 「사전에 추가」. 활동 기록 meta 에 `note`. [code:backend/src/main/resources/db/migration/V24__chatbot_miss_note.sql:3-9] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotMissController.java:131-134] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotMissController.java:140-173] [code:src/pages/adminmy/ChatMisses.tsx:117-118] [code:src/pages/adminmy/ChatMisses.tsx:145]
- **가는 곳** — 신발: 새 러닝화 등록(모델명에 챗봇이 뽑은 이름을 넣어 두고, 저장 · 취소하면 문의로 돌아온다). 용어: 이 화면에서 바로 사전 추가(`POST /api/admin/terms`) — 더하면 그 묶음을 처리함으로. 특성: 신발 관리 탭으로 — **특성 문의는 어느 신발에 대한 것인지 기록에 없어**(V18 은 뽑은 낱말 · 원문만) 「그 신발 수정 화면」으로 바로 갈 수 없다. 관리자가 신발을 고른다. [code:src/pages/adminmy/ChatMisses.tsx:127-129] [code:src/pages/ShoeForm.tsx:117-121] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminTermController.java:18]
- **사전 추가** — `terms` 는 DB 에 있고 쓰기만 막혀 있었다. 관리 API 를 새로 열었다(json-server 꼴 `/api/terms` 의 쓰기는 계약대로 405). key(영문) · 이름 · 한 줄 설명 · 설명. 같은 key · 이름은 409. 챗봇은 다음 턴부터 쓴다 — 카탈로그 판 번호에 terms 체크섬이 있어 바뀌면 `/api/terms` 를 다시 읽고, 사전은 이름으로 문장에서 찾는다. 지우기 · 고치기는 없다. [code:backend/src/main/java/com/kopo17/runshoes/api/AdminTermController.java:16-26] [code:backend/src/main/java/com/kopo17/runshoes/api/TermCollection.java:16] [code:backend/src/main/java/com/kopo17/runshoes/api/CatalogVersionController.java:13-14] [code:backend/src/main/java/com/kopo17/runshoes/api/CatalogVersionController.java:34]

**겹치는 것 — 신발 관리 머리의 요약 건수(`/api/admin/summaries`)** — 그대로 둔다(2026-11-15 사용자 결정: Grafana 읽기 계정에 요약 표 권한이 없어 빼면 볼 곳이 없다). 아래는 결정 전에 적은 사실 · 의견이다. [code:src/pages/Admin.tsx:163-170] [code:src/pages/Admin.tsx:243-246] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminController.java:77-81] <!-- 확인 못 함: Grafana 읽기 계정 권한은 인프라 저장소 -->
- 사실: 머리에 「리뷰 요약 N켤레 · 다시 만들 것 N(아직 없음 N)」이 보인다. Grafana 의 읽기 계정은 요약 배치 실행 기록(V20 — 대상 · 성공 · 실패 · 다시 stale)을 읽는다(`07` 1-6). `shoe_summaries` 는 그 계정에 주지 않아, 지금 「다시 만들 것」 수 자체를 Grafana 가 그리는지는 확인하지 않았다(대시보드는 인프라 저장소). [code:src/pages/Admin.tsx:244-246] [code:backend/src/main/resources/db/migration/V20__summary_batch_runs.sql] [docs:07_database.md] <!-- 확인 못 함: Grafana 읽기 계정과 대시보드는 인프라 저장소 -->
- 의견(코더): 「숫자는 Grafana, 손대는 건 관리자 화면」 원칙으로는 빼는 쪽이 맞다 — 관리 화면에서 그 숫자로 할 수 있는 일(요약을 돌리는 단추)이 없다. 다만 리뷰를 숨기면 「다시 만들 차례」가 늘어 그 수가 바로 변하는데, Grafana 는 배치가 돈 뒤(다음 날 03:30)에야 바뀐다. 숨긴 직후 확인용으로 남길 까닭이 그것 하나다. 빼기 전에 대시보드에 같은 수가 있는지 먼저 본다. 빼면 API(`/api/admin/summaries`)는 두고 화면 줄만 빼는 것을 권한다. [code:backend/src/main/java/com/kopo17/runshoes/api/AdminReviews.java:24] [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryStore.java:72] <!-- 확인 못 함: 배치 시각 03:30 은 CronJob 매니페스트(인프라 저장소), 코드에는 주석으로만 있다 -->

**지시와 다르게 된 것**(2026-11-15 사용자 확인 — 그대로 둔다)
- 특성 문의는 「그 신발 수정 화면」이 아니라 신발 관리 탭으로 보낸다 — V18 기록에 어느 신발 이야기인지가 없다(위 「가는 곳」). [code:src/pages/adminmy/ChatMisses.tsx:129]
- 사전은 용어 추가만 있다 — 고치기 · 지우기 화면은 없다. [code:backend/src/main/java/com/kopo17/runshoes/api/AdminTermController.java:22]
- 전체 리뷰에는 숨기기만 있다 — 지시서 메뉴의 「숨기기, 삭제」 중 영구 삭제는 숨긴 리뷰에서만(아래 「리뷰 숨기기」). 상세 모달도 같다. [code:src/pages/adminmy/Reviews.tsx:159-164] [code:src/components/ReviewSection.tsx:173]
- 신발 관리 머리의 요약 건수는 그대로 둔다(위). [code:src/pages/Admin.tsx:243-246]

**대화 보기** — `chatbot_turns`(V19)를 읽는다(`09_chatbot_rag.md` 1-14절 「읽는 길」). 대화 = 웹소켓 연결 하나. 펼치기는 상세 모달 리뷰의 「전체보기」(`review__more`)를 따른다. 화면에 「체험 계정의 대화는 한 사람의 것이 아니다」. 데모 관리자도 질문 · 답을 본다(아래 「데모 관리자」). 90일이 지나 정리가 질문 · 답을 비운 대화는 빈 칸 대신 「90일이 지나 질문과 답을 지웠어요.」를 흐린 글자로 보인다(목록의 첫 질문 · 펼친 턴 모두, 2026-11-17 사용자). 갈래 · 걸린 시간은 그대로 보인다. [code:backend/src/main/java/com/kopo17/runshoes/api/AdminChatbotTurnController.java:22-33] [code:backend/src/main/resources/db/migration/V19__chatbot_turns.sql] [code:src/pages/adminmy/Conversations.tsx:47-54] [code:src/pages/adminmy/Conversations.tsx:74-75] [code:src/pages/adminmy/Conversations.tsx:111] [docs:09_chatbot_rag.md]

**리뷰 숨기기(V22)** — 신발 숨김과 같은 흐름이다: 숨기기 → 숨긴 리뷰 → 거기서만 영구 삭제. [code:backend/src/main/resources/db/migration/V22__review_hide.sql:2-11] [code:src/pages/adminmy/Reviews.tsx:41]
- 숨기면 `reviews.hidden_at` 을 적는다. 공개 리뷰 목록 · 단건(`/api/reviews` — 작성자에게도 404), 「도움이 돼요」 누르기, 신발 평점 · 리뷰 수(다시 센다), 요약 입력과 다시 만들지 판단할 때의 리뷰 수에서 빠진다. 챗봇은 `/api/reviews` 를 10분마다 다시 읽어 최대 10분 뒤 빠진다. [code:backend/src/main/java/com/kopo17/runshoes/domain/Review.java:16-21] [code:backend/src/main/java/com/kopo17/runshoes/api/Ratings.java:31-32] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminReviews.java:21-24] [code:chatbot/search/service.py:1] [code:chatbot/search/service.py:23] [code:chatbot/search/service.py:36]
- 요약은 저절로 다시 만들어지지 않는다(리뷰 수 10% · 평점 0.3 · 30일 중 하나여야 함). 그래서 숨기거나 되살리면 그 신발 요약을 **「다시 만들 차례」로 세운다**(`SummaryStore.forceStale`) — 다음 날 03:30 배치가 만든다. 화면에 「챗봇은 최대 10분, 요약은 다음 날 03:30 반영」을 적는다. [code:backend/src/main/java/com/kopo17/runshoes/summary/StaleRule.java:13-15] [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryStore.java:72] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminReviews.java:24] [code:src/components/reviewRules.ts:39]
- 실사용 후기(FOLLOWUP)는 첫 리뷰와 같이 숨고 같이 돌아온다 — 영구 삭제 때 FK CASCADE 로 같이 지워지는 것과 맞췄다. [code:backend/src/main/java/com/kopo17/runshoes/api/AdminReviews.java:81] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminReviews.java:87-92] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminReviews.java:100]
- 영구 삭제 확인 창에 함께 지워지는 「도움이 돼요」(review_likes 행) · 실사용 후기 건수를 보인다. 숨긴 리뷰가 아니면 409 `not_hidden`. [code:backend/src/main/java/com/kopo17/runshoes/api/AdminReviews.java:106] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminReviews.java:118-125] [code:src/pages/adminmy/Reviews.tsx:195-198]
- 관리자 행동은 활동 로그에 `admin.review.hide` · `.restore` · `.purge`(신발 · 원래 작성자 · 지운 건수)로 남긴다. `admin.*` 는 180일 보관(`ActivityCleanup`). [code:backend/src/main/java/com/kopo17/runshoes/api/AdminReviews.java:83] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminReviews.java:95] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminReviews.java:111] [code:backend/src/main/java/com/kopo17/runshoes/activity/ActivityCleanup.java:37-39] [code:backend/src/main/resources/application.yml:48]
- **상세 모달에는 숨기기만 둔다(2026-11-15 사용자).** 예전에는 admin 이 상세 모달에서 남의 리뷰를 바로 하드 삭제했다(되돌릴 수 없고 숨기기 흐름을 건너뛴다). 이제 남의 리뷰에는 「숨기기」만 보이고, 리뷰 관리와 같은 API · 같은 확인 창(`HideReviewConfirm`) · 같은 알림을 쓴다. 서버도 맞춰 admin 의 `DELETE /api/reviews/{id}`(남의 보이는 리뷰)는 403 `hide_first` — 영구 삭제는 숨긴 리뷰에서만(`05` 1-4). 자기 리뷰를 지우는 것은 누구나 그대로. 데모 관리자에게는 상세 모달에 버튼이 없다(예전 삭제 버튼과 같다). [code:src/components/ReviewSection.tsx:130-143] [code:src/components/ReviewSection.tsx:171-173] [code:src/components/HideReviewConfirm.tsx] [code:src/auth/AuthContext.tsx:23] [code:backend/src/main/java/com/kopo17/runshoes/api/ReviewCollection.java:26] [code:backend/src/main/java/com/kopo17/runshoes/api/ApiException.java:60] [docs:05_api_contract.md]

**실사용 인증 — 뺐다(2026-11-15 사용자)** — 11-14 에 전체 리뷰의 「인증」 단추와 `POST /api/admin/reviews/{id}/verify` 를 만들었다가 둘 다 뺐다. 실사용 후기 · 기록 앱 스크린샷 같은 근거가 아직 없어 관리자가 근거 없이 켜게 되고, 켜면 공개 API 에 `verified: true` 가 나가 근거 없는 「인증」이 바깥에 보이기 때문이다. V3 의 `verified` · `verified_at` · `verified_by` 칸은 그대로 두고 쓰지 않는다. 공개 리뷰 응답의 `verified` 키는 계약 키라 그대로 나간다(늘 false). 뺄 때 운영 공개 API 로 센 `verified=true` 리뷰는 0건(2026-11-15, 숨긴 리뷰는 공개 API 에 안 보여 세지 못했다). 관리 목록 응답의 `verified` · `verifiedAt` 키도 그대로 둔다. [code:backend/src/main/java/com/kopo17/runshoes/api/AdminReviewController.java:20-21] [code:backend/src/main/resources/db/migration/V3__auth.sql:57-59] [code:backend/src/main/java/com/kopo17/runshoes/api/ReviewCollection.java:176] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminReviews.java:192-193] [c:85b9677] <!-- 확인 못 함: verified=true 0건은 운영 공개 API 로 센 값 -->

**회원 관리** — 회원 목록(가입 최근 순): 닉네임 · 이메일 · 역할 · 가입일 · 마지막 로그인 · 리뷰 수 · 상태(정상 · 잠김(풀리는 때) · 탈퇴). 이메일 · 닉네임으로 찾는다. 화면은 「계정 N개」라고 쓴다 — 계정은 사람이 아니다(체험 계정은 여럿이 함께 쓴다). [code:backend/src/main/java/com/kopo17/runshoes/api/AdminUserController.java:19-28] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminUserController.java:54] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminUserController.java:68-70] [code:src/pages/adminmy/Members.tsx:28-29] [code:src/pages/adminmy/Members.tsx:103]
- **로그인 잠금 풀기** — 계정에는 잠김 칸이 없고 `activity_logs` 의 실패를 센다(`04_auth.md` 1-4). 풀기는 `admin.login.unlock` 기록(대상 = 이메일 키)을 남기고, 계정 기준 셈이 마지막 로그인 성공 · 잠금 풀기 **뒤의** 실패만 본다. 잠겨 있지 않으면 409 `not_locked`, 탈퇴 계정 409 `withdrawn`. [code:backend/src/main/java/com/kopo17/runshoes/auth/LoginLocks.java:10-12] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminUserController.java:105-106] [docs:04_auth.md]
- **IP 잠금(같은 IP 15분 20번)은 계정 단위로 풀 수 없다** — 화면과 확인 창에 적는다. [code:backend/src/main/resources/application.yml:41-42] [code:src/pages/adminmy/Members.tsx:62-63] [code:src/pages/adminmy/Members.tsx:119]
- 데모 관리자도 이메일을 보고 이메일로 찾는다(아래 「데모 관리자」). [code:backend/src/main/java/com/kopo17/runshoes/api/AdminUserController.java:23]
- 잠김은 쪽의 계정마다 한 번 센다(20건이면 쿼리 20번) — 지금 규모에서는 그대로 둔다. [code:backend/src/main/java/com/kopo17/runshoes/api/AdminUserController.java:74]

| | admin | 데모 관리자 | 그 밖 |
|---|---|---|---|
| 목록 보기(회원 이메일 · 대화 원문 포함) | 된다 | 된다 | 401 · 403 [code:backend/src/main/java/com/kopo17/runshoes/api/Viewer.java:57-60] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminChatbotTurnController.java:31-32] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminUserController.java:23] |
| 숨기기 · 되살리기 · 영구 삭제 · 잠금 풀기 · 문의 처리 · 사전 추가 | 된다 | **서버가 403** `demo_admin` — 버튼은 보이고 누르면 문구 | 401 · 403 [code:backend/src/main/java/com/kopo17/runshoes/api/AdminReviews.java:26] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminUserController.java:26] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotMissController.java:146] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminTermController.java:18] [code:src/pages/AdminMy.tsx:19] |

#### 2. 왜 이렇게 했나

- **출처를 칸마다 저장한다(2026-10-29 사용자).** 이 아카이브의 값은 사이트마다 다르다(공시 무게 · 실측 무게 · 국내 정가). 어디서 읽었는지 없이는 값을 믿을 수도, 다시 확인할 수도 없다. [code:backend/src/main/resources/db/migration/V6__spec_sources.sql] [code:backend/src/main/java/com/kopo17/runshoes/api/SpecSources.java:11-18]
- **"정보 없음"을 고를 수 있어야 한다.** 예전 폼은 카본 · 와이드가 체크박스라 한 번 누르면 `true/false` 만 남았다 — 확인하지 않은 `false` 가 생겼다. 발볼 선택에는 "정보 없음"이 없어 `null` 인 210행에 첫 선택지 "좁음"이 보였다. 이제 모든 사실 칸에 `null` 을 고를 수 있다. [code:src/pages/ShoeForm.tsx:532-538] [code:src/pages/ShoeForm.tsx:542-555] (2026-11-02 기준) [c:a6bf21e]
- **"없음"은 근거가 있을 때만(2026-10-24 원칙).** 찾지 못한 것은 없는 것이 아니다. 근거 없는 와이드 `false` 23행을 비운 적이 있어 저장 단계에서 막는다. [code:src/pages/ShoeForm.tsx:225] [code:src/pages/ShoeForm.tsx:247-248] (2026-11-02 기준) [c:a6bf21e]
- **WEB 과 MAN 을 가르는 것은 누가 확인했나다(2026-11-02 사용자).** 둘 다 주소를 남긴다 — WEB 은 Claude 가 검색해 찾은 값, MAN 은 사람이 직접 보고 넣은 값. [code:src/pages/ShoeForm.tsx:18-20]
- **지우지 않고 숨긴다(2026-10-30 사용자).** 지우면 리뷰 · 찜이 사라진다. 실수로 숨겨도 되살릴 수 있게 하고, 정말 지울 때만 영구 삭제를 따로 둔다. [code:backend/src/main/resources/db/migration/V8__shoe_soft_delete.sql:1] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminController.java:19-20]
- **데모 관리자는 읽기 전용(2026-10-29 사용자).** 처음 보는 사람이 관리 화면을 그대로 둘러볼 수 있어야 하지만, 공개 체험 계정이 데이터를 바꾸면 안 된다. [code:backend/src/main/java/com/kopo17/runshoes/api/Viewer.java:11] [code:backend/src/main/resources/db/migration/V7__demo_admin.sql]

#### 3. 시도했던 것들

- **관리 화면에서 고친 값을 적재기가 되돌렸다(2026-10-29 발견).** 적재기는 카탈로그가 정답이라 DB 와 다르면 PATCH 했다. 적재 전에 운영의 사람 수정을 `decisions.json` 으로 가져오게 했다 — 사용자가 "가장 중요 — 구현 순서 맨 앞"으로 정했다. 자세한 것은 `01c_catalog_loader.md`. [code:catalog/pull-admin.mjs:5] [code:catalog/load.mjs:8-10] [code:catalog/decisions.json] [docs:01c_catalog_loader.md]
- **품번 형식을 넓혔다(2026-11-01).** 처음 규칙 `[A-Za-z0-9-]` 은 리허설에서 실제 카탈로그 값 5켤레(온 `71.98674`, 미즈노 `411448-RBUN / U1GD241751` 등)를 막았다. `.` `/` 공백을 더했다. 힌트도 처음에는 "색상 포함"이었다가 모델 번호만으로 바뀌었다(가격은 색상과 무관하고, 색상별 이미지를 여러 장 쓴다). [code:src/pages/ShoeForm.tsx:239] [code:src/pages/ShoeForm.tsx:486-491] [c:a6bf21e]
- **이미지 칸이 셋을 거쳤다(2026-10-30 → 11-01).** 대표 · 추가를 따로 두던 것 → 목록 하나에 "대표로 지정" 버튼 → 핸들로 끌어 놓기. 1번 자리가 대표라는 규칙 하나로 줄었다. [code:src/pages/ShoeForm.tsx:336-342]
- **늦게 온 응답이 입력을 덮었다(2026-11-01, V11 리허설).** 수정 화면이 신발을 받기 전에 빈 폼을 그려, 발볼을 고른 뒤 응답이 와 "보통"으로 되돌아갔다. 받기 전에는 폼을 그리지 않게 고쳤다. [code:src/pages/ShoeForm.tsx:394-396]
- **적재기 스냅숏을 한 건씩 쓰게 했다(2026-11-01).** 리허설에서 품번 220건을 쓰고 멈춘 뒤 다시 돌리자, 그 220건이 관리자 수정으로 잘못 가져와졌다. 쓰기 한 건마다 스냅숏을 고친다. [code:catalog/load.mjs:214] [c:a6bf21e]
- **"삭제"를 "숨김"으로 부른다(2026-11-01).** 버튼이 "삭제"인데 실제로는 숨겼다 — 영구 삭제가 생기며 이름을 나눴다. [code:src/components/HideShoeConfirm.tsx:7] [code:src/pages/Admin.tsx:350-352]

#### 4. 남은 한계

- **와이드 "없음"의 출처는 관리 폼만 요구한다.** API 로 직접 쓰면 출처 없는 `false` 가 들어갈 수 있다. 안 하는 까닭: 서버도 요구하려면 옛 계약(W30 · W36)을 의도한 변경으로 받아들여야 한다. [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:31] [code:src/pages/ShoeForm.tsx:225]

**조건: 우리가 고르지 않은 것**
- **보완 필요가 많다.** 302켤레 중 261켤레에 빈 칸이 있다. 대부분 발볼 · 와이드 · 가격이다 — 와이드는 재조사가 채운다(`01a_catalog_sources.md` 1-7). [docs:01a_catalog_sources.md] (2026-11-02 기준) [c:a6bf21e] <!-- 확인 못 함: 302, 261 은 운영에서 센 수 -->
- **동시 수정을 막지 않는다.** 두 관리자가 같은 신발을 고치면 나중 저장이 이긴다(관리자는 사실상 한 명). [code:src/pages/ShoeForm.tsx:302-306]

#### 5. 검증 항목

- 계약 시험 spring-v6 — 리뷰 숨기기(X157~X176: 401 · 403 · 데모 관리자 403 · 409 · 공개 목록에서 빠짐 · 평점 다시 셈 · 되살리기 · 영구 삭제) · admin 의 남의 리뷰 공개 API 지우기 403 `hide_first`(X222 · X223, spring-v14-summary Y42) · 데모 관리자 403(X10~X16) · 숨김 · 되살리기(X30~X43) · 품번 · 수정 이력 · 적재기 제외 · 영구 삭제(X100~X115) · 와이드 범위 · NOTFOUND(X116~X122). [code:contract/scenarios.mjs:502] [code:contract/scenarios.mjs:521] [code:contract/scenarios.mjs:572-573] [code:contract/scenarios.mjs:300] [code:contract/scenarios.mjs:356-362] [code:contract/scenarios.mjs:369-383] [code:contract/scenarios.mjs:424-451] [code:contract/baseline/spring-v6/]
- 적재기 건조 실행이 관리 화면 수정 뒤에도 그 칸을 되돌리지 않는지(`어드민 수정 N건` 가져오기 로그). [code:catalog/load.mjs:45-46]
- 화면: 값을 바꾸면 출처가 비는지 · 와이드 "없음"에 출처 없으면 저장되지 않는지 · 데모 관리자로 저장하면 문구가 뜨는지.
