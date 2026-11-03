> 상태: 운영에서 쓰는 중(2026-11-02) — https://runshoes.ronanlab.dev . 신발 302켤레 · 리뷰 104건 · 마이그레이션 V12. 원천: 영역 문서 01a ~ 08 · README(옛 2 · 5 · 6 · 9절)

#### 0. 한 줄 요약

React · TypeScript 화면과 Spring Boot · MySQL API 를 한 이미지로 묶어, 자체 쿠버네티스 클러스터에 GitOps 로 배포한 러닝화 리뷰 아카이브다. 카탈로그는 공개 출처에서 모아 **사람 판단과 함께** 관리자 API 로 적재하고, 화면은 값이 없으면 "정보 없음"을 보여 준다.

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
   │   ├ /api/auth · /api/me · like · admin · activity   │       Flyway V1~V12
   │   └ /api/shoes/{id}/summary ─────────────┐          │
   │  chatbot :8766  Python WebSocket ─────────┤          │
   └───────────────────────────────────────────┼──────────┘
                                               ▼
                                  Ollama(GPU 호스트, gemma4)
카탈로그(저장소 catalog/) ─ load.mjs ─▶ 관리자 API(/api/shoes)
```

| 부분 | 무엇 | 문서 |
|---|---|---|
| 카탈로그 | 후보 · 수집 · 사람 판단(`decisions.json`) · 이미지 · 적재기 | `01a` · `01b` · `01c` |
| 화면 | 홈 · 상세 모달 · 맞춤 추천 · 러너들의 선택 · 마이페이지 · 로그인 | `02_screens.md` · `02b_design_system.md` |
| 관리 화면 | 등록 · 수정 · 출처 · 보완 필요 · 숨김 · 영구 삭제 · 수정 이력 | `03_admin.md` |
| 계정 | JWT · refresh 쿠키 · 체험 계정 · 시도 제한 · 활동 로그 | `04_auth.md` |
| API | json-server 계약 재현 + 새 기능, 계약 시험 | `05_api_contract.md` |
| 배포 | Jenkins(BuildKit) → Harbor → 인프라 리포 태그 → ArgoCD | `06_deployment.md` |
| DB | 테이블 9 · 마이그레이션 V1~V12 | `07_database.md` |
| 비교 | 설계안(결정 전) | `08_compare.md` |

| 저장소 | 담는 것 |
|---|---|
| `Gabriel-Joo/runshoes`(public) | `src/` 화면 · `backend/` API · `catalog/` 카탈로그 · `contract/` 계약 시험 · `scripts/` · `Dockerfile` · `Dockerfile.chatbot` · `Jenkinsfile` · `docs/` |
| `Gabriel-Joo/ronanlab-infra`(private) | `apps/runshoes/` 매니페스트 · 이미지 태그 · 런북, `platform/` 클러스터 공용 |

#### 2. 데이터 흐름

```
① 카탈로그   candidates.csv(407행) ─ 수집기 · KicksDB 이미지 ─ decisions.json(사람 판단) ─ build.mjs ─ shoes.jsonl(적재 대상 301)
② 적재      load.mjs — 건조 실행 → 관리 화면 수정 먼저 가져오기 → 관리자 API 로 POST · PATCH(scripts/load-prod.sh --apply)
③ API       Spring Boot — 검증(값 범위 · 출처 형식 · 품번) → MySQL. 평점 · 찜 수 · 작성자는 서버가 정한다
④ 화면      목록 · 검색 · 정렬은 서버가, 화면은 받은 것을 그린다. 없는 값은 "정보 없음"
⑤ 사람      리뷰 · 찜 · 도움이 돼요(계정별) · 관리 화면 수정 → 다음 적재 때 ② 가 decisions.json 으로 가져간다
```

- **DB 에 직접 쓰지 않는다.** 카탈로그도 관리자 API 를 탄다 — 앱의 검증을 그대로 받고, 수정 이력에서 적재기와 사람이 구분된다(`X-Runshoes-Client: loader`).
- **사람 판단이 수집값보다 먼저다.** 관리 화면에서 고친 값은 다음 적재에서 되돌려지지 않는다.

#### 3. 기술 선택

| 무엇 | 선택 | 한 줄 이유 | 문서 |
|---|---|---|---|
| 화면 | React 19 · TypeScript 6 · Vite 8 · React Router 7 | 과제 요건. 상태 라이브러리 · 차트 라이브러리 없이 | `02_screens.md` |
| API | Spring Boot 3.5 · Java 21 | json-server 계약을 녹화해 그대로 재현, 그 위에 권한 · 검증 | `05_api_contract.md` |
| DB | MySQL 8 · Flyway | 추가만 하는 마이그레이션 — 옛 이미지로 롤백해도 뜬다 | `07_database.md` |
| 인증 | JWT(메모리) + refresh(HttpOnly 쿠키) | 토큰을 localStorage 에 두지 않는다 | `04_auth.md` |
| 시도 제한 · 활동 로그 | MySQL `activity_logs` | Redis 없이 — 규모에 맞게 | `04_auth.md` |
| 이미지 | 앱 + 화면 한 이미지(jlink JRE, 252MB) | 배포 단위 하나, 태그 = 커밋 | `06_deployment.md` |
| 배포 | Jenkins · BuildKit · Harbor · ArgoCD(GitOps) | Jenkins 는 Git 에 쓰고 ArgoCD 는 Git 을 읽는다 — 서로 부르지 않는다 | `06_deployment.md` |
| 클러스터 | 자체 kubeadm(VM 4) · Cloudflare Tunnel | 학교 환경에서 이주, 운영 도구는 Access 뒤 | `06_deployment.md` |
| AI | Ollama(gemma4) — 리뷰 요약 · 챗봇 | GPU 호스트를 사설망으로 바로 | `02_screens.md` |
| 카탈로그 이미지 | KicksDB(StockX · GOAT) + 실루엣 대조 | 같은 각도 · 같은 모델의 색상만 | `01b_catalog_images.md` |

#### 4. 남은 한계

- **리뷰가 시드 20켤레에만 있다.** 302켤레 중 282켤레가 리뷰 0 이라 랭킹 · 추천 동점 처리 · 비교의 평점 축이 사실상 그 20켤레의 일이다.
- **빈 칸이 많다.** 발볼 191 · 가격 154켤레가 정보 없음. 와이드는 재조사를 마쳐 4켤레만 비었다(`01a_catalog_sources.md` 1-7).
- **정기 백업이 없다.** 덤프는 스키마 변경 · 적재 전에만(`06_deployment.md` 4절).
- **옛 칸이 남아 있다.** `weight` · `drop_mm` · `stack_height` · `width` · `liked`(`07_database.md` 4절).
- **화면 시험이 자동이 아니다.** 계약 시험은 API 만 본다.
- **페이지가 없다.** 목록을 한 번에 받는다(서버는 이미 지원).

#### 다음에 할 일

| 무엇 | 내용 | 어디서 시작 |
|---|---|---|
| 리뷰 | 실사용 후기(FOLLOWUP) 화면 — 칸과 규칙은 V3 에 있다. 시드 밖 신발에 리뷰가 쌓이는 길 | `04_auth.md` 다음에 할 일 |
| 비교 | 찜한 신발 둘의 레이더 차트 + 표 — 열린 질문 넷 결정 뒤 | `08_compare.md` |
| 챗봇(RAG) | 로그인 맥락(활동 로그 — 최근 본 · 쓴 것 · 비교한 것)과 카탈로그를 읽고 답한다. 먼저 인증 프레임 | `04_auth.md` 다음에 할 일 |
| 와이드 정보 없음 4켤레 | 사용자가 직접 보고 MAN 으로 넣는다 | `01a_catalog_sources.md` 1-7 |
| 인프라 | MySQL 정기 백업 · Argo Rollouts(카나리) · 사이드카 로그 수집 · CronJob 리뷰 통계 스냅샷 | `06_deployment.md` |
| 정리 | 옛 칸 정리 마이그레이션 · 토큰 밖 색 둘 | `07_database.md` · `02b_design_system.md` |
