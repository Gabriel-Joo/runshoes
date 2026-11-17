<!--
다루는 곳: src/, backend/, chatbot/, catalog/, contract/, scripts/, Dockerfile, Dockerfile.chatbot, Jenkinsfile, CLAUDE.md, README.md
읽은 커밋: 606b730
-->
> 상태: 2026-11-17 코드와 맞춰 봄. 운영에서 쓰는 중, https://runshoes.ronanlab.dev . 신발 310켤레, 리뷰 1,800건(2026-11-09 시드, `01e`, 2026-11-17 공개 API 로 다시 셈), 마이그레이션 V1~V24(마지막 `V24__chatbot_miss_note.sql`). 원천: 영역 문서 01a ~ 10, README(옛 2, 5, 6, 9절) [c:89117ec] [docs:01e_seed_reviews.md] [code:backend/src/main/resources/db/migration/V24__chatbot_miss_note.sql:1] [docs:09_chatbot_rag.md] [docs:10_recommend.md] <!-- 확인 못 함: 신발 310켤레, 리뷰 1,800건, 운영 중인지는 운영 DB와 운영 사이트의 값 -->

#### 0. 한 줄 요약

React · TypeScript 화면과 Spring Boot · MySQL API 를 한 이미지로 묶어, 자체 쿠버네티스 클러스터에 GitOps 로 배포한 러닝화 리뷰 아카이브다. 카탈로그는 공개 출처에서 모아 **사람 판단과 함께** 관리자 API 로 적재하고, 화면은 값이 없으면 "정보 없음"을 보여 준다. [code:Dockerfile:1] [code:Dockerfile:45-46] [code:Jenkinsfile:1] [code:catalog/load.mjs:1] [code:src/utils/display.ts:1-2]

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
| 카탈로그 | 후보 · 수집 · 사람 판단(`decisions.json`) · 이미지 · 적재기 · 문구 · 시드 리뷰 | `01a` · `01b` · `01c` · `01d` · `01e` [docs:01a_catalog_sources.md] [docs:01b_catalog_images.md] [docs:01c_catalog_loader.md] [docs:01d_catalog_copy.md] [docs:01e_seed_reviews.md] [code:catalog/] |
| 화면 | 홈 · 상세 모달 · 추천받기 · 비교하기 · 러너들의 선택 · 마이페이지 · 로그인 | `02_screens.md` · `02b_design_system.md` [docs:02_screens.md] [docs:02b_design_system.md] [code:src/pages/] |
| 관리 화면 | 등록 · 수정 · 출처 · 보완 필요 · 숨김 · 영구 삭제 · 수정 이력, 관리자 페이지(리뷰 · 회원 · 챗봇) | `03_admin.md` [docs:03_admin.md] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminReviewController.java:25] [code:backend/src/main/java/com/kopo17/runshoes/api/AdminUserController.java:31] [code:backend/src/main/java/com/kopo17/runshoes/api/ChatbotMissController.java:79] |
| 계정 | JWT · refresh 쿠키 · 체험 계정 · 시도 제한 · 활동 로그 | `04_auth.md` [docs:04_auth.md] [code:backend/src/main/java/com/kopo17/runshoes/auth/] [code:backend/src/main/java/com/kopo17/runshoes/activity/] |
| API | json-server 계약 재현 + 새 기능, 계약 시험 | `05_api_contract.md` [docs:05_api_contract.md] [code:backend/src/main/java/com/kopo17/runshoes/api/ListQuery.java:15-17] [code:contract/] |
| 배포 | Jenkins(BuildKit) → Harbor → 인프라 리포 태그 → ArgoCD | `06_deployment.md` [docs:06_deployment.md] [code:Jenkinsfile:1] [code:Jenkinsfile:59-63] [code:Jenkinsfile:116] <!-- 확인 못 함: ArgoCD 는 인프라 저장소와 클러스터 쪽 --> |
| DB | 테이블 14 · 뷰 1 · 마이그레이션 V1~V24 | `07_database.md` [docs:07_database.md] [code:backend/src/main/resources/db/migration/] [code:backend/src/main/resources/db/migration/V21__grafana_compare_views.sql:12] |
| 비교 | 점수 없는 비교표(2~5켤레) · 자동 채우기 · 분포 그래프 — 운영 반영(2026-11-09). 레이더 차트는 버렸다 | `08_compare.md` [docs:08_compare.md] [code:src/pages/Compare.tsx:19] [code:src/utils/compare.ts:8] <!-- 확인 못 함: 운영 반영 날짜는 운영 쪽 기록 --> |

