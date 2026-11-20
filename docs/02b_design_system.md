<!--
다루는 곳: src/index.css, src/tokens.css, src/components/, src/pages/, index.html, public/images/hero-shoe.webp
읽은 커밋: af93ce0
-->
# 02b 디자인
> 상태: 2026-11-17 코드와 맞춰 봄. 운영에서 쓰는 중(2026-11-02 확인). 원천: `src/index.css`(색, 글꼴 토큰), `src/tokens.css`(크기, 배율), 컴포넌트 CSS. 처음 시안과 인계 문서는 `archive/design-prompt.md`, `archive/design-handoff.md` [code:src/index.css:1-29] [code:src/tokens.css:1-10] [docs:archive/design-prompt.md] [docs:archive/design-handoff.md]

#### 0. 한 줄 요약

**표본 전시실**. 러닝화를 판매 상품이 아니라 관찰, 계측하는 표본으로 다룬다. 흰 바탕 사진 칸을 둔 카드, 격자선. **강조색은 딥 틸 `#1D7A72`, 보조 강조색은 코랄**이다. [code:src/components/ShoeCard.css:14-19] [code:src/pages/ShoeList.css:4-5] [code:src/index.css:3] [code:src/index.css:14-18]

#### 1. 최종 설계

#### 1-1. 컨셉

- 데미언 허스트의 포름알데히드 표본 연작에서 시각 언어를 빌렸다. 두꺼운 흰 프레임, 유리 상자, 표본번호.
- 카드 캡션은 표본번호 형식(`NO.01 · 조깅·회복주`, 본문 글꼴). [code:src/components/ShoeCard.tsx:51-53] [code:src/components/ShoeCard.css:106-109] [code:src/index.css:37-38]
- 신발 이미지는 같은 각도, 같은 방향, 같은 배율로 맞춘다(`01b_catalog_images.md`, 대표 이미지 고르기). [docs:01b_catalog_images.md]
- 구매 버튼, 할인 배지, 가격 강조 같은 커머스 요소를 두지 않는다. 정보 페이지다.

#### 1-2. 색(`src/index.css`)

| 토큰 | 값 | 쓰는 곳 |
|---|---|---|
| `--accent` | `#1d7a72` 딥 틸 | 고른 필터 칩, 찜 하트, 평점 숫자, 고른 정렬, 토글, 주요 버튼 [code:src/index.css:3] [code:src/components/FilterBar.css:37-38] [code:src/components/ShoeCard.css:85-86] [code:src/components/SortBar.css:20] [code:src/components/SortBar.css:43] |
| `--coral`, `--coral-strong`, `--coral-soft`, `--coral-border` | `#ff7a59`, `#c2462a`, 옅은 배경, 테두리 | **보조 강조**. AI 리뷰 요약 상자, 관리 화면 "보완 필요" 탭, 비교하기의 분포 그래프의 다른 신발 눈금과 범례(`.cdist__other`). 글자와 선은 `--coral-strong` [code:src/index.css:15-18] [code:src/components/ReviewSummary.css:3-5] [code:src/pages/Admin.css:327-336] [code:src/pages/Compare.css:583-584] [code:src/pages/Compare.css:628-629] |
| `--bg-dark`, `--bg-panel` | `oklch(0.11 0 0)`, `oklch(0.13 0 0)` | 히어로 [code:src/index.css:4-5] |
| `--bg-light` | `oklch(0.965 0.002 90)` | 본문 바탕(갤러리 톤 오프화이트) [code:src/index.css:6] [code:src/index.css:39] |
| `--text-strong`, `--text-mid`, `--text-weak`, `--text-invert` | `oklch(0.16 / 0.42 / 0.58 / 0.97 0 0)` | 글자 위계 [code:src/index.css:9-12] |
| `--border`, `--border-light` | `oklch(0.8 0 0)`, `oklch(0.85 0 0)` | 격자선, 프레임 안쪽 선 [code:src/index.css:23-24] |
| `--danger`, `--danger-soft` | `oklch(0.5 0.18 25)`, `oklch(0.7 0.12 25)` | 오류 문구, 지우기 [code:src/index.css:20-21] |

