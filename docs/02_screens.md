<!--
다루는 곳: src/App.tsx, src/pages/, src/components/, src/utils/, src/auth/, src/api.ts, backend/src/main/java/com/kopo17/runshoes/api/, backend/src/main/java/com/kopo17/runshoes/activity/
읽은 커밋: 606b730
-->
> 상태: 2026-11-17 코드와 맞춰 봄. 운영에서 쓰는 중(2026-11-02 확인, 비교하기는 2026-11-09 운영 반영). 화면 11개(라우트 10 + 상세 모달). 원천: `src/App.tsx`, `src/pages/*`, `src/components/*`, `src/utils/display.ts`. 관리 화면은 `03_admin.md`, 로그인, 계정 규칙은 `04_auth.md`, 색, 글꼴은 `02b_design_system.md` [code:src/App.tsx:29-40] [code:src/components/ShoeModal.tsx:84-239] [docs:03_admin.md] [docs:04_auth.md] [docs:02b_design_system.md]

#### 0. 한 줄 요약

React 단일 페이지 앱이다. 홈 하나에서 **찾고(용도 · 검색 · 정렬) → 카드를 누르고 → 상세 모달에서 스펙 · 리뷰를 본다.** 그 옆에 추천받기(5문항 → 점수순), 비교하기(고른 신발을 점수 없이 나란히), 러너들의 선택(랭킹)이 있다. 값이 없으면 칸을 숨기지 않고 "정보 없음"으로 보여 준다. [code:src/pages/ShoeList.tsx:84-125] [code:src/pages/Recommend.tsx:26-128] [code:src/pages/Compare.tsx:21] [code:src/pages/Best.tsx:46-51] [code:src/utils/display.ts:1-5]

#### 1. 최종 설계

#### 1-1. 라우트

| 라우트 | 화면 | 누가 |
|---|---|---|
| `/` | 홈 — 히어로 슬라이드 · 용도 칩 · 검색 · 정렬 · 찜만 보기 · 카드 그리드 · 상세 모달(`?shoe={id}`) | 누구나 [code:src/App.tsx:29] [code:src/components/Hero.tsx:6-22] [code:src/components/FilterBar.tsx:4-11] [code:src/components/SortBar.tsx:3-8] [code:src/pages/ShoeList.tsx:28-35] |
| `/recommend` | 추천받기 — 5문항 → 점수순 결과 | 누구나 [code:src/App.tsx:30] [code:src/pages/Recommend.tsx:26-128] |
| `/compare` | 비교하기 — 2~5켤레를 나란히(`?ids=` · `?pick=`, `08_compare.md`) | 누구나 [code:src/App.tsx:31] [code:src/utils/compare.ts:8] [code:src/pages/Compare.tsx:21] [docs:08_compare.md] |
| `/best` | 러너들의 선택 — 종합 점수 1~5위 · 용도별 1위 | 누구나 [code:src/App.tsx:32] [code:src/pages/Best.tsx:50-51] [code:src/pages/Best.tsx:94-96] |
| `/login` · `/signup` | 로그인 · 가입. 성공하면 `returnTo`(같은 사이트 경로만)로 | 누구나 [code:src/App.tsx:33-34] [code:src/auth/session.ts:199] [code:src/pages/Login.tsx:15] [code:src/pages/Signup.tsx:22] |
| `/account` | 마이페이지(`?tab=`) | 로그인 [code:src/App.tsx:35] [code:src/pages/Account.tsx:48] |
| `/admin` · `/new` · `/edit/:id` | 관리 화면(`03_admin.md`) | admin · 데모 관리자 [code:src/App.tsx:37-39] [code:src/auth/RequireAuth.tsx:13] [docs:03_admin.md] |
| `*` | NotFound | [code:src/App.tsx:40] |

