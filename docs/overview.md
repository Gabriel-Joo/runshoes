<!--
다루는 곳: src/, backend/, chatbot/, catalog/, contract/, scripts/, Dockerfile, Dockerfile.chatbot, Jenkinsfile, CLAUDE.md, README.md
읽은 커밋: 662b77b
-->
# 전체 구조
> 상태: 2026-11-17 코드와 맞춰 봄. 운영에서 쓰는 중, https://runshoes.ronanlab.dev . 신발 310켤레, 리뷰 1,800건(2026-11-09 시드, `01e`, 2026-11-17 공개 API 로 다시 셈), 마이그레이션 V1~V24(마지막 `V24__chatbot_miss_note.sql`). 원천: 영역 문서 01a ~ 10, README(옛 2, 5, 6, 9절) [c:89117ec] [docs:01e_seed_reviews.md] [code:backend/src/main/resources/db/migration/V24__chatbot_miss_note.sql:1] [docs:09_chatbot_rag.md] [docs:10_recommend.md] <!-- 확인 못 함: 신발 310켤레, 리뷰 1,800건, 운영 중인지는 운영 DB와 운영 사이트의 값 -->

#### 0. 한 줄 요약

React, TypeScript 화면과 Spring Boot, MySQL API 를 한 이미지로 묶어, 자체 쿠버네티스 클러스터에 GitOps 로 배포한 러닝화 리뷰 아카이브다. 카탈로그는 공개 출처에서 모아 **사람 판단과 함께** 관리자 API 로 적재하고, 화면은 값이 없으면 "정보 없음"을 보여 준다. [code:Dockerfile:1] [code:Dockerfile:45-46] [code:Jenkinsfile:1] [code:catalog/load.mjs:1] [code:src/utils/display.ts:1-2]

#### 1. 서비스 지도

```
                   ┌──────────── 방문자 ────────────┐
                   ▼                               │
Cloudflare ─ 공용 터널 ─ ingress-nginx              │
                   │                               │
   ┌───────────── Pod runshoes(Deployment) ─────────────┐
   │  runshoes :3000  Spring Boot                       │
   │   ├ 화면(React 빌드물, SPA)                         │
   │   ├ /api/shoes · reviews · terms  json-server 계약  │──▶ MySQL 8(StatefulSet runshoes-mysql)
   │   ├ /api/auth · /api/me · like · admin · activity   │       Flyway V1~V24
   │   └ /api/shoes/{id}/summary ─────────────┐          │
   │  chatbot :8766  Python WebSocket ─────────┤          │
   └───────────────────────────────────────────┼──────────┘
                                               ▼
                                  Ollama(GPU 호스트, gemma4)
카탈로그(저장소 catalog/) ─ load.mjs ─▶ 관리자 API(/api/shoes)
```

| 부분 | 무엇 | 문서 |
|---|---|---|
| 카탈로그 | 후보, 수집, 사람 판단(`decisions.json`), 이미지, 적재기, 문구, 시드 리뷰 | `01a`, `01b`, `01c`, `01d`, `01e` [docs:01a_catalog_sources.md] [docs:01b_catalog_images.md] [docs:01c_catalog_loader.md] [docs:01d_catalog_copy.md] [docs:01e_seed_reviews.md] [code:catalog/] |
| 화면 | 홈, 상세 모달, 추천받기, 비교하기, 러너들의 선택, 마이페이지, 로그인 | `02_screens.md`, `02b_design_system.md` [docs:02_screens.md] [docs:02b_design_system.md] [code:src/pages/] |
| 관리 화면 | 등록, 수정, 출처, 보완 필요, 숨김, 영구 삭제, 수정 이력, 관리자 페이지(리뷰, 회원, 챗봇) | `03_admin.md` [docs:03_admin.md] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminReviewController.java:25] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminUserController.java:31] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotMissController.java:79] |
| 계정 | JWT, refresh 쿠키, 체험 계정, 시도 제한, 활동 로그 | `04_auth.md` [docs:04_auth.md] [code:backend/src/main/java/com/kopo17/runshoes/auth/] [code:backend/src/main/java/com/kopo17/runshoes/activity/] |
| API | json-server 계약 재현 + 새 기능, 계약 시험 | `05_api_contract.md` [docs:05_api_contract.md] [code:backend/src/main/java/com/kopo17/runshoes/api/ListQuery.java:15-17] [code:contract/] |
| 배포 | Jenkins(BuildKit) → Harbor → 인프라 리포 태그 → ArgoCD | `06_deployment.md` [docs:06_deployment.md] [code:Jenkinsfile:1] [code:Jenkinsfile:59-63] [code:Jenkinsfile:116] <!-- 확인 못 함: ArgoCD 는 인프라 저장소와 클러스터 쪽 --> |
| DB | 테이블 14, 뷰 1, 마이그레이션 V1~V24 | `07_database.md` [docs:07_database.md] [code:backend/src/main/resources/db/migration/] [code:backend/src/main/resources/db/migration/V21__grafana_compare_views.sql:12] |
| 비교 | 점수 없는 비교표(2~5켤레), 자동 채우기, 분포 그래프. 운영 반영(2026-11-09). 레이더 차트는 버렸다 | `08_compare.md` [docs:08_compare.md] [code:src/pages/Compare.tsx:19] [code:src/utils/compare.ts:8] <!-- 확인 못 함: 운영 반영 날짜는 운영 쪽 기록 --> |

