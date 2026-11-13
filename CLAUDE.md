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

- 코드 일은 worktree에서 커밋까지 한다. **main에 합치는 것은 FOREMAN 합치기 카드(관리자 승인, squash), push는 관리자가 따로 한다**(2026-11-13부터 — 아래 「관리자」 「합치기 카드」). 작업 세션은 main에 직접 merge하지 않는다
- 커밋 전 `git status` — 남이 고친 것은 건드리지 않고 자기 파일만 `git add`
- 인계문이 가리키는 작업 자리(worktree)와 세션이 뜬 자리가 다르면 멈추고 알린다(2026-11-12 — 원본 폴더에 뜬 세션이 다른 세션의 worktree에 들어가 일했다)
- 막히면 혼자 우회하지 말고 멈추고 알린다
- **push할 때 볼 것**:
  - 원격과 같은지(`git ls-remote origin refs/heads/main`)를 push 전에 따로 먼저 본다
  - 바뀐 파일이 문서뿐인지(빌드를 건너뛰는지)
  - **바뀐 파일에 `backend/src/main/resources/db/migration/V*.sql`이 들었는지 먼저 보고 사람에게 알린다.** Flyway가 파드가 뜰 때 적용하므로(`spring.flyway.enabled: true`) 자동 Sync에서는 그 push가 곧 운영 DB 스키마 변경이다. **이미지 태그를 되돌려도 스키마는 돌아오지 않는다.** 마이그레이션 push에 따로 승인 단계는 두지 않는다(push가 이미 관리자를 거쳐 사람이 하는 일이라, 사용자 결정). 스키마를 바꾸는 배포 순서(자동 Sync 끄기 → push → 덤프 → Sync)는 `docs/06_deployment.md` 1-7과 infra `apps/runshoes/runbooks/`에 있다
  - push 뒤 FOREMAN 빌드 알림이 오는지. 「push했는데 빌드 없음」이면 Jenkins를 확인한다
  - **이력을 다시 쓰는 force push**: Jenkins는 직전 성공 커밋과 새 HEAD의 차이로 건너뜀을 정한다(`Jenkinsfile` 「태그」). 직전 성공 커밋이 원격에서 사라지면 못 찾아 **전체 빌드 → 태그 커밋 → 자동 Sync → 파드 롤링**이 된다. 옛 끝을 원격 태그로 먼저 남기면 찾을 수 있어 차이만 본다 — 2026-11-12 `archive/main-before-reword-20261112` 덕에 #119가 건너뜀이었다(계획한 것이 아니라 운이었다). 운영 이미지 태그 해시(`4f57bc0e1537`)도 새 이력에서 사라진다 — 트리가 같은 새 커밋(`b74102b`)으로 찾고, 옛 해시는 그 태그 아래에 있다. 태그 · 백업 참조를 지울지는 300 브랜치를 합친 뒤 정한다(사용자)
- **배포 되돌리기는 `docs/06_deployment.md` 1-7대로** — 인프라 저장소의 태그 커밋(`runshoes: 이미지 태그 …`)을 `git revert` → push → Sync(자동 Sync라 push가 곧 Sync). 인프라 관리자에게 부탁한다(사용자 2026-11-12). **스키마는 돌아오지 않는다** — 옛 이미지가 새 스키마에서 뜬다. 데이터가 잘못되면 덤프 복원(각 런북 「실패했을 때」)
  - 2026-11-12 읽기로 확인: `apps/runshoes/app.yaml` 자동 Sync(prune · selfHeal 끔), 06이 적은 런북 9개 모두 있음(지금은 `reviews-1500.md`까지 10개), 태그 커밋 revert는 런북(`admin-demo-v6-v9.md` R2 · R3)에 실패 대비로만 있고 **실제로 해 본 적은 없다**(인프라 이력에 revert 커밋 0)
  - 되돌린 뒤 다음 앱 push의 Jenkins 태그 커밋이 newTag를 다시 덮는다(`Jenkinsfile` 「매니페스트 태그」) — 그때까지 무엇을 고칠지는 정해지지 않음

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
- **합치기 카드**(2026-11-13 켬, 사용자 결정 — FOREMAN 9fa7831):
  - 작업 세션 worktree에 main보다 앞선 커밋이 있고 커밋 안 한 변경이 없으면 FOREMAN이 카드를 띄운다(커밋 · 바뀐 파일 · 충돌 여부). 승인자는 이 저장소 관리자다 — 커밋 · 바뀐 파일 · 시험(평가 결과)을 보고 정한다. 판단이 안 서면 사람에게 묻는다
  - 합치기 `POST /api/sessions/<sid>/merge-prep` `{"action":"merge"}`(프로젝트 토큰이면 by는 저절로 manager), 미루기 `{"action":"skip"}`(새 커밋이 생기면 다시 뜬다), 다 고른 합친 카드 `{"action":"docs_done"}`. 카드 전부 `GET /api/merge-prep?project=runshoes`
  - **세션이 살아 있으면 승인할 때 그 세션을 끝낸다** — 같은 세션에 이어 맡길 일이 남았으면 미룬다(2026-11-13 317 — 0건 수정까지 받고 한 번에 합치려고 미뤘다)
  - squash 한 커밋. 제목은 기계가 `타입: <세션 제목> — 커밋 N개`로 만든다(타입은 원래 커밋 중 가장 무거운 것). 더 맞는 제목이 있으면 승인할 때 `"title": "…"`(위 「커밋 메시지」 꼴). 본문에 원래 커밋 날짜 · 해시 · 제목, 원래 커밋은 서버 PC의 `refs/foreman/squashed/<해시>`에만
  - **사람 승인 경로** — `backend/src/main/resources/db/migration/V*.sql` · `CLAUDE.md` · `.claude/*` · `Jenkinsfile` · `Dockerfile` · `Dockerfile.chatbot`이 든 카드는 브리지가 「사용자 답 기다림」으로 올린다. 마이그레이션이 든 push는 위 「push할 때 볼 것」 그대로
  - 카드는 **합치기까지만** — 합친 뒤 시험 · push · 정리 후보 고르기는 관리자 몫. push는 지금처럼 사용자가 말할 때
  - 「치울 것 — 빈 worktree」는 세션이 끝났고 · 앞선 커밋 0 · 커밋 안 한 변경 0일 때만 뜬다. 카드가 0장인 것은 「비었다」는 뜻이 아니다(커밋 안 한 변경이 있으면 카드를 만들지 않는다)
- 보고 중계 · 물음 중계 · 21:00 묶음(2026-11-13 켬): 작업 세션의 보고는 관리자 입력 칸으로 온다. 사람에게 올릴 것은 `POST /api/sessions/<관리자 sid>/escalate` `{"kind":"report"|"question","text":"…"}`
- 교장이 넘긴 계획(「[교장 계획 #N …]」)은 고칠 것이 없으면 `/api/foreman/start` `{"dispatch_id": N, "use_saved": true}`로 띄운다. 틀렸으면 띄우지 말고 사람에게 묻는다
- 개발 스택(docker compose `runshoes-mysql-dev`, `127.0.0.1:3307`)은 하나라 worktree 둘이 동시에 쓰면 겹칠 수 있다 — 「한 번에 한 세션」 규칙을 둘지는 **정해지지 않음**