- 경로 가드(`RequireAuth`)는 화면 안내용이다 — 권한은 서버가 막는다. [code:src/auth/RequireAuth.tsx:6-9] [code:src/App.tsx:36]
- 화면을 옮기면 맨 위에서 시작한다(`ResetScroll`). 경로가 실제로 바뀔 때만 — 상세 모달(`?shoe=`) · 마이페이지 목차(`?tab=`)는 스크롤을 그대로 두고, 뒤로 · 앞으로는 브라우저에 맡긴다. [code:src/components/ResetScroll.tsx:13-17] [code:src/App.tsx:25]

#### 1-2. 홈

- **용도 칩** — 전체 · 조깅·회복주 · 템포·인터벌 · LSD·장거리 · 레이스 · 트레일. [code:src/components/FilterBar.tsx:4-11]
- **검색** — 브랜드 · 모델 · 영어 이름 · 검색용 다른 표기(V13)를 서버가 거른다(`?search=`, 낱말 AND · 대소문자 · 공백 무시 — `젤카야노` · `SC 페이서` · `퓨어셀` 도 맞는다). [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:62] [code:backend/src/main/java/com/kopo17/runshoes/api/ListQuery.java:54-57] [code:backend/src/main/java/com/kopo17/runshoes/api/ListQuery.java:116-130] [code:backend/src/main/resources/db/migration/V13__model_en.sql:1-8] [code:src/pages/ShoeList.tsx:46]
- **정렬** — 기본 · 평점순 · 리뷰순 · 좋아요순(서버 `_sort`). **찜만 보기**는 별도 페이지가 아니라 토글이다(로그인했을 때만). [code:src/components/SortBar.tsx:3-8] [code:src/pages/ShoeList.tsx:47-50] [code:src/pages/ShoeList.tsx:99] [code:backend/src/main/java/com/kopo17/runshoes/api/ListQuery.java:79-92]
- 거르기 · 정렬은 모두 서버가 하고, 화면은 받은 목록을 그린다. 카드: 사진 · 브랜드 · 모델 · 용도 · 요약 · 중량 · 드롭 · 발볼 · 안정성 · 카본 · 평점 · 리뷰 수 · 찜. [code:src/pages/ShoeList.tsx:41-67] [code:src/components/ShoeCard.tsx:29-87]
- **카드 높이는 같은 줄끼리 맞춘다**(2026-11-09 사용자). 요약은 줄 수를 자르지 않고, 화면에서 같은 줄에 뜬 카드끼리 모델명 · 요약 칸을 그 줄의 가장 긴 높이에 맞춘다(셋이면 셋 중, 둘이면 둘끼리, 혼자면 제 길이) — 아래 스펙 · 평점 줄이 그 줄 안에서 같은 높이에 온다. `CardRowSync`(`App.tsx` 에 하나)가 카드의 화면 위치(top)로 줄을 가르고 `min-height` 를 넣는다. 폭이 바뀌거나 목록이 바뀌거나 글꼴이 늦게 오면 다시 잰다. 요약 문구 규칙은 `01d_catalog_copy.md`. [code:src/components/CardRowSync.tsx:3-29] [code:src/components/CardRowSync.tsx:39-46] [code:src/App.tsx:42] [docs:01d_catalog_copy.md]
- 찜을 누르면 계정별로 저장된다(`PUT/DELETE /api/shoes/{id}/like`). 비로그인은 로그인 화면으로 갔다가 돌아온다. [code:src/auth/useShoeLike.ts:16-20] [code:backend/src/main/java/com/kopo17/runshoes/api/LikeController.java:39] [code:backend/src/main/java/com/kopo17/runshoes/api/LikeController.java:47]

#### 1-3. 상세 모달

