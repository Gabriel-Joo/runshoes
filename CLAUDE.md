**답변은 항상 한국어로 한다. 코드·명령어·경로·로그는 원문 그대로 둔다.**

# RUNSHOES — 이 프로젝트에서만 쓰는 규칙

## 알림(텔레그램)

텔레그램 알림은 FOREMAN 브리지가 턴이 끝날 때 보낸다(Stop hook, 접두어 `[런슈즈]`, 2026-11-02부터). 이 세션에서 직접 보내지 않는다 — `scripts/notify-telegram.sh`는 지웠다.
규칙은 `~/AI_programming/foreman/config/notify.toml`.

## 서브에이전트 모델

서브에이전트 기본 모델은 sonnet이다(`.claude/settings.json`의 `CLAUDE_CODE_SUBAGENT_MODEL`, 2026-11-09). 이 변수는 기본 제공 Explore에는 듣지 않아, 같은 이름의 `.claude/agents/Explore.md`(`model: sonnet`, 읽기 전용)로 덮어썼다(2026-11-09).
판단이 결과를 좌우하는 일 — 데이터 검증 · 판정, 여러 파일에 걸친 설계 변경, 코드 리뷰 — 은 서브에이전트를 부를 때 `model: "opus"`를 준다. 파일 찾기 · 목록 만들기 · 형식 바꾸기 같은 기계적인 일은 기본(sonnet) 그대로 둔다.

## 운영 DB · 클러스터

Claude는 운영 DB에 직접 접근하지 않는다 — `kubectl exec … mysql` 금지(2026-11-10 사용자). 숫자는 공개 API로 세고, DB에서만 보이는 것이 필요하면 사용자에게 말한다. 운영 DB · 클러스터에 쓰는 명령은 사람이 친다.

## 다른 저장소

다른 저장소(펫퍼민트 · ronanlab-infra · FOREMAN)의 문서 · 설정은 그 저장소를 맡은 세션에 넘긴다 — 한 줄짜리라도 이 세션이 직접 고치거나 커밋하지 않는다(2026-11-11 사용자). 사용자가 이 세션에 명시적으로 맡긴 일(예: 2026-11-11 펫퍼민트 코드 합치기)만 예외다.

## 이 저장소가 무엇인가

2026-11-12 관리자 규칙으로 더함. 모르는 것은 「정해지지 않음」으로 둔다 — 지어내지 않는다.

- 원격 `https://github.com/Gabriel-Joo/runshoes.git`. 웹(React · Vite, `src/`) · `backend/`(Spring Boot, 스키마는 Flyway — `db/migration/V*.sql`) · 챗봇(Python `chatbot_server.py`, `Dockerfile.chatbot`)
- **push가 하는 일**: `main` push → GitHub 웹훅(안전망 폴링 15분) → Jenkins `runshoes-app`이 이미지 둘(`runshoes` · `runshoes-chatbot`, 태그 = 커밋 해시 12자리)을 Harbor로 → **ronanlab-infra** `apps/runshoes/kustomization.yaml`에 태그 커밋 → ArgoCD 자동 Sync. 빌드를 거쳐 몇 분 걸리고 중간에 실패할 자리가 많다(`Jenkinsfile` · `docs/06_deployment.md`)
- **Jenkins는 이 저장소에 커밋하지 않는다** — 태그 커밋은 인프라 저장소로 간다. 그래서 이 저장소에는 기계가 쓰는 커밋이 없다
- **문서만 바뀐 push**(바뀐 파일이 모두 `docs/` · `portfolio/` · `config/portfolio.toml` · `*.md`)는 빌드는 돌지만 이미지 · 태그를 건너뛴다(`Jenkinsfile` 머리 주석). 손으로 누른 빌드, 직전 성공 커밋을 못 찾을 때는 늘 빌드한다
- **클러스터 일(Sync · 자동 Sync 스위치 · 되돌리기 · kubectl)은 이 저장소 일이 아니다** — 인프라 관리자에게 부탁한다

## 일하는 방식

- 코드 일은 worktree에서 커밋까지 한다. **push는 관리자가 한다**
- 커밋 전 `git status` — 남이 고친 것은 건드리지 않고 자기 파일만 `git add`
- 인계문이 가리키는 작업 자리(worktree)와 세션이 뜬 자리가 다르면 멈추고 알린다(2026-11-12 — 원본 폴더에 뜬 세션이 다른 세션의 worktree에 들어가 일했다)
- 막히면 혼자 우회하지 말고 멈추고 알린다
- **push할 때 볼 것**:
  - 원격과 같은지(`git ls-remote origin refs/heads/main`)를 push 전에 따로 먼저 본다
  - 바뀐 파일이 문서뿐인지(빌드를 건너뛰는지)
  - **바뀐 파일에 `backend/src/main/resources/db/migration/V*.sql`이 들었는지 먼저 보고 사람에게 알린다.** Flyway가 파드가 뜰 때 적용하므로(`spring.flyway.enabled: true`) 자동 Sync에서는 그 push가 곧 운영 DB 스키마 변경이다. **이미지 태그를 되돌려도 스키마는 돌아오지 않는다.** 마이그레이션 push에 따로 승인 단계는 두지 않는다(push가 이미 관리자를 거쳐 사람이 하는 일이라, 사용자 결정). 스키마를 바꾸는 배포 순서(자동 Sync 끄기 → push → 덤프 → Sync)는 `docs/06_deployment.md` 1-7과 infra `apps/runshoes/runbooks/`에 있다
  - push 뒤 FOREMAN 빌드 알림이 오는지. 「push했는데 빌드 없음」이면 Jenkins를 확인한다