| 저장소 | 담는 것 |
|---|---|
| `Gabriel-Joo/runshoes`(public) | `src/` 화면, `backend/` API, `catalog/` 카탈로그, `contract/` 계약 시험, `scripts/`, `Dockerfile`, `Dockerfile.chatbot`, `Jenkinsfile`, `docs/` [code:src/] [code:backend/] [code:catalog/] [code:contract/] [code:scripts/] [code:Dockerfile:1] [code:Dockerfile.chatbot:10] [code:Jenkinsfile:1] <!-- 확인 못 함: 저장소 이름과 public 여부는 GitHub 쪽 --> |
| `Gabriel-Joo/ronanlab-infra`(private) | `apps/runshoes/` 매니페스트, 이미지 태그, 런북, `platform/` 클러스터 공용 [code:Jenkinsfile:63] <!-- 확인 못 함: 인프라 저장소의 내용은 이 저장소 밖 --> |

#### 2. 데이터 흐름

```
① 카탈로그   candidates.csv(408행) ─ 수집기 · KicksDB 이미지 ─ decisions.json(사람 판단) ─ build.mjs ─ shoes.jsonl(적재 대상 309)
② 적재      load.mjs — 건조 실행 → 관리 화면 수정 먼저 가져오기 → 관리자 API 로 POST · PATCH(scripts/load-prod.sh --apply)
③ API       Spring Boot — 검증(값 범위 · 출처 형식 · 품번) → MySQL. 평점 · 찜 수 · 작성자는 서버가 정한다
④ 화면      목록 · 검색 · 정렬은 서버가, 화면은 받은 것을 그린다. 없는 값은 "정보 없음"
⑤ 사람      리뷰 · 찜 · 도움이 돼요(계정별) · 관리 화면 수정 → 다음 적재 때 ② 가 decisions.json 으로 가져간다
```

- **DB 에 직접 쓰지 않는다.** 카탈로그도 관리자 API 를 탄다. 앱의 검증을 그대로 받고, 수정 이력에서 적재기와 사람이 구분된다(`X-Runshoes-Client: loader`). [code:catalog/load.mjs:90-91] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:36] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:281]
- **사람 판단이 수집값보다 먼저다.** 관리 화면에서 고친 값은 다음 적재에서 되돌려지지 않는다. [code:catalog/pull-admin.mjs:3-4] [code:catalog/pull-admin.mjs:8]

#### 3. 기술 선택