- 주소 `?shoe={id}` — 새로 고침하거나 로그인하고 돌아와도 같은 신발이 열린다. 배경을 누르면 닫힌다. [code:src/pages/ShoeList.tsx:27-35] [code:src/components/ShoeModal.tsx:85-92]
- **사진** — 2장 이상이면 좌우 화살표 · 썸네일 줄(끌어서 넘긴다), 1장이면 사진만. 이미지가 없거나 못 불러오면 자리표시로 레이아웃을 지킨다. PC 는 화살표 · 신발 가운데가 오른쪽 스펙표의 스택하이트 아래 구분선에 온다(요약 문구가 있는 신발 기준 — 없는 8켤레는 구분선이 34px 위, 2026-11-03 사용자: 그대로 둔다). [code:src/components/ShoeGallery.tsx:7-11] [code:src/components/ShoeGallery.tsx:77-110] [code:src/components/ShoeImage.tsx:13-18] [code:src/components/ShoeModal.css:83-84] [c:e3b60c0]
- **영어 이름** — 브랜드 줄에 가운뎃점으로 붙인다(`뉴발란스 · FuelCell SuperComp Pacer v2`, 브랜드와 같은 크기 · 색). 없으면 브랜드만. 홈 카드에는 넣지 않는다(카드가 복잡해 보인다, 2026-11-03 사용자). 검색용 다른 표기는 보이지 않는다. [code:src/components/ShoeModal.tsx:110-111] [code:src/components/ShoeCard.tsx:54-55] [code:backend/src/main/resources/db/migration/V13__model_en.sql:3]
- **스펙** — 중량 · 드롭 · 스택하이트 · 발볼 · 와이드 모델 · 안정성 · 미드솔 · 카본 플레이트 · 가격. 용어마다 툴팁(`terms`, 한 번에 하나만 열린다, 화면 밖으로 나가지 않는다). [code:src/components/ShoeModal.tsx:117-208] [code:src/components/ShoeModal.tsx:215-223] [code:src/components/ShoeModal.tsx:41] [code:src/components/TermTooltip.tsx:13-17] [code:src/components/ShoeModal.css:315-318] [code:src/components/TermTooltip.css:44-49]
  - 값이 없으면 **"정보 없음"** — 칸을 숨기지도, 기본값으로 메우지도 않는다. [code:src/utils/display.ts:1-7] [code:src/components/ShoeModal.tsx:216-217]
  - 와이드 모델: 있음 · 국외에만 있음 · 없음 · 정보 없음(`wideLabel`). "없음"에는 출처를 붙이지 않는다(검색 결과 없음은 작업 과정, 2026-11-02 사용자). [code:src/utils/display.ts:8-10]
  - 와이드 모델 ⓘ 는 값 넷을 다 설명한다(2026-11-03 사용자 문구) — 이 툴팁은 `terms` 테이블에 없고 화면이 가진다(`src/utils/terms.ts WIDE_TERM` — 상세 모달 · 비교표가 같이 쓴다). [code:src/utils/terms.ts:3-17] [code:src/components/ShoeModal.tsx:166] [code:src/components/compare/CompareTable.tsx:108]
  - 가격은 **"발매가 199,000원"** — 평점 줄과 같은 꼴(글자 14px · 숫자 22px). 출처 · 읽은 날은 모달에 내지 않는다 — "크림 2026/11/01 기준"이 그 곳에서 지금 그 값에 파는 것처럼 보였다(2026-11-03 사용자). 관리 화면에만 있다. [code:src/components/ShoeModal.tsx:214-223] [code:src/components/ShoeModal.css:215-225] [code:src/components/ShoeModal.css:236-246] [code:src/pages/Admin.tsx:68]
  - 한 줄 요약은 강조색 굵게(크기 그대로). [code:src/components/ShoeModal.css:158-162]