- **강조색은 딥 틸, 보조 강조색은 코랄.** 딥 틸은 "고른 것 · 내 것 · 점수"에, 코랄은 그와 구분해야 하는 것(AI 요약, 할 일, 비교 화면의 주의 줄, 다른 신발 표시)에만 쓴다. 챗봇 단추와 말풍선은 청록 `#14807a`를 쓴다(아직 `index.css` 토큰이 아니다). 그 밖의 유채색은 쓰지 않는다. [code:src/index.css:3] [code:src/index.css:14-18] [code:src/components/ChatBot.css:12]
- 무채색은 oklch 로 명도만 바꾼다. [code:src/index.css:4-12] [code:src/index.css:23-24]

#### 1-3. 글꼴

- 본문 `--font-base` Noto Sans KR(400~800), `--font-mono` IBM Plex Mono 는 `index.css` 에 정의하고 `index.html` 에서 불러오기만 한다. 지금 쓰는 곳이 없다. 로고 "RUNSHOES" 는 Archivo Black. [code:src/index.css:27-28] [code:index.html:9] [code:index.html:14] [code:src/components/Header.css:33]
- 크기 위계: 히어로 카피 > 모달 모델명 > 카드 모델명 > 평점 > 라벨과 버튼 > 스펙 수치와 캡션. [code:src/components/Hero.css:25] [code:src/components/ShoeModal.css:148] [code:src/tokens.css:29-41]

#### 1-4. 크기 토큰과 배율(`src/tokens.css`)

- 글자 크기는 **기준값 × `--text-scale`** 로 쓴다: `font-size: calc(var(--fs-card-model) * var(--text-scale))`. [code:src/tokens.css:2]
- 배율은 영역에 직접 선언한다. 필터 칩, 마이페이지 목차, 활동 요약 1.3, 정렬, 카드, 랭킹, 추천 결과, 관리 폼 칸 묶음 제목 1.5, 카드 모델명 1.3(`--model-scale`), 카드 찜 알약 1.2(`--like-scale`). 헤더, 히어로, 페이지 제목은 배율을 받지 않는다. [code:src/tokens.css:4] [code:src/tokens.css:71-92] [code:src/components/ShoeCard.css:113]
  - `:root` 토큰에 `var()` 를 섞으면 `:root` 에서 값이 굳어 하위에서 바꿀 수 없다. 그래서 배율은 영역 선택자에 둔다. [code:src/tokens.css:5]
- 떠 있는 버튼. 오른쪽 아래 "맨 위로", 왼쪽 아래 챗봇, 같은 크기와 같은 거리(`--fab-size` 48px, `--fab-offset` 16px, 1199px 이하 44와 12px). 좌우 여백 `--page-gutter`(72, 64, 20px)가 버튼 범위보다 넓어 데스크톱과 태블릿에서는 스크롤해도 버튼이 글자 위를 지나가지 않는다. [code:src/tokens.css:45-69] [code:src/components/ScrollTop.css:3-4] [code:src/components/ChatBot.css:3-4]

#### 1-5. 형태