| 무엇 | 선택 | 한 줄 이유 | 문서 |
|---|---|---|---|
| 화면 | React 19, TypeScript 6, Vite 8, React Router 7 | 과제 요건. 상태 라이브러리, 차트 라이브러리 없이 | `02_screens.md` [docs:02_screens.md] [code:package.json:15-17] [code:package.json:30] [code:package.json:32] |
| API | Spring Boot 3.5, Java 21 | json-server 계약을 녹화해 그대로 재현, 그 위에 권한과 검증 | `05_api_contract.md` [docs:05_api_contract.md] [code:backend/pom.xml:11-12] [code:backend/pom.xml:22] |
| DB | MySQL 8, Flyway | 추가만 하는 마이그레이션. 옛 이미지로 롤백해도 뜬다 | `07_database.md` [docs:07_database.md] [code:docker-compose.yml:9] [code:backend/src/main/resources/application.yml:17-19] [code:backend/src/main/resources/application.yml:22] |
| 인증 | JWT(메모리) + refresh(HttpOnly 쿠키) | 토큰을 localStorage 에 두지 않는다 | `04_auth.md` [docs:04_auth.md] [code:src/auth/session.ts:5] [code:src/auth/session.ts:48] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthController.java:124] |
| 시도 제한, 활동 로그 | MySQL `activity_logs` | Redis 없이, 규모에 맞게 | `04_auth.md` [docs:04_auth.md] [code:backend/src/main/resources/db/migration/V3__auth.sql:113] [code:backend/src/main/java/com/kopo17/runshoes/auth/LoginLocks.java:11] |
| 이미지 | 앱 + 화면 한 이미지(jlink JRE, 252MB) | 배포 단위 하나, 태그 = 커밋 | `06_deployment.md` [docs:06_deployment.md] [code:Dockerfile:34-35] [code:Dockerfile:45-46] (2026-11-02 기준) [c:298845e] |
| 배포 | Jenkins, BuildKit, Harbor, ArgoCD(GitOps) | Jenkins 는 Git 에 쓰고 ArgoCD 는 Git 을 읽는다. 서로 부르지 않는다 | `06_deployment.md` [docs:06_deployment.md] [code:Jenkinsfile:1] [code:Jenkinsfile:116] [code:Jenkinsfile:149-155] <!-- 확인 못 함: ArgoCD 쪽은 클러스터와 인프라 저장소 --> |
| 클러스터 | 자체 kubeadm(VM 4), Cloudflare Tunnel | 학교 환경에서 이주, 운영 도구는 Access 뒤 | `06_deployment.md` [docs:06_deployment.md] <!-- 확인 못 함: 클러스터 구성은 이 저장소 밖 --> |
| AI | Ollama(gemma4, 리뷰 요약과 챗봇) | GPU 호스트를 사설망으로 바로 | `02_screens.md` [docs:02_screens.md] [code:chatbot/llm.py:1] [code:chatbot/llm.py:12-13] [code:backend/src/main/resources/application.yml:53-54] [code:backend/src/main/java/com/kopo17/runshoes/summary/] <!-- 확인 못 함: GPU 호스트와 사설망 연결은 이 저장소 밖 --> |
| 카탈로그 이미지 | KicksDB(StockX, GOAT) + 실루엣 대조 | 같은 각도, 같은 모델의 색상만 | `01b_catalog_images.md` [docs:01b_catalog_images.md] [code:catalog/stockx.mjs:1] [code:catalog/silhouette.py:1] |

#### 4. 남은 한계

- **옛 칸이 남아 있다.** → `07_database.md` 4절 [docs:07_database.md]

**조건: 우리가 고르지 않은 것**
- **리뷰는 가상 사용자 200명이 쓴 시드 1,800건이다.** 310켤레 모두 리뷰가 있지만 3건 이하인 신발이 123켤레라, 랭킹과 추천 동점 처리와 비교의 평점은 시드가 만든 값이다(`01e_seed_reviews.md`, `08_compare.md` 4절). (2026-11-17 운영 공개 API 로 다시 셈: 310켤레의 reviewCount 합 1,800, 3건 이하 123켤레) [c:89117ec] [docs:01e_seed_reviews.md] [docs:08_compare.md] [code:backend/src/main/java/com/kopo17/runshoes/summary/StaleRule.java:7] <!-- 확인 못 함: 생성 스크립트와 글은 git 밖 -->
- **빈 칸이 많다.** 발볼 191, 가격 154켤레가 정보 없음. 와이드는 재조사를 마쳐 4켤레만 비었다(`01a_catalog_sources.md` 1-7). (2026-11-05 기준) [c:fa31029] [docs:01a_catalog_sources.md] <!-- 확인 못 함: 빈 칸 수는 운영 DB 값 -->

#### 5. 저장소 지도