- **리뷰 요약** — 리뷰 3개 이상이면 AI 요약(좋았던 점 · 아쉬운 점, "의견이 갈립니다"). 요약이 없으면(`summary: null`) 카드를 숨긴다. [code:src/components/ReviewSummary.tsx:7-11] [code:src/components/ReviewSummary.tsx:31] [code:backend/src/main/java/com/kopo17/runshoes/summary/StaleRule.java:12] [code:backend/src/main/java/com/kopo17/runshoes/summary/SummaryService.java:139]
- **리뷰** — 처음에는 하나만: "도움이 돼요"가 가장 많은 리뷰(동점이면 최신, 전부 0 이면 최신 — 베스트 표시 없이). 나머지는 "리뷰 전체보기"로 편다. [code:src/components/ReviewSection.tsx:155-164] [code:src/components/ReviewSection.tsx:189-196]
  - 쓰기 폼은 셋 중 하나: 로그인 안내 · "이미 썼어요" · 작성 폼(별점 · 내용 10~300자, 남은 글자 수). 작성자는 계정 닉네임이라 입력 칸이 없다. [code:src/components/ReviewSection.tsx:199-261] [code:src/components/reviewRules.ts:9-13]
  - 내 리뷰는 그 자리에서 고친다(인라인). 지우기는 내 리뷰만, 확인 창을 거친다. 관리자에게는 남의 리뷰에 「숨기기」가 보인다 — 영구 삭제는 관리자 페이지 숨긴 리뷰에서만(2026-11-15 사용자, `03_admin.md` 1-6). "도움이 돼요"는 남의 리뷰에만 — 누르면 숫자만 바뀌고 순서는 그대로(베스트가 튀지 않게). [code:src/components/ReviewItem.tsx:12] [code:src/components/ReviewSection.tsx:170-174] [code:src/components/ReviewSection.tsx:263-273] [code:src/components/ReviewSection.tsx:145-153] [docs:03_admin.md]
  - **쓰는 중에 로그인이 끝나도** 쓰던 내용을 탭 안(sessionStorage)에 남겨, 다시 로그인하면 같은 신발 모달에서 이어 쓴다. [code:src/components/ReviewSection.tsx:20-36] [code:src/components/ReviewSection.tsx:66-77] [code:src/components/ReviewSection.tsx:93-96]
- 로그인한 사람이 모달을 열면 조회 기록(`shoe.view`)을 남긴다(같은 신발 30분에 한 번은 서버가 거른다). [code:src/components/ShoeModal.tsx:53-62] [code:backend/src/main/java/com/kopo17/runshoes/activity/ActivityController.java:27] [code:backend/src/main/java/com/kopo17/runshoes/activity/ActivityController.java:56-62]
- **비교에 담기** — 평점 · 가격 줄 아래 오른쪽 버튼. 마지막 비교 구성(이 브라우저)이 있으면 한 칸 더하고, 없으면 그 신발로 비교하기를 연다(4켤레까지 채운다). 비교하기 안에서 연 모달에는 없다. [code:src/components/ShoeModal.tsx:225-229] [code:src/components/ShoeModal.css:321-331] [code:src/utils/compare.ts:99-104] [code:src/pages/Compare.tsx:21]

#### 1-4. 추천받기 `/recommend`

- 다섯 문항(용도 · 발볼 · 안정성 · 쿠션 · 예산)에 답하면 상위 3켤레. **계산은 서버**(`GET /api/recommend`), **배점 · 경계 · 문구 · 데이터가 없을 때의 처리는 `10_recommend.md`**. [code:src/pages/Recommend.tsx:26-128] [code:src/pages/Recommend.tsx:201-211] [code:backend/src/main/java/com/kopo17/runshoes/compare/CompareController.java:64-66] [code:backend/src/main/java/com/kopo17/runshoes/compare/RecommendPolicy.java:237-251] [docs:10_recommend.md]
- 1위는 이유를 모두, 2~3위는 맞은 이유(✓)만 셋까지 보인다. 데이터가 없어 못 본 조건(ⓘ 회색 줄)은 순위와 상관없이 목록 맨 위에 보인다. [code:src/pages/Recommend.tsx:295-305] [code:src/pages/Recommend.tsx:318-331]
- 기다리는 동안 "고르는 중이에요…", 실패하면 "추천을 불러오지 못했어요". [code:src/pages/Recommend.tsx:283-284]
- 결과 아래 **"1~3위 비교하기"** — 결과 그대로 비교하기로(이미 고른 신발이라 자동 채우기는 하지 않는다). [code:src/pages/Recommend.tsx:346-349]

