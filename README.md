# RUNSHOES

> **러닝화, 제대로 읽기**
> 스펙은 빠짐없이, 용어는 설명과 함께

React · TypeScript 화면과 Spring Boot · MySQL API 로 만든 러닝화 리뷰 아카이브를
자체 Kubernetes 클러스터에 GitOps CI/CD 로 배포한 프로젝트

**🔗 Live Demo — https://runshoes.ronanlab.dev** (자체 kubeadm 클러스터 · Cloudflare Tunnel) — 로그인 화면의 체험 계정으로 가입 없이 둘러볼 수 있다(일반 회원 · 읽기 전용 관리자)

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

---

## 무엇인가

기존 러닝화 정보는 상급자 기준으로 쓰여 있다. 드롭 · 스택하이트 같은 말이 설명 없이 나열되고, 사이트마다 값이 다르며 출처가 없다.
RUNSHOES 는 **정보를 덜어내지 않고, 모르는 말과 근거 없는 값을 없앤다.**

| | |
|---|---|
| **용어 툴팁** | 스펙마다 용어 설명 — 초보와 상급자가 같은 페이지를 본다 |
| **출처가 있는 카탈로그** | 302켤레, 칸마다 어디서 읽었는지(리뷰 사이트 · 공식몰 · 웹 문서 · 직접 확인). 근거가 없으면 추측하지 않고 **"정보 없음"** |
| **발볼 · 와이드** | 한국 러너에게 중요한 토박스 너비와 와이드 모델(있음 · 국외에만 · 없음 · 정보 없음) |
| **맞춤 추천 · 랭킹** | 5문항 점수제 추천, 신뢰도 가중 평점으로 매긴 "러너들의 선택" |
| **리뷰 AI 요약 · 챗봇** | 리뷰 3개 이상이면 Ollama 가 좋았던 점 · 아쉬운 점을 요약. GPU 서버를 프로덕션에서 바로 부른다 |

쇼핑몰이 아니다 — 구매 버튼도, 할인 배지도 없다. 가격은 발매가만, 읽은 곳 · 날과 함께 보인다.

## 구조

```
git push ─ Jenkins(BuildKit) ─ Harbor ─ ronanlab-infra 태그 커밋 ─ ArgoCD ─▶ Pod
                                                                            ├ runshoes  Spring Boot :3000 (React 빌드물 + /api)  ─▶ MySQL 8 (Flyway V1~V13)
                                                                            └ chatbot   Python WebSocket :8766                    ─▶ Ollama (GPU 호스트)
카탈로그(catalog/) ─ 사람 판단(decisions.json) ─ 적재기 ─▶ 관리자 API
```

- **백엔드를 바꿔 끼웠다.** 과제 요건은 json-server 였다. 돌던 API 의 응답을 녹화해 정답으로 삼고, 같은 계약을 Spring Boot + MySQL 로 재현했다 — 화면은 한 줄도 바꾸지 않고, 운영 전환 끊김 0.
- **GitOps.** Jenkins 는 Git 에 태그를 쓰고 ArgoCD 는 Git 을 읽는다 — 서로를 부르지 않는다. 스키마를 바꾸는 배포만 자동 Sync 를 끄고 런북대로.
- **마이그레이션은 추가만.** 옛 이미지로 롤백해도 뜬다.
- **권한과 숫자는 서버가.** 쓰기 권한 · 평점 · 찜 수 · 작성자는 서버가 정한다. 토큰은 메모리, refresh 는 HttpOnly 쿠키.

## 문서

설계 문서는 [`docs/`](docs/README.md) 에 있다 — 코드에서 거꾸로 쓰고, 다르면 코드가 맞다.