맨 위 `README.md` 는 생성물이라(`tools/docs.py readme`, `.foreman/docs.toml` `[readme]`) 폴더 지도는 여기에 둔다(2026-11-19 사용자, 인프라가 docs 00편에 둔 것과 같은 자리).

```
runshoes/
├─ src/          React 화면. pages, components, auth(메모리 토큰, refresh), utils
├─ backend/      Spring Boot. api, auth, activity, summary, compare, config, db/migration(Flyway V1~V24)
├─ chatbot/      챗봇 사이드카(파이썬). 웹소켓 server, router, branches(갈래), search, 평가(eval/), tests/
├─ catalog/      카탈로그. candidates.csv, 수집기, decisions.json(사람 판단), build.mjs, load.mjs, pull-admin.mjs, copy.json
├─ contract/     API 계약 녹화본(baseline/)과 녹화, 비교 도구
├─ scripts/      운영 적재(load-prod.sh), 시드 생성, 추천과 비교 대조(parity/), 화면 점검(screen-shot.mjs), 문서 점검(docs-check.py)
├─ tests/        화면 쪽 단위 시험
├─ public/       화면이 쓰는 정적 이미지
├─ docs/         개발 문서(설계, 규칙, 지금 상태). archive/ 는 옛 계획서(지우지 않는다)
├─ notion/       노션 기술문서 원고(사람이 읽는 글)
├─ portfolio/    노션 포트폴리오 원고와 화면 사진(img/)
├─ config/       포트폴리오 주제(portfolio.toml)
├─ log/          작업 기록
├─ Dockerfile, Dockerfile.chatbot, Jenkinsfile, docker-compose.yml
└─ db.json       json-server 시절의 시드. 카탈로그 빌드가 시드 20켤레의 값을 읽는다
```

[code:backend/src/main/resources/db/migration/V24__chatbot_miss_note.sql:1] [code:catalog/build.mjs:155] [code:config/portfolio.toml:1]

배포 명세(매니페스트, 이미지 태그, 런북)는 인프라 저장소 `apps/runshoes/` 에 있다(`06_deployment.md`). [docs:06_deployment.md] <!-- 확인 못 함: 인프라 저장소 -->

#### 6. 로컬에서 실행하기

```bash
yarn
docker compose up -d            # MySQL 8, 127.0.0.1:3307
# 백엔드: backend/README.md (Maven, Java 21). 첫 기동에 Flyway 가 스키마와 시드를 넣는다
#   API http://localhost:3000. env JWT_SECRET(32바이트 이상)이 있어야 뜬다. 시드 계정 비밀번호는 SEED_USER_PASSWORD, ADMIN_PASSWORD
yarn dev                        # Vite. /api 는 vite 프록시로 :3000
python -m chatbot.server        # (선택) 챗봇 ws :8766. env RUNSHOES_API(기본 :3000), OLLAMA_URL
```

[code:docker-compose.yml:24] [code:vite.config.ts:8] [code:chatbot/server.py:126] [code:chatbot/http.py:13] [code:chatbot/llm.py:12]

- 개발 중에도 같은 출처의 `/api` 를 부르고 Vite 가 `:3000` 으로 넘긴다. refresh 쿠키(`Path=/api/auth`)가 운영과 같게 붙는다. [code:vite.config.ts:8] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthController.java:125]
- 이미지: `docker build -t runshoes .`(Vite, Maven, jlink JRE, alpine). 실행 env 는 `backend/README.md`. [code:Dockerfile:35]
- 계약 시험: `contract/run-spring-local.sh v6`. 전용 임시 MySQL `runshoes-mysql-contract`(127.0.0.1:3309, tmpfs)를 새로 띄워 V1 부터 올려 녹화하고 비교한다. 개발 DB 는 건드리지 않는다. [code:contract/run-spring-local.sh:13] [code:contract/run-spring-local.sh:30-31]
- 빈 DB 로: `docker compose down -v && docker compose up -d`. **로컬 개발 DB 를 지운다.** 계약 시험은 이 DB 를 쓰지 않는다.

#### 다음에 할 일

남은 일은 [`TODO.md`](TODO.md) 한 곳에 모은다. 한 줄에 하나, 상세는 그 주제의 문서. [docs:TODO.md]