#### 1-5. 러너들의 선택 `/best`

```
score = rating × 20 × (reviewCount / (reviewCount + 3)) + likeCount × 0.5
```

- 평점만으로 순위를 매기면 "리뷰 1개에 5점"이 1위가 된다. 리뷰가 적을수록 평점 반영률을 낮춘다 — 리뷰 1개면 25%, 3개면 50%, 10개면 약 77%. 좋아요는 보조로 조금 더한다. 산식을 화면에도 적는다. [code:src/pages/Best.tsx:46-48] [code:src/pages/Best.tsx:64-70]
- 종합 1~5위와 용도별 1위. [code:src/pages/Best.tsx:50-51] [code:src/pages/Best.tsx:94-96]

#### 1-6. 마이페이지 `/account`

- 왼쪽 목차 · 오른쪽 본문. 본문 맨 위에는 늘 활동 요약(리뷰 · 찜 · 도움이 돼요 · 가입일). 휴대폰은 목차 아래 가로선. [code:src/pages/Account.tsx:34] [code:src/pages/Account.tsx:76-92] [code:src/pages/Account.css:411-419]
- 목차: 회원정보 수정(이메일은 보기만, 닉네임 · 비밀번호 따로 저장) · 내 활동(내 리뷰 · 찜 목록 · 도움받은 리뷰) · 회원 탈퇴. [code:src/pages/Account.tsx:77-85] [code:src/pages/Account.tsx:135] [code:src/pages/Account.tsx:188]
- **내 리뷰 · 도움받은 리뷰** — 표. 내용을 누르면 전문 모달(읽기 전용). 왼쪽 체크박스로 여러 개 골라 한꺼번에 삭제 · 도움 취소. [code:src/pages/Account.tsx:120-125] [code:src/pages/Account.tsx:287] [code:src/pages/Account.tsx:336] [code:src/pages/Account.tsx:349] [code:src/pages/Account.tsx:522] [code:src/components/ReviewReader.tsx]
- **찜 목록** — 홈 카드와 같은 칸을 같은 순서로(나란히 놓고 비교하게, 가격은 뺐다). 행택 모양 카드 — 위에 끈 구멍, 아래 바코드(Code 39, `RS` + id 네 자리). 여러 개 골라 한꺼번에 해제하거나, 2~5개를 골라 **"선택 비교"**로 비교하기를 연다. 사진은 홈 카드처럼 좌우 11% 를 띄운다(StockX · GOAT 사진 비율이 달라 높이만 정하면 GOAT 신발이 크게 보인다). [code:src/pages/Account.tsx:385-389] [code:src/pages/Account.tsx:425-435] [code:src/pages/Account.tsx:458-466] [code:src/components/Barcode.tsx:1-5] [code:src/pages/Account.css:280-282] [code:src/pages/Account.css:632]
- 한꺼번에 하는 일은 새 API 없이 기존 DELETE 를 하나씩 차례로 부른다. 일부가 실패하면 "N개 중 M개 …"로 알리고 실패한 것은 고른 채 둔다. [code:src/utils/bulk.ts:14-31] [code:src/pages/Account.tsx:275] [code:src/pages/Account.tsx:410] [code:src/pages/Account.tsx:510]
- **관리자 · 데모 관리자는 관리자 페이지를 본다**(2026-11-14) — 목차가 리뷰 관리 · 회원 관리 · 챗봇으로 바뀐다. 표 · 목차 모양은 그대로, 관리자 리뷰 표는 버튼이 둘이라 내용을 둘째 줄에 둔다. 머리 메뉴 · 서랍 · 목차 제목의 이름도 「마이페이지」 대신 「관리자 페이지」(2026-11-15 사용자, 주소 `/account` 그대로). 자세한 것은 `03_admin.md` 1-6. [code:src/pages/Account.tsx:39-43] [code:src/pages/AdminMy.tsx:28-46] [code:src/pages/AdminMy.css:92] [code:src/components/Header.tsx:36] [code:src/components/Header.tsx:141] [docs:03_admin.md]
- 회원 탈퇴 — 확인 화면. "계속 이용하고 싶어요"가 강조 버튼, "회원 탈퇴"는 빨간 테두리. [code:src/pages/Account.tsx:590] [code:src/pages/Account.tsx:629-634] [code:src/pages/Account.css:372-390]