| 문서 | 내용 |
|---|---|
| [요건](docs/requirements.md) · [전체 구조](docs/overview.md) · [타임라인](docs/HISTORY.md) | 무엇을 · 어떻게 · 언제 |
| [01a 신발 데이터](docs/01a_catalog_sources.md) · [01b 이미지](docs/01b_catalog_images.md) · [01c 적재기](docs/01c_catalog_loader.md) | 카탈로그 — 수집처 · 약관 · 판단 규칙 · 실루엣 대조 · 사람 판단 |
| [02 화면](docs/02_screens.md) · [02b 디자인](docs/02b_design_system.md) | 화면 구성 · 표본 전시실 컨셉 |
| [03 관리 화면](docs/03_admin.md) · [04 로그인 · 계정](docs/04_auth.md) | 출처 · 숨김 · 수정 이력 / JWT · 체험 계정 · 시도 제한 |
| [05 API 계약](docs/05_api_contract.md) · [06 배포](docs/06_deployment.md) · [07 DB](docs/07_database.md) | 계약 시험 · GitOps · 스키마 V1~V13 |
| [08 비교](docs/08_compare.md) | 점수 없는 비교표(2~5켤레) · 자동 채우기 · 분포 그래프 — 운영 반영(2026-11-09) |
| [backend/README.md](backend/README.md) · [contract/README.md](contract/README.md) | 백엔드 개발 · 계약 시험 실행 |

## 실행하기

```bash
git clone https://github.com/Gabriel-Joo/runshoes.git && cd runshoes
yarn

docker compose up -d            # MySQL 8   127.0.0.1:3307
# 백엔드 — backend/README.md (Maven, Java 21). 첫 기동에 Flyway 가 스키마 · 시드를 넣는다
#   API  http://localhost:3000 — env JWT_SECRET(32바이트 이상)이 있어야 뜬다. 시드 계정 비밀번호는 SEED_USER_PASSWORD · ADMIN_PASSWORD
yarn dev                        # Vite      http://localhost:5173 (/api 는 vite 프록시로 :3000)
python chatbot_server.py        # (선택) 챗봇 ws://localhost:8766
```

- 개발 중에도 같은 출처의 `/api` 를 부르고 Vite 가 `:3000` 으로 넘긴다 — refresh 쿠키(`Path=/api/auth`)가 운영과 같게 붙는다.
- 이미지: `docker build -t runshoes .`(Vite → Maven → jlink JRE → alpine, 252MB). 실행 env 는 `backend/README.md`.
- 계약 시험: `contract/run-spring-local.sh v6`(로컬 DB 를 지우고 V1 부터 올려 녹화 · 비교).
- 빈 DB 로: `docker compose down -v && docker compose up -d`.

## 저장소

```
runshoes/
├─ src/          React 화면 — pages · components · auth(메모리 토큰 · refresh)
├─ backend/      Spring Boot — api · auth · activity · summary · config, db/migration(Flyway V1~V13)
├─ catalog/      카탈로그 — candidates.csv · 수집기 · decisions.json(사람 판단) · build.mjs · load.mjs
├─ contract/     API 계약 녹화본 · 녹화 · 비교 도구
├─ scripts/      운영 적재(load-prod.sh) · 시드 생성 · 화면 점검(screen-shot.mjs)
├─ docs/         설계 문서(위 표) · archive/(옛 계획서 — 지우지 않고 남긴다)
├─ chatbot_server.py · Dockerfile · Dockerfile.chatbot · Jenkinsfile · docker-compose.yml
└─ db.json · server.cjs   json-server 시절의 시드 · API — 계약 기준선을 다시 뜨는 용도(운영 이미지에는 없다)
```

배포 명세(매니페스트 · 이미지 태그 · 런북)는 인프라 리포 `Gabriel-Joo/ronanlab-infra`(private) `apps/runshoes/` 에 있다.

## 다음에 할 일

리뷰(실사용 후기 화면) · 챗봇(로그인 맥락을 읽는 RAG) · MySQL 정기 백업 · Argo Rollouts — 자세한 것은 [TODO](docs/TODO.md).

## 데이터

- 스펙: 브랜드 공식 자료 · 러닝 리뷰 사이트(실측) · 국내 공식몰 · ABC마트 — 칸마다 출처를 남긴다([01a](docs/01a_catalog_sources.md))
- 이미지: StockX · GOAT(KicksDB) 제품컷([01b](docs/01b_catalog_images.md))
- 리뷰: 시드 데이터(실제 사용자 리뷰가 아니다)와 가입자가 쓴 리뷰