- **카드**. 이미지 영역 `aspect-ratio: 1 / 1`, 카드 폭을 꽉 채운 흰 바탕(안쪽 프레임과 선 없음, 2026-10-31 사용자). 카드 사이는 갭 없이 1px 격자선으로 나눈다. 모서리는 각지게(0). [code:src/components/ShoeCard.css:1-20] [code:src/pages/ShoeList.css:1-5]
- **그림자**. 카드에는 없다. 모달, 드롭다운 같은 실제로 떠 있는 것만. [code:src/components/ShoeModal.css:22] [code:src/components/ConfirmModal.css:21] [code:src/components/Header.css:141] [code:src/components/TermTooltip.css:30]
- **칩과 토글**. 완전 둥근 모서리(`border-radius: 100px`). [code:src/components/FilterBar.css:24] [code:src/components/SortBar.css:36]
- **여백 리듬**. 섹션 사이는 크게(24~40px), 카드 안은 촘촘하게(6~18px).
- **히어로**. 왼쪽은 "러닝화, 제대로 읽기" 문구가 얹힌 사진, 오른쪽은 신발 옆모습 한 장(호카 시엘로 X1 3.0, 카탈로그 131번) 위에 용어 셋(스택하이트, 미드솔, 카본 플레이트)의 선이 하나씩 쌓이는 설계도. 신발, 이름, 자 눈금이 먼저 뜨고, 용어마다 선이 그어진 뒤 이름표에 이 신발의 값(38mm, PEBA, 있음)이, 사진 아래 검은 띠에 용어 이름과 풀이가 한 글자에 0.03초씩 박힌다. 그은 선은 남고, 셋이 다 그어지면 머문 뒤 처음부터 다시 돈다. [code:src/components/Hero.tsx:50-95] [code:src/components/Hero.tsx:11-16] [code:src/components/Hero.tsx:126-156] 선은 어디인지를, 글은 무엇인지를 말하게 하려는 것이라 선과 글자는 처음부터 떠 있지 않다. 용어는 옆모습에서 자리를 정확히 짚을 수 있는 셋만 둔다. 드롭은 발바닥이 놓이는 면이 옆벽 안쪽이라 옆모습에 보이지 않아 두지 않고, 카본 플레이트 선은 옆면 무늬를 따라 어림한 것이다. [code:src/components/Hero.tsx:34-37] 풀이는 용어 사전 설명의 첫 문장이고, 사전에 없는 용어는 비워 둔다. [code:src/components/Hero.tsx:101-102] [code:src/components/Hero.tsx:119-123] 움직임을 줄여 달라는 설정에서는 다 그어진 그림을 그대로 둔다. 라이브러리 없이 타이머와 SVG 로 그린다. [code:src/components/Hero.tsx:133-138]
- **드롭다운**. `appearance: none` + 배경 화살표. 관리 폼은 오른쪽 12px, 안쪽 여백 36px이고 관리자 페이지 고르기 칸은 오른쪽 10px, 안쪽 여백 30px로 아직 같지 않다(`TODO.md`). [code:src/pages/ShoeForm.css:166-174] [code:src/pages/AdminMy.css:64-72]
- **화살표**. 글자 ‹ › 대신 SVG `Chevron`(글꼴 기준선 때문에 가운데가 맞지 않았다). [code:src/components/Chevron.tsx:1-2]

#### 1-6. 반응형

| 폭 | 그리드 | 그 밖 |
|---|---|---|
| 1200px 이상 | 3열 | 검색창이 칩 오른쪽 [code:src/pages/ShoeList.css:3] [code:src/components/FilterBar.tsx:17] |
| 768~1199px | 2열 | 검색창이 칩 위 한 줄, 칩은 가로 스크롤(오른쪽이 흐려진다) [code:src/pages/ShoeList.css:19-21] [code:src/components/FilterBar.css:42-43] [code:src/components/FilterBar.css:60] |
| 767px 이하 | 1열 | 햄버거 서랍, 모달은 세로로 쌓고 스크롤 [code:src/pages/ShoeList.css:29-31] [code:src/components/Header.css:232-241] [code:src/components/ShoeModal.css:260-271] [code:src/components/ShoeModal.css:20] |

#### 1-7. 하지 않는 것

- 장식용 그라데이션(히어로 이미지 위 가독성용 어두운 오버레이와 옅은 상자 바탕은 허용), 카드 드롭섀도, 이모지(좋아요와 챗봇 말풍선에 쓰는 것은 둔다), 딥 틸과 코랄 밖의 유채색(챗봇 청록은 둔다), 모든 요소를 같은 회색 카드에 담기, 균일한 여백, 커머스 요소, 각도, 방향, 배율이 서로 다른 신발 이미지. [code:src/components/ShoeCard.css:1-8] [code:src/components/ReviewItem.tsx:58] [code:src/components/ChatBot.tsx:286] [code:src/pages/Account.tsx:352] [code:src/pages/adminmy/Reviews.tsx:155]
- **다크 모드를 두지 않는다.** 러닝화를 고르는 화면이라 밝은 바탕 하나로 간다. [code:src/index.css:1-29]

#### 2. 왜 이렇게 했나

- **표본으로 보이게.** 러닝화 사이트는 대부분 쇼핑몰이다. 이 아카이브는 스펙과 리뷰만 다루므로, 상품이 아니라 계측 대상처럼 보여야 내용과 맞는다. 흰 사진 칸, 격자, 표본번호가 그 장치다. [code:src/components/ShoeCard.css:14-19] [code:src/components/ShoeCard.tsx:51-53]
- **유채색을 적게.** 유채색이 적으면 그 색이 곧 "봐야 할 곳"이다. 딥 틸은 고른 필터, 내 찜, 평점에, 코랄은 그와 성격이 다른 것에만.
- **크기를 토큰 × 배율로.** 홈 카드 글씨를 키울 때 값 수십 개를 고치지 않고 배율 하나로 바꾸려고. 마이페이지와 관리 폼 제목도 홈 정렬과 같은 크기를 쓰게 같은 배율을 받는다. [code:src/tokens.css:71-92]