#### 1-7. 공통

- **헤더** — 로고 · 홈 · 추천받기 · 비교하기 · 러너들의 선택 · 신발 관리(admin · 데모 관리자) · 로그인/계정 메뉴. 메뉴는 넷 다 같은 색이고 지금 보는 화면만 강조색(2026-11-09). 신발 관리 · 로그인은 메뉴가 아니라 배지(2026-11-15 사용자) — 평소에는 청록(`--accent`) 테두리만 있는 배지에 청록 글자, 보고 있을 때는 청록으로 채우고 흰 글자. 신발 관리는 목록 · 등록 · 수정(`/admin` · `/new` · `/edit/:id`)이 한 흐름이라 셋 다 채운다. 로그인은 로그인 · 회원가입(`/login` · `/signup`)이 한 흐름이라 둘 다 채운다. 모양은 관리 화면 「보기 전용」 배지(1px 테두리, 모서리 없음)를 따르고 글자 크기는 메뉴 그대로. 배지는 머리 메뉴에서만 — 서랍은 글씨로 두고 지금 보는 화면만 청록(신발 관리도 등록 · 수정에서 청록). 머리 메뉴 크기는 폭마다 구간을 나누지 않고 한 규칙이다(2026-11-15 사용자 — 구간마다 숫자를 박으니 768 · 900 · 1024 · 1200px 경계마다 로고와 「홈」이 붙거나 메뉴가 넘쳤다). 768px(서랍이 끝나는 폭)에서 1300px 까지 로고 30 → 64px · 메뉴 글자 17 → 23px · 메뉴 간격 8 → 28px · 세로줄 뒤 10 → 20px · 좌우 여백 20 → 48px · 위아래 여백 14 → 20px 이 함께 곧게 커지고(`clamp`), 그 밖은 양 끝 값에 머문다. 로고와 첫 메뉴 사이는 늘 16px 이상. 모두 폭에 비례하니 양 끝에서 들어가면 사이 폭에서도 들어간다 — 1300 은 관리자 + 닉네임 6칸(영문 W)이 가장 큰 값으로 들어가는 폭, 768 의 작은 값은 관리자 + 한글 닉네임 6칸이 다 보이는 값. 머리 메뉴의 닉네임은 먼저 글자 수로 자르고 — 6자까지 그대로, 7자 이상은 앞 5자 + 「…」(닉네임은 12자까지라 다 쓰면 메뉴가 넘쳤다) — 그래도 모자라면(가장 넓은 영문 등) 닉네임 칸만 줄어들어 말줄임으로 받는다. 마우스를 올리면 전체(title), 화면 읽기 프로그램에도 전체(aria-label). 서랍 · 마이페이지는 자르지 않는다. 배지 모양(여백 0.1em 0.4em, 1px 테두리)은 모든 폭에서 같다. 휴대폰은 햄버거 서랍. 계정 메뉴는 연 그 이동에서만 열려 있다. [code:src/components/Header.tsx:8-17] [code:src/components/Header.tsx:28-30] [code:src/components/Header.tsx:61-64] [code:src/components/Header.tsx:79-147] [code:src/components/Header.css:1-16] [code:src/components/Header.css:29] [code:src/components/Header.css:67-82] [code:src/components/Header.css:99-118] [code:src/pages/Admin.css:267]
- **챗봇** — 왼쪽 아래(오른쪽 아래 "맨 위로" 단추와 대칭). 같은 Pod 의 파이썬 사이드카(`chatbot/`)와 WebSocket(`/ws/chat`)으로. 신발을 말한 답 아래에는 "보러 가기" 버튼 하나 — 1켤레는 상세 모달, 2켤레 이상은 비교하기(작업 5-1, `archive/09_chatbot_rag_log.md` 옛 15절). 창을 닫으면 대화가 지워진다. 로그인한 사람만 쓴다 — 버튼은 누구에게나 보이고, 로그인 전에 누르면 패널 안에 "챗봇은 로그인한 뒤에 쓸 수 있어요. 체험 계정으로 바로 둘러볼 수 있어요." 와 [로그인](보던 화면으로 돌아온다). 로그아웃하면 연결을 닫는다(`09_chatbot_rag.md` 1-13절). [code:src/components/ChatBot.css:3-4] [code:src/components/ScrollTop.css:3-4] [code:src/api.ts:10-12] [code:chatbot/] [code:src/components/ChatBot.tsx:28] [code:src/components/ChatBot.tsx:38] [code:src/components/ChatBot.tsx:236-246] [code:src/components/ChatBot.tsx:263-281] [docs:09_chatbot_rag.md] <!-- 확인 못 함: 같은 Pod 의 사이드카라는 배치는 인프라 저장소 매니페스트에 있다 -->
- **반응형** — 1200px 이상 데스크톱 · 768~1199px 태블릿 · 767px 이하 휴대폰. 카드 그리드 3열 → 2열 → 1열, 목록 → 상세 모달 흐름은 모든 크기에서 같다. 검색창은 1200px 이상 칩 오른쪽, 그 아래로는 칩 위 한 줄. [code:src/pages/ShoeList.css:3] [code:src/pages/ShoeList.css:19-31] [code:src/components/FilterBar.tsx:17] [code:src/components/FilterBar.css:42-43]
- 확인 창은 공통 `ConfirmModal`(신발 숨김 · 리뷰 삭제 · 한꺼번에). 줄은 낱말 사이에서만 바꾸고(`word-break: keep-all`, 2026-11-15 사용자 — 「합니 / 다」처럼 끊겼다), 띄어쓰기 없는 긴 글(이메일 · 주소)만 창 안에서 끊는다(`overflow-wrap: anywhere`). 관리자 페이지의 처리 사유 · 용어 추가 창도 같은 상자(`confirm__box`)라 같이 따른다. [code:src/components/ConfirmModal.tsx:35] [code:src/components/ConfirmModal.css:12-17] [code:src/components/HideShoeConfirm.tsx:25] [code:src/components/ReviewSection.tsx:264] [code:src/pages/adminmy/ChatMisses.tsx:185] [code:src/pages/adminmy/ChatMisses.tsx:225]