- **배포 되돌리기 방법(런슈즈 revert 뒤 다시 빌드 / 인프라 태그 커밋 되돌리기)은 정해지지 않음.** `docs/06_deployment.md` 1-7은 인프라 태그 커밋 revert를 적고 있다

## 사람 승인이 필요한 것

하지 않고 사용자에게 묻는다:
- 운영 DB 쓰기(위 「운영 DB · 클러스터」)
- 배포 되돌리기
- `sudo`가 필요한 호스트 명령 — 직접 치지 않고 사용자에게 한 줄로 알린다

마이그레이션이 든 push는 여기가 아니라 위 「push할 때 볼 것」이다.

## 비밀값

- 토큰 · DB 암호 · 자격 증명을 화면 · 로그 · 커밋에 내지 않는다. 비밀값이 든 파일은 Edit · Write로 고치지 않는다
- 값이 있는지는 개수로만 센다 — `/usr/bin/grep -c`. 셸의 `grep`은 CC 실행 파일에 기대는 함수라 CC가 스스로 업데이트하는 순간 실패한다(개수 0이 못 센 것일 수 있다)
- Jenkins 자격 증명 `harbor-robot-runshoes-jenkins` · 클러스터 Secret `runshoes-mysql`은 사람이 다룬다
- 개발 DB 암호는 `docker-compose.yml`의 로컬 전용 값이다(운영과 다르다)

## 문서 자리

- `docs/README.md`(문서 표) · `docs/TODO.md`(남은 일) · `docs/HISTORY.md`(한 일) · `docs/archive/`(지난 설계 · 계획)
- docs push는 Notion 「RUNSHOES」 기술문서에 나간다 — FOREMAN 자동 맞추기가 `origin/main` 기준이라 push한 것만, 30분 뒤 나간다

## 커밋 메시지

꼴: `타입: 설명`. 타입은 feat · fix · docs · refactor · perf · test · ops · build · ci · chore · revert, 그리고 지금 쓰는 style(뜻은 `~/ronanlab-infra/CLAUDE.md` 6절 표).

- 설명은 한글로, 한 줄 50자 안, 마침표 없이. 더 쓸 말은 한 줄 비우고 본문에 까닭을
- 범위(`타입(범위):`)는 origin/main 292개 중 94개가 쓰고 있다 — 계속 쓸지는 **정해지지 않음**
- 표준이 아닌 타입(catalog · backend · log · debug 등)과 꼴 밖 메시지가 이미 있다 — 고치는 일은 따로 맡긴다(지금은 하지 않는다)

## 공통 규칙

- 파일은 Edit · Write로 고친다 — `sed -i` · `perl -i` · heredoc 덧붙이기(`cat >> f <<EOF`) · `tee`를 저장소 파일을 고치는 데 쓰지 않는다. 읽기만 하는 것(`sed -n` · `grep` 등)은 괜찮다. 임시 파일은 세션 스크래치에

## 관리자

- 이 저장소 관리자는 원본 폴더 `~/AI_programming/runshoes`의 `main`에서 도는 역할 manager 세션 하나다
- FOREMAN API는 이 프로젝트 토큰으로만 부른다: `T=$(/usr/bin/grep -E '^FOREMAN_TOKEN_RUNSHOES=' ~/AI_programming/foreman/.env.project_tokens | cut -d= -f2-)` — 셸 변수로만 쓰고 `-H "Authorization: Bearer $T"`로 싣는다. 이 토큰은 런슈즈 세션 · 방 · 게시 API만 연다(다른 프로젝트는 403)
- 다른 프로젝트에 부탁: `POST http://127.0.0.1:8000/api/managers/<프로젝트>/ask` `{"text": "…"}`. 관리자가 없으면 사람에게 텔레그램으로 간다. 클러스터 일은 인프라(`ronanlab-infra`)에 부탁한다
- 교장이 넘긴 계획(「[교장 계획 #N …]」)은 고칠 것이 없으면 `/api/foreman/start` `{"dispatch_id": N, "use_saved": true}`로 띄운다. 틀렸으면 띄우지 말고 사람에게 묻는다
- 개발 스택(docker compose `runshoes-mysql-dev`, `127.0.0.1:3307`)은 하나라 worktree 둘이 동시에 쓰면 겹칠 수 있다 — 「한 번에 한 세션」 규칙을 둘지는 **정해지지 않음**