#### 3. 시도했던 것들

- **AI 디자인 시안에서 시작했다(2026-07).** 프롬프트(`archive/design-prompt.md`)로 hi-fi HTML 시안을 받고, 인계 문서(`archive/design-handoff.md`)대로 React 로 옮겼다. 1차 수정(2026-07-21)에서 히어로 3분할이 신발 세 켤레로 보이던 것, 스펙 라벨이 부위와 맞지 않던 것, 카드가 흰 박스에 가깝던 것을 고쳤다. [docs:archive/design-prompt.md] [docs:archive/design-handoff.md]
- **히어로 해부도 3분할 → 한 장 설계도.** 시안은 신발 한 짝이 패널 셋에 걸쳐 이어지고 라벨이 부위에 선으로 붙는 정지 화면이었다. 지금은 신발 한 장 위에 용어의 선이 차례로 그어져 쌓인다. [code:src/components/Hero.tsx:50-95]
- **보조 강조색 코랄을 더했다(2026-11-01 사용자).** 처음 원칙은 "강조색은 딥 틸 하나"였다. 그런데 AI 리뷰 요약 상자가 베스트 리뷰(옅은 틸)와 구분되지 않았고(그 전에는 앰버였다), 관리 화면의 "보완 필요" 탭은 할 일이라 다른 탭과 구분돼야 했다. 둘을 구분하는 보조 강조색으로 코랄을 정했다. [code:src/index.css:14-18] [code:src/components/ReviewSummary.css:3-5] [code:src/pages/Admin.css:327-336]
- **코랄을 바탕용과 글자용으로 나눴다(2026-11-01).** 원색 `#FF7A59` 는 흰 바탕 대비 2.57:1 이라 글자와 선으로 쓰면 읽기 어렵다. 옅은 바탕과 테두리는 원색에서(`--coral-soft`, `--coral-border`), 글자, 선, 고른 탭은 진한 코랄 `#C2462A`(`--coral-strong`, 흰 바탕 5.0:1)로 나눴다. [code:src/index.css:14-18]
- **화면 다듬기(2026-10-30 사용자).** 마이페이지와 관리 폼의 제목 크기를 홈 정렬과 같은 토큰으로, 체험 카드와 갤러리 화살표를 SVG 로(지금 체험 카드에는 화살표가 없다), 찜 카드를 행택 모양(끈 구멍과 바코드)으로. 자세한 것은 `02_screens.md` 3절. [code:src/tokens.css:71-81] [code:src/components/DemoCards.tsx:4-6] [code:src/components/Chevron.tsx:1-2] [code:src/components/Barcode.tsx:1-5] [code:src/pages/Account.css:632] [docs:02_screens.md]
- 헤더 "맞춤 추천" 링크의 파랑 `#2a6f97` 은 메뉴를 같은 색, 지금 화면만 강조색으로 바꾸며 없앴다(2026-11-09). [code:src/components/Header.tsx:17]

#### 4. 남은 한계

**조건: 우리가 고르지 않은 것**
- **이미지 각도 통일은 데이터에 달렸다.** 카탈로그 302켤레의 대표 이미지는 같은 방향 정측면을 고르지만, 출처 사진에 따라 배율과 여백이 조금씩 다르다. [docs:01b_catalog_images.md] (2026-11-02 기준) [c:a6bf21e]

#### 5. 검증 항목

- 새 색을 쓸 때 `index.css` 토큰인지. `grep -rhoE "#[0-9A-Fa-f]{6}" src --include=*.css` 로 토큰 밖 값을 센다(지금 토큰 정의 외 `#14807a`, 회색 셋, `#000000`). [code:src/components/ChatBot.css:12] [code:src/components/ChatBot.css:79] [code:src/components/ChatBot.css:94] [code:src/components/ChatBot.css:183] [code:src/components/Header.css:63]
- 글자와 선 대비 4.5:1 이상(코랄은 `--coral-strong` 만 글자에). [code:src/index.css:14-16]
- 1200, 768, 375px 폭에서 그리드 열 수, 헤더, 떠 있는 버튼이 글자를 가리지 않는지.
