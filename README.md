# RUNSHOES

> **러닝화, 제대로 읽기**
> 스펙은 빠짐없이, 용어는 설명과 함께

React · TypeScript 프런트와 Spring Boot · MySQL 백엔드로 만든 러닝화 리뷰 아카이브를
자체 Kubernetes 클러스터에 GitOps CI/CD로 배포한 프로젝트

**🔗 Live Demo — https://runshoes.ronanlab.dev** (자체 kubeadm 클러스터 · Cloudflare Tunnel)

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-000?logo=vite&logoColor=white)
![React Router](https://img.shields.io/badge/React_Router-7-CA4245?logo=reactrouter&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.5-6DB33F?logo=springboot&logoColor=white)
![Java](https://img.shields.io/badge/Java-21-007396?logo=openjdk&logoColor=white)
![MySQL](https://img.shields.io/badge/MySQL-8-4479A1?logo=mysql&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=white)
![Kubernetes](https://img.shields.io/badge/Kubernetes-326CE5?logo=kubernetes&logoColor=white)
![Jenkins](https://img.shields.io/badge/Jenkins-D24939?logo=jenkins&logoColor=white)
![Argo CD](https://img.shields.io/badge/Argo%20CD-EF7B4D?logo=argo&logoColor=white)
![Harbor](https://img.shields.io/badge/Harbor-60B932?logo=harbor&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-000?logo=ollama&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Tunnel-F38020?logo=cloudflare&logoColor=white)

> **문서 안내**
>
> - 이 문서: 애플리케이션 (기획 · 요건 · 데이터 설계 · 화면 · 설계)
> - [docs/INFRA.md](docs/INFRA.md): 쿠버네티스 · GitOps CI/CD
> - [docs/API_CONTRACT.md](docs/API_CONTRACT.md): API 계약과 설계 근거 (id 매기기 · 타입 · 헤더가 왜 이런 모양인지)
> - [docs/HISTORY.md](docs/HISTORY.md): 구축 · 전환 기록 (자체 클러스터 이주, 터널 무중단 전환, 계약 녹화로 검증한 백엔드 전환, 트러블슈팅)
> - [backend/README.md](backend/README.md) · [contract/README.md](contract/README.md): 백엔드 개발 · 계약 검증

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
| 리뷰 요약 (Ollama) | 리뷰 3개 이상인 신발은 LLM이 좋았던 점 · 아쉬운 점을 나눠 정리 (Ollama, GPU 서버)        |

### 비주얼 컨셉 — 표본 전시실

데미언 허스트의 포름알데히드 표본 연작에서 시각 언어를 차용했다.
러닝화를 **판매 상품이 아니라 관찰·계측의 대상인 표본**으로 다룬다.

- 카드는 흰 프레임으로 감싼 유리 상자 형태
- 모든 신발 이미지는 **동일 각도 · 동일 방향 · 동일 배율**로 통일
- 표본번호 형식의 캡션 (`NO.01 · 조깅·회복주`)
- 강조색은 딥 틸 `#1D7A72` 하나만 사용

---

## 2. 빠르게 실행하기

### 로컬 개발

```bash
git clone https://github.com/Gabriel-Joo/runshoes.git
cd runshoes
yarn

docker compose up -d            # MySQL 8   127.0.0.1:3307
# 백엔드 — backend/README.md (Maven, Java 21). 첫 기동에 Flyway 가 스키마·시드를 넣는다
#   API  http://localhost:3000
yarn dev                        # Vite      http://localhost:5173
python chatbot_server.py        # (선택) 챗봇 ws://localhost:8766
```

### API 주소

`src/api.ts`가 API 주소를 한 곳에서 관리한다. 개발 중에는 `http://localhost:3000`(Spring Boot), 운영에서는 Spring Boot가 React 빌드물과 `/api`를 같은 오리진에서 함께 서비스하므로 별도 설정이 필요 없다.

### 이미지

```bash
docker build -t runshoes .      # Vite → Maven → jlink JRE → alpine (252MB)
docker run -p 8080:3000 -e SPRING_DATASOURCE_URL='jdbc:mysql://<host>:3306/runshoes?useSSL=false&allowPublicKeyRetrieval=true&connectionTimeZone=UTC' \
  -e SPRING_DATASOURCE_PASSWORD=... runshoes
```

### 데이터 초기화

```bash
docker compose down -v && docker compose up -d   # 빈 DB — 백엔드를 다시 띄우면 Flyway 가 시드(V2)를 다시 넣는다
```

---

## 3. 요건 체크리스트

> 출처: 번외 산출물 안내 PART_02 (12~18p)

### ① 목록 화면 `/` — 단일 화면 구조 유지

- [x] 항목 리스트 렌더링 — `GET`
- [x] 카테고리 필터 (버튼 탭) — **용도별 6개** (전체 포함)
- [x] 브랜드·모델 검색 — 서버가 거른다(`?search=`, 낱말 AND · 대소문자 · 공백 무시). 용도 · 찜 · 정렬과 같이 돈다
- [x] 정렬 (기본 · 평점순 · 리뷰순 · 좋아요순) — **`?_sort=&_order=` 서버 정렬**
- [x] 찜 토글 → 계정별로 서버 저장 — `PUT/DELETE /api/shoes/{id}/like`(로그인, 비로그인은 로그인 화면으로)
- [x] 찜한 항목만 보기 — **온/오프 토글, 별도 페이지 아님**(로그인했을 때만)
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

### ⑥ 서버 연결

- [x] REST API 서버와 연결 — 과제 요건은 json-server. 같은 API 계약을 **Spring Boot + MySQL**로 구현했다([API_CONTRACT](docs/API_CONTRACT.md))
- [x] Vite 개발 서버와 API 서버 **동시** 실행
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
- [x] **리뷰 수정** — `PATCH`, 인라인 편집 모드. 내 리뷰만(서버가 403), 작성자 이름은 계정 닉네임
- [x] **삭제 확인 모달** — `ConfirmModal` 공통 컴포넌트 (러닝화 · 리뷰 양쪽에서 재사용)
- [x] **관리 페이지 `/admin`** — 브랜드 필터 · 브랜드·모델 검색(홈과 같은 서버 검색) · 정렬
- [x] **종합 점수 랭킹** — 신뢰도 가중 평점에 좋아요를 반영한 단일 지표
- [x] **이미지 플레이스홀더** — 이미지가 없거나 로드 실패해도 레이아웃 유지
- [x] **모달 이미지 갤러리** — 다중 이미지 슬라이드 + 썸네일 드래그 스크롤
- [x] **리뷰 좋아요 + 베스트 리뷰 상단 고정**
- [x] **맞춤 추천 `/recommend`** — 5문항 점수제 (용도 · 발볼 · 안정성 · 쿠션 · 예산)
- [x] **Spring Boot + MySQL 백엔드** — Flyway 스키마 · 시드, 녹화한 응답으로 API 계약 검증(`contract/`)
- [x] **Kubernetes GitOps 배포** — Jenkins(BuildKit) → Harbor → ArgoCD, 자체 kubeadm 클러스터 · 무중단 롤링 배포
- [x] **리뷰 요약 (Ollama)** — LLM으로 리뷰의 긍정·부정 의견을 요약. 프로덕션 K8s에서도 동작 (아래 11장 참고)
- [x] **웹소켓 챗봇** — 파이썬 사이드카 컨테이너, Ollama 연동 (`/ws/chat`)

---

## 4. 데이터 설계

> 아래는 API가 주고받는 JSON 필드다. 저장은 MySQL 테이블(`backend/src/main/resources/db/migration/V1__schema.sql`, 컬럼은 snake_case).
> 숫자 스펙이 `DOUBLE`, id가 `max+1`, terms id가 겹치는 등 스키마의 특이한 선택은 [API_CONTRACT](docs/API_CONTRACT.md) 1장.

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
  요건이 `?_sort=&_order=` 서버 정렬을 명시하므로 정렬 기준이 저장된 실제 필드여야 한다.
  리뷰 `POST` / `PATCH` / `DELETE` 시 해당 신발을 다시 `PATCH`해 동기화한다.

- **수치 스펙을 nullable로 둔 이유**
  브랜드가 공개하지 않은 스펙이 실제로 존재한다(호카는 미드솔 폼 이름을 밝히지 않는다).
  `0`으로 저장하면 "무게 0g"이라는 잘못된 정보가 되므로 `null`로 두고 "정보 없음"으로 표시한다.

- **`liked`와 `likeCount`를 분리한 이유**
  `liked`는 요청한 사람이 찜했는지(계정별 — `likes` 테이블, 비로그인은 false), `likeCount`는 총 몇 명이 찜했는지(정렬용, 서버가 센다).
  리뷰의 "도움이 돼요"도 같다(`review_likes`). 설계: [docs/AUTH_DESIGN.md](docs/AUTH_DESIGN.md)

- **`image` → `images[]`로 바꾼 이유**
  모달에서 뒤꿈치·밑창·측면 등 여러 각도를 보여주기 위해 배열로 확장했다.
  카드 썸네일은 `images[0]`을 쓴다.

### reviews

| 필드        | 타입   | 설명                                                |
| ----------- | ------ | --------------------------------------------------- |
| `id`        | number |                                                     |
| `shoeId`    | number | 신발 id (`<리소스단수형>Id` 관례, FK)               |
| `author`    | string | 작성자 닉네임                                       |
| `rating`    | number | 별점 1~5                                            |
| `content`   | string | 내용                                                |
| `likeCount` | number | "도움이 돼요 👍" 수 — 베스트 리뷰 상단 고정에 사용  |
| `createdAt` | string | 작성일 — **전체 ISO 문자열로 저장**                 |

> 신발별 리뷰는 `GET /api/reviews?shoeId=1`로 조회한다. 신발을 지우면 리뷰도 함께 지워진다(FK `ON DELETE CASCADE`).

> `createdAt`은 날짜만 잘라 저장하면 UTC 기준으로 하루가 밀린다.
> UTC `DATETIME(3)`으로 저장하고 ms까지 ISO(`…Z`)로 돌려준다. `src/utils/date.ts`의 `formatDate`에서 상대 시간으로 표시한다.

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

| 저장소 | 주소 | 담는 것 |
| ------ | ---- | ------- |
| 앱 레포 | `github.com/Gabriel-Joo/runshoes` (public) | 프런트 · 백엔드 · Dockerfile 2개 · Jenkinsfile · API 계약(`contract/`). main에 push하면 Jenkins가 빌드한다 |
| 인프라 레포 | `github.com/Gabriel-Joo/ronanlab-infra` (private) `apps/runshoes/` | 쿠버네티스 매니페스트 · 이미지 태그. 태그는 Jenkins가 커밋한다 |

```bash
git push origin main     # → Jenkins 빌드 → Harbor → 인프라 레포 태그 커밋 → ArgoCD Sync
```

---

## 6. 폴더 구조

```
runshoes/
├─ src/                    ← React 프런트
│  ├─ api.ts               ← API 주소 상수
│  ├─ types/index.ts       ← Shoe, Review, Term
│  ├─ utils/date.ts        ← formatDate (상대 시간 표시)
│  ├─ components/
│  │  ├─ Header.tsx        ← 상단 메뉴 · 햄버거
│  │  ├─ Hero.tsx          ← 해부도 슬라이드
│  │  ├─ FilterBar.tsx     ← 용도별 필터(+ 검색창 자리)
│  │  ├─ SearchBox.tsx     ← 브랜드·모델 검색창(홈 · 관리 공용, 서버 search)
│  │  ├─ SortBar.tsx       ← 정렬 · 찜 토글
│  │  ├─ ShoeCard.tsx      ← 카드 (랭킹 모드 겸용)
│  │  ├─ ShoeImage.tsx     ← 이미지 + 플레이스홀더
│  │  ├─ ShoeGallery.tsx   ← 모달 이미지 슬라이드 + 썸네일
│  │  ├─ ShoeModal.tsx     ← 상세 모달
│  │  ├─ ReviewSection.tsx ← 리뷰 CRUD
│  │  ├─ ReviewItem.tsx    ← 리뷰 1건 (좋아요 · 인라인 편집)
│  │  ├─ ReviewSummary.tsx ← 리뷰 요약 카드 (Ollama)
│  │  ├─ TermTooltip.tsx   ← 용어 툴팁
│  │  ├─ ConfirmModal.tsx  ← 삭제 확인
│  │  ├─ ChatBot.tsx       ← 웹소켓 챗봇
│  │  └─ ScrollTop.tsx     ← 라우트 이동 시 스크롤 초기화
│  ├─ pages/               ← ShoeList(/) · Recommend · Best · Admin · ShoeForm(/new, /edit/:id) · NotFound
│  ├─ App.tsx
│  └─ main.tsx
├─ public/images/          ← 신발 이미지
├─ backend/                ← Spring Boot API (backend/README.md)
│  └─ src/main/
│     ├─ java/…/runshoes/  ← api/ · domain/ · summary/ · config/
│     └─ resources/db/migration/  ← Flyway V1(스키마) · V2(시드)
├─ chatbot_server.py       ← 웹소켓 챗봇 (Ollama, OLLAMA_URL)
├─ Dockerfile              ← 앱 이미지 (Vite → Maven → jlink JRE → alpine)
├─ Dockerfile.chatbot      ← 챗봇 사이드카 이미지 (python:3.12-alpine, 8766)
├─ Jenkinsfile             ← BuildKit × 2 + ronanlab-infra 태그 커밋
├─ docker-compose.yml      ← 로컬 MySQL
├─ contract/               ← API 계약 녹화본 · 녹화 · 비교 도구 (contract/README.md)
├─ scripts/                ← gen-seed-sql.mjs(db.json → Flyway V2) · verify-seed · 시드 보강 스크립트
├─ db.json                 ← 시드 원본(V2 의 소스)
├─ server.cjs              ← API 계약 기준선 (contract/) — 운영 이미지에는 없다
└─ docs/                   ← INFRA · API_CONTRACT · HISTORY · design-* · DEPLOY · SPRING_MIGRATION_PLAN(기록)
```

CSS는 컴포넌트별 파일로 분리하고, 전역 토큰(색상 · 폰트)만 `index.css`에 둔다.

---

## 7. 화면 구성

| 라우트       | 화면          | 내용                                                         |
| ------------ | ------------- | ------------------------------------------------------------ |
| `/`          | 홈            | 히어로 슬라이드 + 용도 필터 · 검색 + 정렬 + 카드 그리드 + 상세 모달 |
| `/recommend` | 맞춤 추천     | 5문항 점수제 설문 → 추천 결과                                |
| `/best`      | 러너들의 선택 | 종합 점수 1~5위 + 용도별 1위                                 |
| `/admin`     | 등록·관리     | 브랜드 필터 · 검색 · 정렬, 행별 수정·삭제                    |
| `/new`       | 등록          | 러닝화 등록 폼                                               |
| `/edit/:id`  | 수정          | 러닝화 수정 폼 + 삭제                                        |
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

```
개발자 ──git push──▶ GitHub ──(2분 폴링)──▶ Jenkins
                                            │ BuildKit × 2 (runshoes / runshoes-chatbot)
                                            ▼
                               Harbor (harbor.ronanlab.dev/runshoes)
                                            │
             ronanlab-infra apps/runshoes ◀─┘ 이미지 태그 커밋
                                            │
                    ArgoCD ────sync────▶ Kubernetes (runshoes 네임스페이스)
                                            │
                     Pod = runshoes(Spring Boot :3000) + chatbot 사이드카(:8766)
                     StatefulSet = runshoes-mysql (MySQL 8)
```

- 클러스터: GPU 호스트 위 VM 4대의 **kubeadm 클러스터**(`m-k8s` + `w1~w3-k8s`). Jenkins · Harbor · ArgoCD도 같은 클러스터에 있다
- 앱: Spring Boot 하나가 React 빌드물과 `/api`를 함께 서비스한다. 무상태 — **RollingUpdate(maxUnavailable 0)로 끊김 없이 배포**한다(Ready는 DB 접속까지 본다)
- 데이터: MySQL StatefulSet(local-path PVC). 스키마 · 시드는 앱이 기동할 때 Flyway로
- Ingress: ingress-nginx. 단일 호스트에서 path 기반 라우팅 — `/` → runshoes(3000), `/ws/chat` → chatbot(8766)
- 챗봇 사이드카: 파이썬 웹소켓 챗봇(`chatbot_server.py`)을 같은 Pod의 별도 컨테이너로 배포. 이미지(`runshoes-chatbot`)는 앱과 같은 태그로 따로 빌드한다
- Ollama 연동: Pod가 VM 사설망으로 GPU 호스트의 Ollama에 바로 붙는다 — `OLLAMA_URL=http://192.168.122.1:11434`
- 외부 노출: 클러스터 공용 **Cloudflare Tunnel**(cloudflared, `cloudflared` 네임스페이스) → https://runshoes.ronanlab.dev

자세한 내용은 [docs/INFRA.md](docs/INFRA.md).

---

## 9. 진행 상황

### 완료

| 항목          | 내용                                                                 |
| ------------- | -------------------------------------------------------------------- |
| 기본 요건     | 목록 · 필터 · 정렬 · 찜 · 상세 모달 · 리뷰 CRUD · 등록/관리 · 반응형 |
| 데이터 확충   | 러닝화 20종 · 리뷰 105개                                             |
| 이미지 다중화 | `image` → `images[]`, 모달 슬라이드 + 썸네일                         |
| 리뷰 좋아요   | 리뷰별 좋아요 + 베스트 리뷰 상단 고정                                |
| 맞춤 추천     | `/recommend` 5문항 점수제                                            |
| 백엔드        | Spring Boot + MySQL — Flyway 스키마 · 시드, 녹화한 API 계약으로 검증(`contract/`) |
| 배포          | 자체 Kubernetes 클러스터 GitOps CI/CD, 무중단 롤링 배포               |
| 챗봇          | 파이썬 웹소켓 챗봇 → 사이드카 컨테이너 배포 (`/ws/chat`)             |
| 인프라        | Cloudflare Tunnel로 사이트 외부 노출, Ollama는 사설망 직접 연결     |
| 리뷰 요약     | Ollama(gemma4 8B)로 긍정·아쉬운 점 요약 (K8s 프로덕션 동작)        |
| 로그인        | 가입 · 로그인(JWT) · 계정별 찜 · 공감, 내 리뷰만 수정, 관리 화면은 admin (→ docs/AUTH_DESIGN.md) |

### 예정

| 항목                    | 내용                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------ |
| 활동 로그 · 챗봇 연결   | 인증 · 리뷰 · 찜 · 조회 이력을 DB 에, 챗봇이 로그인 맥락을 읽는다(로그인 3단계 이후)    |
| About 페이지            | 서비스 설계 의도와 인프라 구축 과정을 정리한 소개 페이지 (다시 쓰는 중)               |
| 인프라 심화             | Argo Rollouts · 사이드카 로그 · CronJob 통계 스냅샷 · DB 백업 (→ 12장)               |
| 비교 (레이더 차트)      | 신발 2~3개 스펙을 오각형 레이더 차트로 겹쳐 비교                                     |
| 컬러웨이 선택           | 같은 모델의 다른 색상 전환                                                           |
| `/glossary`             | 용어사전 페이지 (`terms`의 `description` 활용)                                       |
| 러닝 코스 · 대회 도메인 | 신발 엔진(항목+리뷰+평점+찜) 재사용                                                  |

### 실행 순서

인프라 직무를 목표로, 기능은 로그인까지 완결한 뒤 힘을 인프라 쪽에 싣는다.

1. **로그인** — 계정 · 권한 · 화면까지 했다. 활동 로그 · 챗봇 연결이 남았다(docs/AUTH_DESIGN.md)
2. **인프라 심화** — Argo Rollouts(카나리) · 사이드카 로그 수집 · CronJob 리뷰 통계 스냅샷 · MySQL 백업
3. **확장 아이디어** — 비교(레이더 차트) · 러닝 앱(React Native) · 게임화

> CKA 자격증 학습 범위(probe · rolling update · CronJob 등)가 이 단계들과 직접 겹쳐,
> 자격증 공부가 곧 프로젝트 인프라 구현으로 이어지는 선순환 구조다.

### 확장 로드맵 — 러닝 통합 플랫폼

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

### RUNSHOES 앱 — 웹·앱 생태계 (구상)

웹(스펙 탐색)과 별도로, 실제 러닝 기록과 보유 신발의 마모를 관리하는
**React Native 앱**을 구상 중이다. 둘은 하나의 생태계로 순환한다.

웹(스펙 탐색·리뷰) → 앱(구매 후 실사용: GPS 러닝 트래킹 → 신발별 마일리지 누적 → 교체 시기 알림) → 다시 웹(내 신발 마모 현황)

- **연결의 전제** — 두 클라이언트가 하나의 Spring 백엔드 · MySQL · 계정을 공유한다.
  그래서 위 1·2단계 백엔드를 처음부터 **웹 전용이 아니라 웹·앱 공용 API**로 설계한다.
- **가용성의 명분** — 단일 백엔드가 웹·앱 두 클라이언트를 받치므로,
  백엔드 중단이 양쪽을 동시에 멈춘다. 무중단·가용성이 실질적으로 더 중요해진다.
- **추세 분석 두 갈래** — "현재 상태"만 있는 데이터에 시점별 스냅샷을 쌓아 추세를 만든다.
  - _리뷰 통계 스냅샷 (웹)_ — K8s CronJob이 주기적으로 신발별 평점·리뷰 수를
    기록해, 평점이 오르내리는 추세를 시각화한다.
  - _마모 예측 (앱)_ — 러닝 마일리지 시계열을 외삽해
    "현재 페이스면 약 N주 후 교체 시점"을 예측한다. 단순 시각화를 넘어선 예측형 추세다.

---

## 10. 데이터 출처

- 스펙: 각 브랜드 공식 발표 자료, 다나와 상품 스펙, 마라톤GO
- 이미지: KREAM (동일 규격 · 투명 배경 제품컷)
- 리뷰: 시드 데이터 (실제 사용자 리뷰가 아님)

수치가 자료마다 다른 경우 **브랜드 공식 발표를 우선**하고,
성별·발볼별로 스펙이 다른 모델은 **남성 레귤러 기준**으로 통일했다.

---

## 11. 리뷰 요약 (Ollama)

리뷰가 3개 이상인 신발은 언어 모델이 리뷰를 읽고 좋았던 점과 아쉬운 점을
나눠 요약한다. **Ollama(gemma4 8B)** 기반이며, GPU 서버의 Ollama를
**쿠버네티스 프로덕션에서도 실시간으로** 부른다.

### 동작 방식

- `SummaryService`(백엔드)가 `/api/shoes/:id/summary`에서 해당 신발의 리뷰를 모아 프롬프트로 구성
- 공감(좋아요) 수가 많은 리뷰일수록 더 비중 있게 반영하도록 프롬프트에 명시 — 리뷰는 공감 순으로 넣는다
- 의견이 서로 반대되는 경우, 한쪽만 고르지 않고 "의견이 갈립니다"처럼 양쪽을 함께 언급하도록 지시
- 요약은 서버 메모리에 캐싱하고, 해당 신발의 리뷰 개수(`reviewCount`)가 바뀔 때만 재생성한다.
  같은 개수로는 재호출하지 않으므로, 방문자가 반복해서 확인해도 추가 연산이 발생하지 않는다.
- 리뷰가 3개 미만이거나 LLM 호출이 실패하면 `{summary: null, reason}`을 돌려준다(언제나 200 — 화면은 카드를 숨긴다)
- `OLLAMA_URL` 환경변수(프로덕션: `http://192.168.122.1:11434`)로 대상을 지정한다. 챗봇(`chatbot_server.py`)도 같은 변수를 읽는다.
  쿠버네티스 노드가 GPU 호스트 위의 VM이고 같은 사설망에 있어 Pod가 Ollama에 바로 닿는다
- 개발 · 검증은 고정 응답 mock(`contract/mock-ollama.mjs`)으로 — GPU를 쓰지 않는다

> 대안: 비용 · 응답속도 문제가 생기면 Gemini 같은 API로 바꿀 수 있다 — `SummaryService`의 호출부만 바꾸면 된다.

---

## 12. 데이터 계층과 무중단 배포 — 설계

> "왜 이 구조인가"를 정리한 설계 문서다. API의 세부 모양(id · 타입 · 헤더)이 왜 그런지는 [docs/API_CONTRACT.md](docs/API_CONTRACT.md).

### 12.1 왜 파일 저장소가 아니라 MySQL인가

데이터를 파일 하나(JSON 등)에 두고 서버가 통째로 읽고 쓰는 구조에는 두 가지 근본적인 한계가 있다.

**첫째, 무중단 배포를 할 수 없다.** 파일 하나를
여러 프로세스가 동시에 쓰면 내용이 깨질 수 있어서(single writer 문제),
구·신 Pod가 잠시라도 함께 떠 있으면 위험하다. 무중단 배포
(`RollingUpdate`)는 정의상 구·신 Pod가 공존하는 방식이므로,
파일 저장소로는 배포 전략을 `Recreate`(기존 Pod를 모두 종료한 뒤 새 Pod를 생성)로
둘 수밖에 없고, 배포할 때마다 서비스가 잠깐 끊긴다.

**둘째, 확장과 로그인을 감당할 수 없다.** Pod를 여러 개로 늘리거나
(수평 확장), 사용자 계정·인증 같은 관계형 데이터를 다루려면
파일 기반 저장소로는 한계가 뚜렷하다.

결론적으로 이 프로젝트에서 목표하는 "무중단 배포 · 수평 확장 · 로그인"은
전부 데이터 계층을 전제로 한다. 데이터 계층이 모든 것의 열쇠다.

### 12.2 MySQL과 Spring Boot

저장소는 **MySQL**이다. SQLite가 아니라 MySQL인 이유는,
SQLite는 결국 파일 기반이라 앞서 말한 single writer 문제가 그대로
남기 때문이다. 네트워크로 접속하는 DB여야 애플리케이션을
**무상태(stateless)**로 만들 수 있고, 그래야 앱 Pod를 자유롭게
여러 개 띄우고 무중단으로 교체할 수 있다. 상태(데이터)는
DB 한 곳으로 격리하고, 앱은 상태를 갖지 않는 것이 핵심이다.

백엔드는 **Spring Boot**(Java 21)다. REST API를 노출하고
JPA로 MySQL에 접근하며, 스키마와 시드는 **Flyway**가 버전으로 관리한다(V1 스키마, V2 시드 — 적용된 버전은 고치지 않고 다음 버전으로).
같은 애플리케이션이 React 빌드물도 서비스해 프런트와 API가 한 오리진에 있다.

> **왜 Express가 아니라 Spring인가**
> 채용시장에서 Spring 수요가 크고, 마침 교육 과정에서 Spring을
> 학습 중이라 프로젝트가 그대로 실전 연습이 된다. 인프라 직무를
> 목표로 하더라도 Java/Spring 백엔드 경험은 이력서에서 강점이 된다.

> **웹·앱 공용 백엔드로 설계**
> 이 백엔드는 웹뿐 아니라 향후 React Native 앱(9장 "RUNSHOES 앱" 참고)도
> 함께 사용한다. 따라서 처음부터 웹 전용이 아니라 **두 클라이언트가
> 공유하는 API**로 스키마와 엔드포인트를 설계한다.

### 12.3 스키마 방향 — 로그인을 미리 고려

현재 리뷰 좋아요는 `likeCount`(숫자) + `liked`(전역 눌림 상태)로,
로그인이 없어서 생긴 임시 구조다. 로그인을 붙일 때 좋아요를
**별도 테이블(`review_likes`, 예: `review_id` + `user_id`)로 분리**한다(Flyway V3).
이렇게 하면 "내가 누른 리뷰만" 정확히 판별할 수 있다.

### 12.4 접속 정보 관리와 커넥션 풀

DB 계정·비밀번호는 코드에 넣지 않고 다음 흐름으로 주입한다.

Kubernetes Secret → Pod 환경변수 → Spring 설정(application.yml) → MySQL 접속

로컬 개발에서는 `docker-compose.yml`의 MySQL과 application.yml 기본값, 클러스터에서는 Secret(`runshoes-mysql`)을 사용한다.
BASE_PATH · OLLAMA_URL도 같은 방식으로 환경변수로 분리한다.

커넥션 풀은 **Spring Boot가 기본으로 HikariCP를 내장**한다(풀 5개).
요청마다 새로 연결하는 대신 풀에서 빌려 쓰는 방식으로, 앱 Pod를
여러 개 띄웠을 때 각 Pod가 자신의 풀로 DB에 접속한다. 풀이 없으면
부하가 조금만 몰려도 연결이 고갈되므로 확장의 필수 전제인데,
Spring에서는 이것이 별도 구성 없이 기본 제공된다.

### 12.5 무중단 배포 — Probe가 핵심

앱이 무상태이므로 배포 전략은 **`RollingUpdate`**다. 두 파라미터로 "끊김 없는 교체"를 만든다.

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
  liveness가 조기에 컨테이너를 죽이는 일을 막는다(Flyway 첫 기동 — 최대 2분).

상태 점검은 Spring Boot Actuator(`/actuator/health/liveness` · `/readiness`)를 쓴다.
readiness는 단순히 "프로세스 살아 있음"에 그치지 않고 **DB 연결까지 확인**한다
(`management.endpoint.health.group.readiness.include: readinessState,db`). DB에 붙지 못한 Pod에는 트래픽이 가지 않는다.
종료할 때는 preStop 5초로 Ingress가 엔드포인트를 뺄 시간을 주고, graceful shutdown으로 처리 중인 요청을 마친다.

### 12.6 롤백 — 두 층위

- **롤아웃 자동 중단** — 새 Pod의 readiness가 계속 실패하면
  RollingUpdate가 스스로 멈추고, 기존 Pod들이 서비스를 계속
  이어간다. 잘못된 버전이 나가도 트래픽이 넘어가지 않는 방어선이다.
- **명시적 되돌리기(GitOps 방식)** — 이미 배포된 버전을 되돌릴 때는
  `kubectl rollout undo`가 아니라, **인프라 레포(ronanlab-infra)에서 이미지 태그를
  이전 값으로 되돌리는 커밋(revert)**을 하고 Sync한다. GitOps에서는 롤백조차
  하나의 git 커밋이며, 배포 이력이 곧 git 이력으로 남는다.
  단 DB 스키마는 되돌아가지 않으므로, 마이그레이션은 옛 버전 앱과도 함께 돌 수 있게 만든다.

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

### 12.8 주기적 배치 — CronJob 리뷰 통계 스냅샷

데이터 계층이 MySQL로 옮겨지면, "현재 상태"만 있는 데이터에
**시점별 스냅샷을 쌓아 추세를 만들 수 있다.** 쿠버네티스 **CronJob**으로
주기적(예: 매일 자정) 배치를 스케줄링해, 각 신발의 평점 · 리뷰 수를
`review_stats` 테이블에 기록한다. 웹에서는 이 시계열을 차트로 그려
"이 신발 평점이 오르는/내리는 추세"를 보여준다.

- 앱 레벨 크론이 아니라 **클러스터 레벨 CronJob**으로 구현해,
  "주기적 배치 작업의 K8s 스케줄링"이라는 인프라 관점을 드러낸다.
- CronJob은 CKA 학습 범위와도 겹쳐, 자격증 공부와 프로젝트가
  같은 지점에서 만난다.

### 12.9 제약과 현실적 고려

자체 클러스터의 노드는 VM 4대(각 메모리 약 3.9GiB)다. Jenkins · Harbor · ArgoCD와
다른 프로젝트가 같은 노드를 나눠 쓰므로, MySQL Pod(requests 512Mi)와 앱 Pod(512Mi), 빌드 Pod(BuildKit, requests 1.5GiB · 최대 2.4GiB 사용)가
겹치는 노드를 피해야 한다. MySQL은 local-path(노드 디스크)라 한 노드에 묶이므로 여유가 가장 큰 노드를 골랐다. 백업은 아직 수동(mysqldump)이다.

또한 실무에서는 DB를 클러스터 안에 두지 않고 관리형 서비스(RDS 등)를
쓰는 것이 일반적이다. 다만 학습·포트폴리오 목적에서는 StatefulSet로
직접 운영해 보는 편이 "StatefulSet과 Deployment가 왜 다른가"를
체득하는 데 유리하다고 판단해, 클러스터 내 StatefulSet 방식으로 간다.