| 저장소 | 담는 것 |
|---|---|
| `Gabriel-Joo/runshoes`(public) | `src/` 화면 · `backend/` API · `catalog/` 카탈로그 · `contract/` 계약 시험 · `scripts/` · `Dockerfile` · `Dockerfile.chatbot` · `Jenkinsfile` · `docs/` [code:src/] [code:backend/] [code:catalog/] [code:contract/] [code:scripts/] [code:Dockerfile:1] [code:Dockerfile.chatbot:10] [code:Jenkinsfile:1] <!-- 확인 못 함: 저장소 이름과 public 여부는 GitHub 쪽 --> |
| `Gabriel-Joo/ronanlab-infra`(private) | `apps/runshoes/` 매니페스트 · 이미지 태그 · 런북, `platform/` 클러스터 공용 [code:Jenkinsfile:63] <!-- 확인 못 함: 인프라 저장소의 내용은 이 저장소 밖 --> |

#### 2. 데이터 흐름

```
① 카탈로그   candidates.csv(408행) ─ 수집기 · KicksDB 이미지 ─ decisions.json(사람 판단) ─ build.mjs ─ shoes.jsonl(적재 대상 309)
② 적재      load.mjs — 건조 실행 → 관리 화면 수정 먼저 가져오기 → 관리자 API 로 POST · PATCH(scripts/load-prod.sh --apply)
③ API       Spring Boot — 검증(값 범위 · 출처 형식 · 품번) → MySQL. 평점 · 찜 수 · 작성자는 서버가 정한다
④ 화면      목록 · 검색 · 정렬은 서버가, 화면은 받은 것을 그린다. 없는 값은 "정보 없음"
⑤ 사람      리뷰 · 찜 · 도움이 돼요(계정별) · 관리 화면 수정 → 다음 적재 때 ② 가 decisions.json 으로 가져간다
```

- **DB 에 직접 쓰지 않는다.** 카탈로그도 관리자 API 를 탄다 — 앱의 검증을 그대로 받고, 수정 이력에서 적재기와 사람이 구분된다(`X-Runshoes-Client: loader`). [code:catalog/load.mjs:90-91] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:36] [code:backend/src/main/java/com/kopo17/runshoes/api/ShoeCollection.java:281]
- **사람 판단이 수집값보다 먼저다.** 관리 화면에서 고친 값은 다음 적재에서 되돌려지지 않는다. [code:catalog/pull-admin.mjs:3-4] [code:catalog/pull-admin.mjs:8]

#### 3. 기술 선택