#### 2. 왜 이렇게 했나

- **홈 하나에 목록 · 상세를 둔다.** 과제 요건이 "단일 화면 구조 유지"였다. 상세를 모달로 두고 주소(`?shoe=`)에 남겨 링크 · 새로 고침 · 로그인 왕복에도 같은 화면으로 돌아온다. [code:src/pages/ShoeList.tsx:27-35]
- **"정보 없음"을 보여 준다.** 빈 칸을 숨기면 "없다"로 읽히고, 기본값(`보통` · `없음`)으로 메우면 거짓이 된다. 이 아카이브는 출처가 있는 값만 싣는다(`01a_catalog_sources.md`). [code:src/utils/display.ts:1-7] [docs:01a_catalog_sources.md]
- **종합 점수에 신뢰도 가중치.** 리뷰 수를 더하면 리뷰가 많은 신발이 무조건 이기고, 평점만 보면 리뷰 1개가 이긴다. 리뷰 수로 평점 반영률을 조절했다. [code:src/pages/Best.tsx:46-48]
- **리뷰는 하나만 먼저.** 모달이 길어지지 않게 가장 도움이 된 리뷰 하나를 보이고 나머지는 펼친다. [code:src/components/ReviewSection.tsx:155-164]
- **찜 카드를 홈 카드와 같은 칸 · 같은 순서로(2026-10-30 사용자).** 찜 목록은 고른 신발을 나란히 비교하는 곳이다. [code:src/pages/Account.tsx:389]

