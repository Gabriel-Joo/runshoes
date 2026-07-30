# RUNSHOES

> **러닝화, 제대로 읽기**
> 스펙은 빠짐없이, 용어는 설명과 함께

React · TypeScript · json-server 기반 러닝화 리뷰 아카이브를
Kubernetes 위에 GitOps CI/CD로 배포한 프로젝트

**🔗 Live Demo — https://kopo17-runshoes.std.kopoctc.kr**

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-000?logo=vite&logoColor=white)
![React Router](https://img.shields.io/badge/React_Router-7-CA4245?logo=reactrouter&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000?logo=express&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Kubernetes](https://img.shields.io/badge/Kubernetes-326CE5?logo=kubernetes&logoColor=white)
![Jenkins](https://img.shields.io/badge/Jenkins-D24939?logo=jenkins&logoColor=white)
![Argo CD](https://img.shields.io/badge/Argo%20CD-EF7B4D?logo=argo&logoColor=white)
![Harbor](https://img.shields.io/badge/Harbor-60B932?logo=harbor&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-000?logo=ollama&logoColor=white)

> **문서 안내**
>
> - 이 문서: 애플리케이션 (기획 · 요건 · 데이터 설계 · 화면)
> - [docs/INFRA.md](docs/INFRA.md): 쿠버네티스 GitOps CI/CD 파이프라인
> - [docs/DEPLOY.md](docs/DEPLOY.md): 웹 터미널(aisw-lab) 배포 절차

---

## 1. 기획 배경

**"러닝화 스펙을 다 보여주되, 모르는 말이 없게"** — 초보도 상급자도 같은 페이지를 보는 러닝화 정보 사이트

기존 러닝화 정보는 대부분 상급자 기준으로 쓰여 있다.
드롭, 스택하이트, 프로네이션 같은 용어가 설명 없이 나열되어 있어
초보 러너는 정작 "나에게 맞는 신발인지"를 판단할 수 없다.

RUNSHOES는 **정보를 덜어내지 않는다.**
대신 모든 전문 용어에 즉시 확인 가능한 설명(툴팁)을 붙여
초보와 상급자가 같은 페이지를 볼 수 있게 한다.

쇼핑몰이 아니라 **평점·리뷰 아카이브**다. 구매 버튼도, 가격 강조도 없다.
사용자의 목표는 "예쁜 걸 사는 것"이 아니라 **"나에게 맞는 신발을 찾는 것"** 이다.

### 차별점

|                    | 내용                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------- |
| 용어 툴팁          | 스펙 옆 `ⓘ` 클릭 시 용어 설명 표시 (`terms` 데이터 기반, 재사용 컴포넌트)                |
| 해부도 히어로      | 뒤꿈치 · 밑창 · 측면 클로즈업 슬라이드에 용어 캡션을 붙여 사이트 성격을 첫 화면에서 전달 |
| 정보 없음의 명시   | 브랜드가 공개하지 않은 스펙은 추측하지 않고 "정보 없음"으로 표기                         |
| 발볼 · 와이드 정보 | 한국 러너에게 중요하지만 해외 사이트가 다루지 않는 항목을 전면에 노출                    |
| 리뷰 요약 (Ollama) | 리뷰 3개 이상인 신발은 로컬 LLM이 좋았던 점 · 아쉬운 점을 나눠 정리                       |

### 비주얼 컨셉 — 표본 전시실

데미언 허스트의 포름알데히드 표본 연작에서 시각 언어를 차용했다.
러닝화를 **판매 상품이 아니라 관찰·계측의 대상인 표본**으로 다룬다.

- 카드는 흰 프레임으로 감싼 유리 상자 형태
- 모든 신발 이미지는 **동일 각도 · 동일 방향 · 동일 배율**로 통일
- 표본번호 형식의 캡션 (`NO.01 · 조깅·회복주`)
- 강조색은 딥 틸 `#1D7A72` 하나만 사용

---

## 2. 빠르게 실행하기

### Docker

```bash
docker build -t runshoes .
docker run -p 8080:3000 runshoes
# http://localhost:8080
```

### 로컬 개발 — 터미널 2개

```bash
git clone https://github.com/Gabriel-Joo/runshoes.git
cd runshoes
yarn

yarn dev       # Vite         http://localhost:5173
yarn server    # json-server  http://localhost:3000
```

> json-server는 **0.17.4 고정.**
> 1.x는 id를 nanoid 문자열로 생성해 `/edit/:id` 라우팅과 맞지 않는다.

> Express는 **4.x 고정.**
> Express 5는 `req.query`가 읽기 전용이라 json-server의 정렬 파라미터
> (`?_sort=&_order=`) 처리가 깨진다. SPA 폴백도 Express 4 문법인 `app.get("/*", ...)`을 쓴다.

### API 주소

`src/api.ts`가 API 주소를 한 곳에서 관리한다. 운영 배포(Kubernetes)에서는 `server.cjs`가 정적 파일과 `/api`를 같은 오리진에서 함께 서비스하므로 별도 설정이 필요 없다.

### 데이터 초기화

```bash
git checkout -- db.json
```

---

## 3. 요건 체크리스트

> 출처: 번외 산출물 안내 PART_02 (12~18p)

### ① 목록 화면 `/` — 단일 화면 구조 유지

- [x] 항목 리스트 렌더링 — `GET`
- [x] 카테고리 필터 (버튼 탭) — **용도별 6개** (전체 포함)
- [x] 정렬 (기본 · 평점순 · 리뷰순 · 좋아요순) — **`?_sort=&_order=` 서버 정렬**
- [x] 좋아요·찜 토글 → 서버 저장, 새로고침해도 유지 — `PATCH`
- [x] 찜한 항목만 보기 — **온/오프 토글, 별도 페이지 아님**
- [x] 항목 클릭 → 상세 모달

### ② 등록·관리 `/new`, `/edit/:id`

- [x] 새 항목 등록 — `POST`
- [x] 기존 항목 수정 (`useParams`로 id) — `PATCH`
- [x] 항목 삭제 — `DELETE` (연결된 리뷰도 함께 삭제)
- [x] 저장·삭제 후 목록으로 이동 — `useNavigate`

### ③ 러너들의 선택 `/best`

- [x] 평점 · 리뷰 · 좋아요 기준 정렬
- [x] 종합 점수 랭킹 1~5위
- [x] 용도별 1위

### ④ 공통 · 라우팅

- [x] 상단 메뉴(`Link`)로 화면 이동
- [x] `Routes` · `Route`로 분기
- [x] NotFound `path="*"`

### ⑤ 상세 모달 — 목록 화면에서 사용

- [x] 주제별 상세 정보 표시 — **스펙 + 용어 툴팁**
- [x] 리뷰 목록 (작성자 · 별점 · 내용) — `GET`
- [x] 평점·리뷰 작성 폼 → 등록 후 다시 불러오기 — `POST` + re-fetch
- [x] 리뷰 삭제 — `DELETE`
- [x] 모달 열기 / 닫기 — **배경 클릭 닫기 포함**
- [x] 등록·관리 화면의 삭제 확인 모달

### ⑥ 서버 연결 (json-server)

- [x] json-server 로컬 설치 후 `yarn`으로 실행
- [x] Vite와 터미널 **2개 동시** 실행
- [x] 데이터 = 항목(`shoes`) + 리뷰(`reviews`, `shoeId`로 항목별 구분)
- [x] 쓰기 후 다시 불러오기 (re-fetch)
- [x] TS `interface`로 모양 정의, `useState<T[]>`

### ⑦ 반응형

- [x] 웹 / 모바일 화면 크기에 따라 자연스럽게 전환
- [x] 데스크톱 3열 → 태블릿 2열 → 모바일 1열
- [x] 목록 → 상세 모달 흐름은 **모든 화면 크기에서 유지**
- [x] 모달 폭 · 스크롤 처리, 툴팁이 화면 밖으로 나가지 않도록 처리
- [x] 모바일 햄버거 메뉴

### 요건 외 추가 구현

- [x] **용어 툴팁 시스템** — `terms` 데이터 + `TermTooltip` 재사용 컴포넌트, 한 번에 하나만 열림
- [x] **히어로 슬라이드** — `setInterval` + cleanup으로 직접 구현 (라이브러리 미사용)
- [x] **리뷰 수정** — `PATCH`, 인라인 편집 모드
- [x] **삭제 확인 모달** — `ConfirmModal` 공통 컴포넌트 (러닝화 · 리뷰 양쪽에서 재사용)
- [x] **관리 페이지 `/admin`** — 브랜드 필터 · 모델명 검색 · 정렬
- [x] **종합 점수 랭킹** — 신뢰도 가중 평점에 좋아요를 반영한 단일 지표
- [x] **이미지 플레이스홀더** — 이미지가 없거나 로드 실패해도 레이아웃 유지
- [x] **모달 이미지 갤러리** — 다중 이미지 슬라이드 + 썸네일 드래그 스크롤
- [x] **리뷰 좋아요 + 베스트 리뷰 상단 고정**
- [x] **맞춤 추천 `/recommend`** — 5문항 점수제 (용도 · 발볼 · 안정성 · 쿠션 · 예산)
- [x] **Kubernetes GitOps 배포** — Jenkins(Kaniko) → Harbor → ArgoCD
- [x] **About 페이지 `/about`** — 서비스 설계 의도와 GitOps 구축 과정을 정리한 소개 페이지
- [x] **리뷰 요약 (Ollama)** — 로컬 LLM으로 리뷰의 긍정·부정 의견을 요약 (로컬/웹 터미널 전용, 아래 11장 참고)

---

## 4. 데이터 설계

### shoes

| 필드            | 타입           | 설명                                                                  |
| --------------- | -------------- | --------------------------------------------------------------------- |
| `id`            | number         |                                                                       |
| `brand`         | string         | 나이키 · 아식스 · 호카 등                                             |
| `model`         | string         | 모델명                                                                |
| `purpose`       | string         | **필터축** — 조깅·회복주 / 템포·인터벌 / LSD·장거리 / 레이스 / 트레일 |
| `stability`     | string         | 중립화 / 안정화                                                       |
| `midsole`       | string \| null | 미드솔 폼 이름 (리액트X, FF Blast Plus 등)                            |
| `weight`        | number \| null | 무게 (g)                                                              |
| `drop`          | number \| null | 드롭 (mm)                                                             |
| `stackHeight`   | number \| null | 미드솔 두께 (mm)                                                      |
| `width`         | string         | 발볼 — 좁음 / 보통 / 넓음                                             |
| `wideAvailable` | boolean        | 와이드 모델 출시 여부                                                 |
| `carbon`        | boolean        | 카본 플레이트 유무                                                    |
| `price`         | number \| null | 정가 (원)                                                             |
| `images`        | string[]       | 제품컷 경로 배열 — 모달 슬라이드 + 썸네일                             |
| `summary`       | string         | 카드용 한 줄 요약 (`○○한 분에게`)                                     |
| `description`   | string         | 모달용 상세 설명                                                      |
| `rating`        | number         | 평균 별점 — **정렬용으로 저장**                                       |
| `reviewCount`   | number         | 리뷰 수 — **정렬용으로 저장**                                         |
| `likeCount`     | number         | 좋아요 수 — **정렬용으로 저장**                                       |
| `liked`         | boolean        | 내 찜 여부                                                            |

**설계 판단**

- **`rating` · `reviewCount` · `likeCount`를 계산값이 아니라 저장값으로 둔 이유**
  요건이 `?_sort=&_order=` 서버 정렬을 명시하므로 json-server가 인식할 수 있는 실제 필드여야 한다.
  리뷰 `POST` / `PATCH` / `DELETE` 시 해당 신발을 다시 `PATCH`해 동기화한다.

- **수치 스펙을 nullable로 둔 이유**
  브랜드가 공개하지 않은 스펙이 실제로 존재한다(호카는 미드솔 폼 이름을 밝히지 않는다).
  `0`으로 저장하면 "무게 0g"이라는 잘못된 정보가 되므로 `null`로 두고 "정보 없음"으로 표시한다.

- **`liked`와 `likeCount`를 분리한 이유**
  `liked`는 내가 찜했는지(토글용), `likeCount`는 총 몇 명이 찜했는지(정렬용).
  로그인이 없는 구조에서 "좋아요순 정렬"을 성립시키기 위한 구분이다.

- **`image` → `images[]`로 바꾼 이유**
  모달에서 뒤꿈치·밑창·측면 등 여러 각도를 보여주기 위해 배열로 확장했다.
  카드 썸네일은 `images[0]`을 쓴다.

### reviews

| 필드        | 타입   | 설명                                                |
| ----------- | ------ | --------------------------------------------------- |
| `id`        | number |                                                     |
| `shoeId`    | number | 신발 id — json-server 관계 규칙(`<리소스단수형>Id`) |
| `author`    | string | 작성자 닉네임                                       |
| `rating`    | number | 별점 1~5                                            |
| `content`   | string | 내용                                                |
| `likeCount` | number | "도움이 돼요 👍" 수 — 베스트 리뷰 상단 고정에 사용  |
| `createdAt` | string | 작성일 — **전체 ISO 문자열로 저장**                 |

> `shoeId`로 이름을 맞추면 json-server의 `_embed` / `_expand`를 쓸 수 있다.
> `GET /shoes/1?_embed=reviews`로 신발과 리뷰를 한 번에 조회 가능.

> `createdAt`은 날짜만 잘라 저장하면 UTC 기준으로 하루가 밀린다.
> 전체 ISO 문자열로 저장하고 `src/utils/date.ts`의 `formatDate`에서 상대 시간으로 표시한다.

### terms — 용어 툴팁

| 필드          | 타입   | 설명                                          |
| ------------- | ------ | --------------------------------------------- |
| `id`          | number |                                               |
| `key`         | string | `"drop"` — 코드에서 참조할 키                 |
| `name`        | string | `"드롭"`                                      |
| `short`       | string | 툴팁용 한 줄                                  |
| `description` | string | 전문 — 툴팁 본문 및 추후 `/glossary` 페이지용 |

**등록된 용어 (13개)**
드롭 · 스택하이트 · 프로네이션 · 중립화 · 안정화 · 카본 플레이트 ·
발볼 · 미드솔 · 트레일 러닝 · 템포런 · LSD · 무게 · 아웃솔

> 각 용어의 설명은 웹사이트의 용어 툴팁(`TermTooltip`)으로도 제공된다.
> 아래는 전체 설명이다.

<details>
<summary><strong>용어 사전 (13개) — 펼쳐서 보기</strong></summary>

**드롭 (Drop)**
뒤꿈치와 앞꿈치의 높이 차이(mm). 클수록 뒤꿈치 착지가 편하고 무릎 부담이 줄지만,
낮으면 종아리와 아킬레스건을 더 쓰게 되어 적응 기간이 필요하다.
시중 제품은 대체로 6~12mm이며 초보는 8~10mm가 무난하다.

**스택하이트 (Stack Height)**
미드솔의 두께(mm). 발밑에 깔린 쿠션의 양을 뜻한다.
30mm 이하면 얇은 편, 40mm 이상이면 두꺼운 편이다.
두꺼울수록 푹신하고 장거리에 유리하지만, 무게가 늘고 지면 감각이 둔해진다.

**프로네이션 (Pronation)**
착지 시 발이 안쪽으로 살짝 기울어지는 자연스러운 움직임. 충격을 흡수하는 정상 동작이다.
이 움직임이 과도한 경우를 **과내전(오버프로네이션)** 이라 한다.
신던 운동화 밑창의 안쪽만 유독 닳았다면 과내전일 가능성이 있다.

**중립화 (Neutral)**
교정 장치 없이 쿠션을 균등하게 배치한 신발. 시중 러닝화 대부분이 여기 해당한다.
흔히 말하는 "쿠션화"와 같은 말이며, 쿠션이 더 많다는 뜻은 아니다.

**안정화 (Stability)**
미드솔 안쪽에 단단한 소재를 넣어 발이 안쪽으로 무너지는 것을 막아주는 신발.
과내전인 사람에게 필요하며, **해당되지 않는 사람이 신으면 오히려 불편하다.**
안정화가 더 좋은 신발이 아니라 발 유형에 맞춰 고르는 것이다.

**카본 플레이트 (Carbon Plate)**
미드솔에 삽입된 탄소섬유 판. 반발력을 크게 높여주지만 가격이 비싸고
근력과 러닝 기술이 충분하지 않은 상태에서 신으면
종아리·발목·아킬레스에 부담이 집중될 수 있다.

**발볼 (Width)**
신발 앞쪽의 좌우 폭. 한국인은 발볼이 넓은 편이라 서양 브랜드의 기본 사이즈가 조이는 경우가 있다.
같은 모델의 와이드(2E, 4E) 버전을 확인해 보는 것이 좋다.

**미드솔 (Midsole)**
겉창(아웃솔)과 안창 사이에 있는 쿠션층. 러닝화의 성격을 결정하는 핵심 부위다.
브랜드마다 폼 소재에 고유한 이름을 붙인다(줌X, FF Blast+, 리액트X 등).
호카처럼 폼 이름을 공개하지 않는 브랜드도 있다.

**트레일 러닝 (Trail Running)**
포장도로가 아닌 산길·흙길·자갈길을 달리는 러닝.
트레일화는 밑창 돌기가 깊고 어퍼가 튼튼하며 앞코에 토캡 보강이 들어가 무게가 무거운 편이다.

**템포런 (Tempo Run)**
평소 조깅보다 빠른 페이스를 일정하게 유지하며 달리는 훈련.
숨이 약간 찰 정도의 강도로, 지구력을 끌어올리는 데 쓰인다.

**LSD (Long Slow Distance)**
느린 페이스를 유지하며 긴 거리를 달리는 훈련.
심폐 지구력을 기르는 데 쓰이며 쿠션이 두꺼운 신발이 유리하다.

**무게 (Weight)**
신발 한 짝의 무게. 브랜드가 정한 대표 사이즈(보통 270~280mm) 기준으로 표기하므로
실제 신는 사이즈에 따라 달라진다. 사이즈가 10mm 커질 때마다 5~10g 정도 늘어난다.
220g 이하면 가벼운 편, 300g 이상이면 무거운 편이다.

**아웃솔 (Outsole)**
지면에 직접 닿는 겉창. 고무 소재로 접지력과 내구성을 담당하며,
마모가 잦은 부위에 고무를 더 두껍게 배치하기도 한다.
트레일화는 흙길에서 미끄러지지 않도록 돌기가 깊게 파여 있다.

</details>

---

## 5. 레포 구성

두 원격 저장소를 함께 쓴다.

| 원격   | 주소                                    | 용도                               |
| ------ | --------------------------------------- | ---------------------------------- |
| GitLab | `std-gitlab.kopoctc.kr/kopo17/runshoes` | CI/CD 트리거 (학교 인프라)         |
| GitHub | `github.com/Gabriel-Joo/runshoes`       | 포트폴리오 보관 (수료 후에도 유지) |

`gitlab` remote의 push URL에 두 주소를 모두 등록해,
`git push gitlab main` 한 번으로 양쪽에 동시 반영한다.
(학교 GitLab 서버 미러링은 외부 push가 막혀 있어, 로컬에서 직접 두 곳에 미는 방식을 쓴다.)

```bash
git remote set-url --add --push gitlab https://std-gitlab.kopoctc.kr/kopo17/runshoes.git
git remote set-url --add --push gitlab https://github.com/Gabriel-Joo/runshoes.git
git config alias.pp 'push gitlab main'
```

> GitLab이 원본, GitHub은 거울이다. GitHub에 직접 커밋하지 않는다.

---

## 6. 폴더 구조
runshoes/
├─ db.json ← 루트 (src/ 아님)
├─ Dockerfile
├─ server.cjs ← express(정적) + json-server(/api) + 리뷰 요약(Ollama) 통합
├─ docs/
│ ├─ INFRA.md ← K8s GitOps CI/CD
│ ├─ DEPLOY.md ← 웹 터미널 배포
│ ├─ design-prompt.md ← 디자인 요청 및 수정 이력
│ └─ design-handoff.md ← 디자인 확정 명세
├─ public/
│ └─ images/
│ ├─ (신발 이미지)
│ └─ screenshots/ ← About 화면 캡쳐
└─ src/
├─ api.ts ← API 주소 상수
├─ types/
│ └─ index.ts ← Shoe, Review, Term
├─ utils/
│ └─ date.ts ← formatDate (상대 시간 표시)
├─ components/
│ ├─ Header.tsx ← 상단 메뉴 · 햄버거
│ ├─ Hero.tsx ← 해부도 슬라이드
│ ├─ FilterBar.tsx ← 용도별 필터
│ ├─ SortBar.tsx ← 정렬 · 찜 토글
│ ├─ ShoeCard.tsx ← 카드 (랭킹 모드 겸용)
│ ├─ ShoeImage.tsx ← 이미지 + 플레이스홀더
│ ├─ ShoeGallery.tsx ← 모달 이미지 슬라이드 + 썸네일
│ ├─ ShoeModal.tsx ← 상세 모달
│ ├─ ReviewSection.tsx ← 리뷰 CRUD
│ ├─ ReviewItem.tsx ← 리뷰 1건 (좋아요 · 인라인 편집)
│ ├─ ReviewSummary.tsx ← 리뷰 요약 카드 (Ollama)
│ ├─ TermTooltip.tsx ← 용어 툴팁
│ ├─ ConfirmModal.tsx ← 삭제 확인
│ ├─ ScrollTop.tsx ← 라우트 이동 시 스크롤 초기화
│ └─ PipelineDiagram.tsx ← About용 CI/CD 파이프라인 SVG 도식
├─ pages/
│ ├─ ShoeList.tsx ← /
│ ├─ Recommend.tsx ← /recommend
│ ├─ Best.tsx ← /best
│ ├─ About.tsx ← /about
│ ├─ Admin.tsx ← /admin
│ ├─ ShoeForm.tsx ← /new, /edit/:id
│ └─ NotFound.tsx ← *
├─ App.tsx
└─ main.tsx
CSS는 컴포넌트별 파일로 분리하고, 전역 토큰(색상 · 폰트)만 `index.css`에 둔다.

---

## 7. 화면 구성

| 라우트        | 화면          | 내용                                                         |
| ------------ | ------------- | ------------------------------------------------------------ |
| `/`          | 홈            | 히어로 슬라이드 + 용도 필터 + 정렬 + 카드 그리드 + 상세 모달     |
| `/recommend` | 맞춤 추천     | 5문항 점수제 설문 → 추천 결과                                   |
| `/best`      | 러너들의 선택 | 종합 점수 1~5위 + 용도별 1위                                    |
| `/about`     | About        | 프로젝트 소개 - 서비스 설계 ·  GitOps 구축 과정                  |
| `/admin`     | 등록·관리     | 브랜드 필터 · 검색 · 정렬, 행별 수정·삭제                       |
| `/new`       | 등록          | 러닝화 등록 폼                                                |
| `/edit/:id`  | 수정          | 러닝화 수정 폼 + 삭제                                          |
| `*`          | NotFound      |                                                              |

### 종합 점수
score = rating × 20 × (reviewCount / (reviewCount + 3)) + likeCount × 0.5

평점만으로 순위를 매기면 "리뷰 1개에 5점"이 1위가 된다.
그래서 리뷰 수를 더하는 대신, 리뷰가 적을수록 평점 반영률을 낮추는
**신뢰도 가중치** `reviewCount / (reviewCount + 3)`를 평점에 곱한다.
리뷰 1개면 평점의 25%, 3개면 50%, 10개면 약 77%만 반영한다.
좋아요는 보조 지표로 소폭 가산한다. 산식은 화면에도 함께 표기한다.

### 맞춤 추천 배점

| 항목     | 배점    |
| -------- | ------- |
| 용도     | 40      |
| 발볼     | 30 / 20 |
| 안정성   | 30      |
| 쿠션     | 20      |
| 예산     | 20      |
| **합계** | **140** |

동점일 경우 리뷰 수를 가중한 신뢰도 보정 평점으로 순위를 가른다.

---

## 8. 배포

로컬 개발 → 웹 터미널(aisw-lab) → **Kubernetes GitOps**로 단계적으로 발전시켰다.
개발자 ──git push──▶ GitLab ──webhook──▶ Jenkins
│ Kaniko 빌드
▼
Harbor (std-harbor.kopoctc.kr/kopo17)
│
gitops 레포 ◀───┘ 이미지 태그 커밋
│
ArgoCD ──sync──▶ Kubernetes (vcluster vc-kopo17)
- 클러스터: 학교 RKE2 클러스터 위의 **vcluster(`vc-kopo17`)**
- Ingress: Traefik. 전역 HTTP→HTTPS 리다이렉트가 걸려 있어
  `web,websecure` 엔트리포인트와 `tls` 블록을 모두 선언해야 한다.
- 데이터: `db.json`을 PVC에 두고 initContainer로 시드. 파드 재시작에도 유지된다.

자세한 내용은 [docs/INFRA.md](docs/INFRA.md).

---

## 9. 진행 상황

### 완료

| 항목          | 내용                                                                 |
| ------------- | -------------------------------------------------------------------- |
| 기본 요건     | 목록 · 필터 · 정렬 · 찜 · 상세 모달 · 리뷰 CRUD · 등록/관리 · 반응형 |
| 데이터 확충   | 러닝화 20종 · 리뷰 101개                                             |
| 이미지 다중화 | `image` → `images[]`, 모달 슬라이드 + 썸네일                         |
| 리뷰 좋아요   | 리뷰별 좋아요 + 베스트 리뷰 상단 고정                                |
| 맞춤 추천     | `/recommend` 5문항 점수제                                            |
| 배포          | 웹 터미널 → Kubernetes GitOps CI/CD                                  |
| About 페이지  | 기획 의도 · 추천/랭킹 산식 · 화면 · 파이프라인 도식 · 트러블슈팅       |
| 리뷰 요약     | Ollama(gemma4 8B)로 긍정·아쉬운 점 요약 (로컬 · 웹 터미널 전용)        |

### 예정

| 항목                    | 내용                                           |
| ----------------------- | ---------------------------------------------- |
| 컬러웨이 선택           | 같은 모델의 다른 색상 전환                     |
| `/glossary`             | 용어사전 페이지 (`terms`의 `description` 활용) |
| 러닝 코스 · 대회 도메인 | 신발 엔진(항목+리뷰+평점+찜) 재사용            |
| 리뷰 요약 배치화        | 서버 메모리 캐시 → `db.json` 저장로 전환, 로컬/웹터미널에서 주기적으로 갱신해 커밋하면 K8s 배포에서도 정적으로 노출 가능 |

### 확장 로드맵
[ 러닝 통합 플랫폼 ]
           │
┌──────────┼──────────┐
신발 코스 대회
(현재) (예정) (예정)
│
리뷰·평점·찜 ← 엔진 공유

세 도메인 모두 "항목 + 리뷰 + 평점 + 찜" 구조가 동일하다.
현재 신발 도메인에서 이 엔진을 완성해 두었으므로,
코스·대회는 데이터와 표시 필드만 추가하면 된다.

---

## 10. 데이터 출처

- 스펙: 각 브랜드 공식 발표 자료, 다나와 상품 스펙, 마라톤GO
- 이미지: KREAM (동일 규격 · 투명 배경 제품컷)
- 리뷰: 시드 데이터 (실제 사용자 리뷰가 아님)

수치가 자료마다 다른 경우 **브랜드 공식 발표를 우선**하고,
성별·발볼별로 스펙이 다른 모델은 **남성 레귤러 기준**으로 통일했다.

---

## 11. 리뷰 요약 (Ollama)

리뷰가 3개 이상인 신발은 로컬에서 구동한 언어 모델(Ollama, gemma4 8B)이
리뷰를 읽고 좋았던 점과 아쉬운 점을 나눠 요약한다.

### 동작 방식

- `server.cjs`가 `/api/shoes/:id/summary`에서 해당 신발의 리뷰를 모아 프롬프트로 구성
- 공감(좋아요) 수가 많은 리뷰일수록 더 비중 있게 반영하도록 프롬프트에 명시
- 의견이 서로 반대되는 경우, 한쪽만 고르지 않고 "의견이 갈립니다"처럼 양쪽을 함께 언급하도록 지시
- 요약은 서버 메모리에 캐싱하고, 해당 신발의 리뷰 개수(`reviewCount`)가 바뀔 때만 재생성한다.
  같은 개수로는 재호출하지 않으므로, 방문자가 반복해서 확인해도 추가 연산이 발생하지 않는다.
- Ollama 호출은 `fetch`가 아니라 `curl` 프로세스 실행(`execFile`)으로 처리한다.
  일부 네트워크 환경에서 Node의 내장 fetch(undici)가 사설 네트워크 연결에
  실패하는 사례가 있어, 항상 안정적으로 동작한 `curl`로 우회했다.

### 왜 Live Demo(쿠버네티스)에는 없는가

이 기능은 **로컬 개발 환경과 웹 터미널(aisw-lab) 배포에서만 동작**하며,
쿠버네티스 배포에는 포함하지 않았다.

Ollama는 별도 PC에서 구동 중이고, 로컬 개발 환경과 웹 터미널은 학교의
같은 물리 네트워크에 있어 사설 IP로 직접 통신이 가능하다. 반면 쿠버네티스
Pod는 vcluster의 오버레이 네트워크 안에 있어, 같은 사설 IP 대역으로도
경로 자체가 존재하지 않는다(Pod 안에서 직접 확인함 — `curl` 요청이
항상 타임아웃으로 실패). 이는 방화벽 설정으로 해결되는 문제가 아니라
vcluster 네트워크 구조 자체의 제약이라 판단해, 이번 배포 범위에서는
제외했다.

Ollama를 클러스터 안에 컨테이너로 직접 띄우는 방법도 있으나, 현재
vcluster의 리소스 상한(컨테이너당 2Gi)에서는 8B 모델 구동이 어려워
추후 과제로 남겨두었다.

### 향후 개선 방향

현재는 요청 시점에 리뷰 개수를 비교해 재계산하고, 서버 메모리에만 캐싱한다.
그래서 서버가 재시작되면 캐시가 사라진다. 이를 `db.json`에 저장하는 방식으로
바꾸면, 로컬/웹 터미널에서 주기적으로(예: 2시간마다) 재계산해 커밋하는 것만으로
쿠버네티스 배포에서도 Ollama 호출 없이 저장된 요약을 그대로 노출할 수 있다
(쿠팡 등 대형 커머스의 리뷰 요약도 실시간이 아니라 누적 리뷰를 주기적으로
반영하는 방식으로 알려져 있어, 방향성 자체는 비슷하다).

## 12. 다음 단계 — 데이터 계층 이관과 무중단 배포 (설계)

> 아직 구현 전 단계로, "왜 이 방향으로 가는가"를 정리한 설계 문서다.
> 현재 배포는 동작하지만, 인프라 관점에서 명확한 한계가 있고
> 그 한계를 어떻게 풀지가 이 프로젝트의 다음 목표다.

### 12.1 왜 db.json을 버리는가

현재 데이터는 `db.json` 파일 하나이고, json-server가 이 파일을
통째로 읽고 쓰며 REST API를 대신 제공한다. 이 구조에는 두 가지
근본적인 한계가 있다.

**첫째, 무중단 배포를 할 수 없다.** 지금 Deployment의 배포 전략은
`Recreate`(기존 Pod를 모두 종료한 뒤 새 Pod를 생성)로 설정돼 있다.
얼핏 불필요해 보이지만 의도된 선택이다. db.json은 파일 하나를
여러 프로세스가 동시에 쓰면 내용이 깨질 수 있어서(single writer 문제),
구·신 Pod가 잠시라도 함께 떠 있으면 위험하다. 무중단 배포
(`RollingUpdate`)는 정의상 구·신 Pod가 공존하는 방식이므로,
현재 데이터 계층으로는 애초에 불가능하다. 즉 배포할 때마다
서비스가 잠깐 끊긴다.

**둘째, 확장과 로그인을 감당할 수 없다.** Pod를 여러 개로 늘리거나
(수평 확장), 사용자 계정·인증 같은 관계형 데이터를 다루려면
파일 기반 저장소로는 한계가 뚜렷하다.

결론적으로 이 프로젝트에서 목표하는 "무중단 배포 · 수평 확장 · 로그인"은
전부 데이터 계층 교체를 전제로 한다. 데이터 계층이 모든 것의 열쇠다.

### 12.2 MySQL 선택과 이관 범위

저장소는 **MySQL**로 옮긴다. SQLite가 아니라 MySQL인 이유는,
SQLite는 결국 파일 기반이라 앞서 말한 single writer 문제가 그대로
남기 때문이다. 네트워크로 접속하는 DB여야 애플리케이션을
**무상태(stateless)**로 만들 수 있고, 그래야 앱 Pod를 자유롭게
여러 개 띄우고 무중단으로 교체할 수 있다. 상태(데이터)는
DB 한 곳으로 격리하고, 앱은 상태를 갖지 않는 것이 핵심이다.

이관의 실제 무게 중심은 저장소 교체가 아니라 **백엔드 API를
직접 구현하는 것**이다. 지금까지는 json-server가 사실상 백엔드
역할을 대신하며 `/reviews?shoeId=3` 같은 요청을 자동으로
처리해 줬다. MySQL로 가면 json-server가 사라지므로, 그 API를
`server.cjs`(Express)에 직접 작성해야 한다. 프론트엔드의
`fetch` 호출 코드는 거의 그대로지만, 그 요청을 받아 SQL로
처리하는 계층이 새로 생긴다.

이관 단계:

1. **백엔드 API 계층 신설** — Express 라우트를 직접 작성하고
   `mysql2`로 MySQL에 쿼리. 가장 큰 작업.
2. **스키마 설계** — 현재 `shoes` · `reviews` · `terms`를 테이블로
   변환. 향후 `users` 테이블 자리까지 미리 반영.
3. **데이터 이관 스크립트** — 기존 db.json을 읽어 INSERT하는
   일회성 스크립트.
4. **Kubernetes 개편** — MySQL을 StatefulSet + PVC로 올리고,
   앱 Deployment는 무상태화. 이 시점부터 무중단·확장이 열린다.

### 12.3 스키마 방향 — 로그인을 미리 고려

현재 리뷰 좋아요는 `likeCount`(숫자) + `liked`(전역 눌림 상태)로,
로그인이 없어서 생긴 임시 구조다. MySQL 이관 시에는 좋아요를
**별도 테이블(`review_likes`, 예: `review_id` + `user_id`)로 분리**한다.
이렇게 하면 로그인 기능이 붙었을 때 "내가 누른 리뷰만" 정확히
판별할 수 있다. `users` 테이블이 없는 현재는 이 테이블을 비워두되,
스키마는 미래를 보고 설계해 두 번 이관하는 일을 피한다.

### 12.4 접속 정보 관리와 커넥션 풀

DB 계정·비밀번호는 코드에 넣지 않고 다음 흐름으로 주입한다.

Kubernetes Secret → Pod 환경변수 → process.env → mysql2 접속

로컬 개발에서는 `.env`(gitignore 대상), 클러스터에서는 Secret을
사용한다. 이 "설정 외부화"는 이미 BASE_PATH · DB_PATH를 환경변수로
분리해 둔 방식의 연장선이다.

또한 `mysql2`는 `createConnection`이 아니라 **`createPool`(커넥션 풀)**
을 쓴다. 요청마다 새로 연결하는 대신 풀에서 빌려 쓰는 방식으로,
앱 Pod를 여러 개 띄웠을 때 각 Pod가 자신의 풀로 DB에 접속한다.
풀이 없으면 부하가 조금만 몰려도 연결이 고갈되므로, 확장을
전제하는 이상 필수 조건이다.

### 12.5 무중단 배포 — Probe가 핵심

앱이 무상태가 되면 배포 전략을 `Recreate`에서 **`RollingUpdate`**로
바꿀 수 있다. 이때 두 파라미터로 "끊김 없는 교체"를 만든다.

- `maxUnavailable: 0` — 기존 Pod를 종료하기 전에 반드시 새 Pod를
  먼저 준비시킨다. 즉 가용 Pod 수가 목표치 아래로 내려가지 않는다.
- `maxSurge: 1` — 한 번에 하나씩만 초과 생성해 순차적으로 교체한다.

그런데 무중단의 진짜 심장은 배포 전략이 아니라 **Probe(상태 점검)**다.
쿠버네티스가 "이 Pod가 준비됐다"를 스스로 판단하는 근거이기 때문이다.

- **Liveness Probe(생존 점검)** — 컨테이너가 살아 있는지 확인한다.
  실패하면 kubelet이 해당 컨테이너를 재시작한다. 앱이 데드락 등으로
  멈췄을 때 자동 복구하는 장치다.
- **Readiness Probe(준비 점검)** — Pod가 트래픽을 받을 준비가 됐는지
  확인한다. 실패하면 Service의 대상 목록에서 제외돼 요청이 가지
  않는다(재시작은 하지 않음). 이것이 없으면 쿠버네티스는 컨테이너가
  뜨자마자(앱이 아직 DB 연결 중이어도) 준비 완료로 착각하고 트래픽을
  흘려 순간 에러가 발생한다.
- **Startup Probe(시작 점검)** — 부팅이 느린 앱을 위해, 앱이 완전히
  뜰 때까지 위 두 Probe를 잠시 유보한다. 시작이 오래 걸린다는 이유로
  liveness가 조기에 컨테이너를 죽이는 일을 막는다.

이를 위해 앱에 `/healthz` 같은 상태 점검 엔드포인트를 추가한다.
여기서 단순히 "프로세스 살아 있음"에 그치지 않고, **MySQL에
`SELECT 1`을 실제로 날려 성공해야 준비 완료로 응답**하도록 설계한다.
DB에 붙지 못한 Pod에는 트래픽이 가지 않게 하기 위함이다.

### 12.6 롤백 — 두 층위

- **롤아웃 자동 중단** — 새 Pod의 readiness가 계속 실패하면
  RollingUpdate가 스스로 멈추고, 기존 Pod들이 서비스를 계속
  이어간다. 잘못된 버전이 나가도 트래픽이 넘어가지 않는 방어선이다.
- **명시적 되돌리기(GitOps 방식)** — 이미 배포된 버전을 되돌릴 때는
  `kubectl rollout undo`가 아니라, **gitops 레포에서 이미지 태그를
  이전 값으로 되돌리는 커밋(revert)**을 한다. ArgoCD가 그 변경을
  감지해 자동으로 이전 상태로 복구한다. GitOps에서는 롤백조차
  하나의 git 커밋이며, 배포 이력이 곧 git 이력으로 남는다.

### 12.7 점진 배포 — Argo Rollouts (심화 목표)

기본 RollingUpdate 위에 **Argo Rollouts**를 얹으면 더 정교한
배포가 가능하다. 이미 ArgoCD를 사용 중이므로 자연스러운 확장이다.

- **Canary(카나리)** — 새 버전에 트래픽을 10% → 50% → 100%로
  점진적으로 넘기며, 중간에 지표가 나빠지면 자동으로 이전 버전으로
  되돌린다. "점진적으로 흘려보내되 문제가 감지되면 자동 후퇴"하는
  방식이다.
- **Blue-Green(블루-그린)** — 새 버전(green)을 통째로 띄워 둔 뒤,
  스위치 한 번으로 트래픽을 전환한다. 문제가 생기면 스위치만 되돌린다.

RollingUpdate가 "무조건 새 버전으로 순차 교체"라면, Canary는
"지표를 보며 점진 이동, 나쁘면 자동 롤백"이라는 점에서 한 단계
위의 안전성을 제공한다.

### 12.8 제약과 현실적 고려

vcluster 리소스 상한(현재 requests 기준 1500m CPU / 4Gi 메모리,
컨테이너당 최대 2Gi)이 빡빡하다. MySQL Pod가 상시 메모리를
점유하므로, CI 에이전트 Pod가 뜨는 시점과 겹치면 스케줄링이
지연될 수 있다. 상시 가동분을 어떻게 확보할지(예: 유휴 네임스페이스
정리)를 이관과 함께 계산해야 한다.

또한 실무에서는 DB를 클러스터 안에 두지 않고 관리형 서비스(RDS 등)를
쓰는 것이 일반적이다. 다만 학습·포트폴리오 목적에서는 StatefulSet로
직접 운영해 보는 편이 "StatefulSet과 Deployment가 왜 다른가"를
체득하는 데 유리하다고 판단해, 클러스터 내 StatefulSet 방식으로 간다.