| 무엇 | 선택 | 한 줄 이유 | 문서 |
|---|---|---|---|
| 화면 | React 19 · TypeScript 6 · Vite 8 · React Router 7 | 과제 요건. 상태 라이브러리 · 차트 라이브러리 없이 | `02_screens.md` [docs:02_screens.md] [code:package.json:14-22] [code:package.json:33] [code:package.json:35] |
| API | Spring Boot 3.5 · Java 21 | json-server 계약을 녹화해 그대로 재현, 그 위에 권한 · 검증 | `05_api_contract.md` [docs:05_api_contract.md] [code:backend/pom.xml:11-12] [code:backend/pom.xml:22] |
| DB | MySQL 8 · Flyway | 추가만 하는 마이그레이션 — 옛 이미지로 롤백해도 뜬다 | `07_database.md` [docs:07_database.md] [code:docker-compose.yml:9] [code:backend/src/main/resources/application.yml:17-19] [code:backend/src/main/resources/application.yml:22] |
| 인증 | JWT(메모리) + refresh(HttpOnly 쿠키) | 토큰을 localStorage 에 두지 않는다 | `04_auth.md` [docs:04_auth.md] [code:src/auth/session.ts:5] [code:src/auth/session.ts:48] [code:backend/src/main/java/com/kopo17/runshoes/auth/AuthController.java:124] |
| 시도 제한 · 활동 로그 | MySQL `activity_logs` | Redis 없이 — 규모에 맞게 | `04_auth.md` [docs:04_auth.md] [code:backend/src/main/resources/db/migration/V3__auth.sql:113] [code:backend/src/main/java/com/kopo17/runshoes/auth/LoginLocks.java:11] |
| 이미지 | 앱 + 화면 한 이미지(jlink JRE, 252MB) | 배포 단위 하나, 태그 = 커밋 | `06_deployment.md` [docs:06_deployment.md] [code:Dockerfile:34-35] [code:Dockerfile:45-46] (2026-11-02 기준) [c:298845e] |
| 배포 | Jenkins · BuildKit · Harbor · ArgoCD(GitOps) | Jenkins 는 Git 에 쓰고 ArgoCD 는 Git 을 읽는다 — 서로 부르지 않는다 | `06_deployment.md` [docs:06_deployment.md] [code:Jenkinsfile:1] [code:Jenkinsfile:116] [code:Jenkinsfile:149-155] <!-- 확인 못 함: ArgoCD 쪽은 클러스터와 인프라 저장소 --> |
| 클러스터 | 자체 kubeadm(VM 4) · Cloudflare Tunnel | 학교 환경에서 이주, 운영 도구는 Access 뒤 | `06_deployment.md` [docs:06_deployment.md] <!-- 확인 못 함: 클러스터 구성은 이 저장소 밖 --> |
| AI | Ollama(gemma4) — 리뷰 요약 · 챗봇 | GPU 호스트를 사설망으로 바로 | `02_screens.md` [docs:02_screens.md] [code:chatbot/llm.py:1] [code:chatbot/llm.py:12-13] [code:backend/src/main/resources/application.yml:53-54] [code:backend/src/main/java/com/kopo17/runshoes/summary/] <!-- 확인 못 함: GPU 호스트와 사설망 연결은 이 저장소 밖 --> |
| 카탈로그 이미지 | KicksDB(StockX · GOAT) + 실루엣 대조 | 같은 각도 · 같은 모델의 색상만 | `01b_catalog_images.md` [docs:01b_catalog_images.md] [code:catalog/stockx.mjs:1] [code:catalog/silhouette.py:1] |

#### 4. 남은 한계

- **옛 칸이 남아 있다.** → `07_database.md` 4절 [docs:07_database.md]

**조건: 우리가 고르지 않은 것**
- **리뷰는 가상 사용자 200명이 쓴 시드 1,800건이다.** 310켤레 모두 리뷰가 있지만 3건 이하인 신발이 123켤레라, 랭킹과 추천 동점 처리와 비교의 평점은 시드가 만든 값이다(`01e_seed_reviews.md`, `08_compare.md` 4절). (2026-11-17 운영 공개 API 로 다시 셈: 310켤레의 reviewCount 합 1,800, 3건 이하 123켤레) [c:89117ec] [docs:01e_seed_reviews.md] [docs:08_compare.md] [code:backend/src/main/java/com/kopo17/runshoes/summary/StaleRule.java:7] <!-- 확인 못 함: 생성 스크립트와 글은 git 밖 -->
- **빈 칸이 많다.** 발볼 191 · 가격 154켤레가 정보 없음. 와이드는 재조사를 마쳐 4켤레만 비었다(`01a_catalog_sources.md` 1-7). (2026-11-05 기준) [c:fa31029] [docs:01a_catalog_sources.md] <!-- 확인 못 함: 빈 칸 수는 운영 DB 값 -->

#### 다음에 할 일

남은 일은 [`TODO.md`](TODO.md) 한 곳에 모은다 — 한 줄에 하나, 상세는 그 주제의 문서. [docs:TODO.md]