#### 3. 시도했던 것들

- **json-server 시절의 공용 찜 · 클라이언트 평점(→ 2026-10-21).** 찜은 모두가 같이 쓰는 칸이었고, 평점 · 리뷰 수는 화면이 계산해 PATCH 했다. 로그인과 함께 찜은 계정별, 숫자는 서버가 세게 바뀌었고, 화면은 쓰기 뒤 목록만 다시 받는다. [code:src/pages/ShoeList.tsx:81-82] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:32-33]
- **상세 갤러리를 지웠다가 되살렸다(2026-10-30).** 카탈로그를 넓힐 때(`d3ff385`) 사진이 한 장뿐이라 갤러리를 지웠다. 색상 이미지를 모으면서 지금 사진 칸에 맞춰 되살렸다(`01b_catalog_images.md`). [code:src/components/ShoeGallery.tsx:8] [c:d3ff385] [docs:01b_catalog_images.md]
- **화살표를 글자에서 SVG 로(2026-10-30).** 글자 ‹ › 는 글꼴 기준선 때문에 가운데가 맞지 않았다 — `Chevron` SVG 로 바꿔 어긋남 0px. [code:src/components/Chevron.tsx:1-2] [c:a6bf21e]
- **스크롤 되돌리기가 상세 모달에서 튀었다(2026-10-30).** 처음에는 이동 방식만 바뀌어도 맨 위로 올려 모달을 열 때 튀었다. 이전 경로와 비교해 실제로 바뀔 때만 올린다. [code:src/components/ResetScroll.tsx:12-16]
- **마이페이지를 여러 번 다듬었다(2026-10-30 사용자, 1~5차).** 목차 · 활동 요약 글자 크기를 홈 정렬과 같은 토큰으로, 한꺼번에 버튼 이름("선택 삭제"가 체크박스 해제처럼 읽혀 "리뷰 삭제 · 찜 해제 · 도움 취소"로), 찜 카드 행택 · 바코드, "공감" 대신 "도움이 돼요". [code:src/pages/Account.tsx:287] [code:src/pages/Account.tsx:433-435] [code:src/pages/Account.tsx:522] [code:src/pages/Account.tsx:36]
- **화면 검증에서 찾은 것(2026-10-21).** `/account` 에서 로그아웃하면 가드가 로그인 화면으로 보냈다(홈으로 먼저 옮기고 끊는다). 768px 에서 로그인하면 헤더가 넘쳤다(닉네임 말줄임). [code:src/components/Header.tsx:52-59] [code:src/components/Header.css:115-118]

#### 4. 남은 한계

- 지금은 없다.

#### 5. 검증 항목

- 데스크톱 · 768px · 휴대폰 폭에서: 홈 → 카드 → 모달 → 리뷰 쓰기 → 닫기, 헤더가 넘치지 않는지.
- 비로그인으로 찜 · 리뷰 쓰기 → 로그인 → 같은 모달로 돌아와 쓰던 내용이 남는지.
- 값이 빈 신발의 모달에 "정보 없음"이 보이는지.
- `yarn build`(`tsc -b` 타입 검사 + vite)가 통과하는지. [code:package.json:8]
