> 상태: 운영 중(2026-11-02 확인 — 읽기만). 이미지 `8a4d4a42508b`(앱 커밋 `8a4d4a4`) · ArgoCD `runshoes` Synced/Healthy(infra `4a54ca7`) · 자동 Sync 켜짐(`prune: false, selfHeal: false`) · Deployment replicas 1(컨테이너 2) · MySQL 8.0.46 local-path 2Gi. 원천: infra `apps/runshoes/` · `platform/` · `Jenkinsfile` · `Dockerfile` · 런북

#### 0. 한 줄 요약

push 한 번이면 배포된다 — Jenkins 가 이미지를 빌드해 Harbor 에 올리고 **인프라 리포의 태그 한 줄을 커밋**하면, ArgoCD 가 그 커밋을 읽어 클러스터를 맞춘다. Jenkins 와 ArgoCD 는 서로를 부르지 않고 Git 만 본다. **스키마를 바꾸는 배포만** 자동 Sync 를 끄고 런북대로 사람이 Sync 한다.

#### 1. 최종 설계

#### 1-1. 흐름

```
git push(GitHub Gabriel-Joo/runshoes main)
  │ ① Jenkins Job runshoes-app — 2분 폴링 → BuildKit rootless 로 이미지 2개(같은 태그 = 커밋 12자리)
  ▼
Harbor harbor.ronanlab.dev/runshoes/{runshoes, runshoes-chatbot}:<커밋12>
  │ ② Jenkins 가 ronanlab-infra apps/runshoes/kustomization.yaml 의 newTag 두 줄을 커밋 · push
  ▼
ArgoCD Application runshoes — ③ 3분 안에 감지 → 자동 Sync
  ▼
runshoes 네임스페이스 ─ Deployment runshoes(Spring :3000 + chatbot :8766) ─ StatefulSet runshoes-mysql
  ▲
방문자 ─ Cloudflare ─ 공용 터널(cloudflared ns) ─ ingress-nginx(VIP 192.168.122.240)
```

push 에서 새 Pod 까지 보통 10~15분(빌드 4~5분 + 폴링 · 감지 대기).

#### 1-2. 구성 요소

| 요소 | 위치 | 역할 |
|---|---|---|
| 앱 리포 | GitHub `Gabriel-Joo/runshoes`(public) | 프런트 `src/` · 백엔드 `backend/` · `Dockerfile` · `Dockerfile.chatbot` · `Jenkinsfile` · `contract/` · `catalog/` |
| 인프라 리포 | GitHub `Gabriel-Joo/ronanlab-infra`(private) | `apps/runshoes/`(매니페스트 · 이미지 태그 · 런북 · 스크립트), `platform/`(클러스터 공용) |
| 클러스터 | kubeadm v1.35 — `m-k8s` + `w1~w3-k8s` | GPU 호스트 위 VM 4대(사설망 192.168.122.0/24), 노드당 메모리 약 3.9GiB |
| Jenkins | `jenkins` ns, Job `runshoes-app` | Job · 자격 증명은 JCasC(`platform/jenkins/values.yaml`)가 만든다 — UI 에서 고치지 않는다 |
| Harbor | `harbor.ronanlab.dev/runshoes`(private) | robot 계정 push(`robot$runshoes+jenkins`) · pull(`robot$runshoes+pull`) 분리 |
| ArgoCD | Application `runshoes` | 읽기 전용 deploy key 로 인프라 리포를 읽는다 |
| 외부 노출 | Cloudflare Tunnel(`platform/cloudflared`) | 클러스터 공용 터널. 운영 도구(Jenkins · Harbor · ArgoCD)는 Cloudflare Access 뒤, runshoes 공개 주소는 Access 없음 |
| Ollama | GPU 호스트 `192.168.122.1:11434` | 리뷰 요약 · 챗봇. Pod 가 사설망으로 바로 부른다 |

#### 1-3. 이미지

```
web     node:20-alpine          yarn install → vite build        → dist/
server  maven:3.9-temurin-21    mvn package(단위 테스트 포함)     → app.jar
jre     eclipse-temurin:21-jdk  jlink — 필요한 모듈만             → /jre
실행    alpine                  /jre + app.jar + static/(dist), 사용자 10001, :3000
```

- 태그는 **커밋 해시 12자리**, 두 이미지가 같은 태그. `latest` 는 쓰지 않는다 — 태그만 보고 어느 커밋이 도는지 안다.
- jlink 로 JRE 를 줄여 252MB(temurin jre 그대로면 421MB). 모듈이 빠지면 실행 중 `NoClassDefFoundError` 로 드러나므로 의존성을 더하면 계약 시험을 다시 돈다.
- 에이전트 Pod 의 `buildkit` 컨테이너 하나가 두 이미지를 차례로 빌드한다. 특권 컨테이너 대신 seccomp · AppArmor 만 푼다.

#### 1-4. Jenkinsfile

세 스테이지 — 태그(`GIT_COMMIT` 앞 12자리) → 빌드 · push → 매니페스트 태그 커밋.

- `newTag` 두 줄을 sed 한 번에 바꾸고 **바뀐 줄이 정확히 2개인지 센다** — 한쪽만 바뀌는 배포를 막는다. MySQL 이미지는 `images:` 에 넣지 않는다(StatefulSet 에 고정 태그).
- 인프라 리포는 Jenkins git 단계가 아니라 `sh 'git clone'` 으로 받는다 — git 단계로 받으면 폴링이 그 리포까지 감시해 태그 push 가 빌드를 다시 부르는 루프가 된다.
- 인프라 리포 쓰기는 deploy key(만료로 배포가 조용히 멈추지 않게). 다른 프로젝트 Jenkins 도 같은 리포에 push 하므로 push 실패 시 최신 main 위에서 3번까지 다시 한다.
- 자격 증명은 `sh '''`(작은따옴표)로 셸 환경변수로만 다루고, Harbor 로그인 줄 앞에 `set +x`.

#### 1-5. 매니페스트 — infra `apps/runshoes/`

```
kustomization.yaml          리소스 목록 + 이미지 태그 2개
app/deployment.yaml         runshoes(Spring) + chatbot
app/service.yaml · ingress.yaml   / → :3000, /ws/chat → :8766
mysql/statefulset.yaml · service.yaml   MySQL 8.0.46, local-path 2Gi, w1 선호
scripts/create-secrets.sh   runshoes-mysql · harbor-pull · runshoes-auth(사람이 돌린다)
scripts/check-image-migrations.sh   Harbor 이미지 안의 Flyway 파일 sha256(배포 전 확인)
runbooks/                   스키마 변경 · 적재 런북과 실행 기록
```

- **앱** — RollingUpdate `maxSurge 1, maxUnavailable 0`: 새 Pod 가 Ready 가 된 뒤 옛 Pod 를 내린다. Ready 는 DB 까지(`/actuator/health/readiness`), startup 은 최대 2분(Flyway 첫 기동). 종료는 preStop 5초 → graceful shutdown 최대 20초.
- **비밀** — `envFrom: secretRef runshoes-auth`(`JWT_SECRET` · `SEED_USER_PASSWORD` · `ADMIN_PASSWORD`), DB 비밀번호는 `runshoes-mysql`. optional 이 아니다 — Secret 이 없으면 새 Pod 가 멈추고 옛 Pod 가 계속 돈다.
- **Namespace · Secret 은 사람이 만든다.** ArgoCD 가 Namespace 를 소유하면 Application 삭제 · prune 한 번에 Secret 까지 사라질 수 있다(`CreateNamespace=false`).
- **DB** — utf8mb4 · `utf8mb4_unicode_ci` · `default-time-zone=+00:00`. 데이터베이스와 계정은 이미지가 첫 기동에 만들고, 스키마는 앱의 Flyway 가 만든다(`07_database.md`). PVC 는 Retain.
- 리소스(요청/상한): runshoes 200m · 512Mi/1Gi, chatbot 10m · 48Mi/256Mi, MySQL 200m · 512Mi/1Gi. namespace quota 는 없고 노드 메모리가 상한이다.

#### 1-6. ArgoCD Application — infra `platform/argocd/applications/runshoes.yaml`

- **자동 Sync**(`automated: {prune: false, selfHeal: false}`). selfHeal 을 끈 것은 복구 중 손으로 바꾼 것(예: replicas 0)을 되돌리지 않게.
- **prune 없음** — git 에서 지운 리소스는 남는다(PVC 를 실수로 지우지 않게). **finalizer 없음** — Application 을 지워도 앱 · DB · PVC 는 남는다.
- Application 객체는 사람이 `kubectl apply` 로 넣는다 — git push 만으로는 바뀌지 않는다. 자동 Sync 를 끄고 켜는 것도 사람이 한다.

#### 1-7. 스키마를 바꾸는 배포

새 마이그레이션이 든 이미지는 **Sync 가 곧 마이그레이션 적용**이다. 그래서 자동 Sync 를 끄고 그 사이에 덤프를 뜬다.

| # | 일 | 누가 |
|---|---|---|
| 1 | 자동 Sync 끄기(`automated` 없음을 확인) | 사람 |
| 2 | 앱 커밋 · push → Jenkins → newTag 커밋(운영은 아직 옛 이미지) | Claude |
| 3 | `mysqldump --single-transaction` → 로컬 MySQL 에 다른 이름으로 복원해 행 수 · 지문 대조(덤프는 `~/k8s-cluster/backup/<날짜>-runshoes-…/`, 권한 600, git 밖) | Claude |
| 4 | Sync = 마이그레이션 적용. Pod 로그 `Migrating … → Successfully applied` · 공개 200 · 행 수 | 사람 |
| 5 | 자동 Sync 다시 켜기 | 사람 |
| 6 | 필요하면 운영 적재(`scripts/load-prod.sh --apply`, `01c_catalog_loader.md`) | Claude, 사용자 승인 뒤 |

- 런북은 마이그레이션마다 하나씩 infra `apps/runshoes/runbooks/` 에 있다: `auth-v3.md` · `catalog-v4-v5.md` · `admin-demo-v6-v9.md` · `v10-auto-increment.md` · `v11-admin-history.md` · `v12-wide-scope.md`. 각 런북 끝에 실행 기록(시각 UTC)을 남긴다.
- 운영 MySQL `exec` 와 Secret 읽기가 필요한 단계는 사람이 친다(2026-10-29 사용자). 운영 적재만은 `scripts/load-prod.sh` 안에서 Secret 을 읽는다(비밀번호는 스크립트 밖으로 나오지 않는다).
- **되돌리기** — 인프라 리포의 태그 커밋을 `git revert` → push → Sync. 스키마는 되돌아가지 않는다 — 마이그레이션은 추가만 하므로 옛 이미지가 새 스키마에서 뜬다(`07_database.md` 1-5). 데이터가 잘못되면 덤프 복원(런북 "실패했을 때").

#### 1-8. 로컬

```bash
docker compose up -d                       # MySQL 127.0.0.1:3307(3306 은 다른 프로젝트)
# 백엔드 빌드 — 호스트에 JDK 가 없어 maven 컨테이너로(backend/README.md)
contract/run-spring-local.sh v6            # DB 를 비우고 V1~ 부터 → :3200 에 띄워 녹화 · 비교
```

- 운영 Pod 에 직접 붙을 때는 MetalLB VIP 로 간다: `http://192.168.122.240` + `Host: runshoes.ronanlab.dev`. Cloudflare 를 거치면 헤더가 바뀐다.

#### 2. 왜 이렇게 했나

- **Pull 형(GitOps).** Jenkins 가 `kubectl set image` 로 밀어 넣으면 Jenkins 가 클러스터 권한을 들고 있어야 하고(뚫리면 클러스터도), "지금 무엇이 배포됐나"를 알려면 kubectl 을 쳐야 한다. Jenkins 는 Git 에 커밋만 하고 ArgoCD 가 Git 을 읽게 하면 — 자격 증명이 줄고, 배포된 것의 답이 늘 Git 에 있고, 롤백이 `git revert` 다.
- **ArgoCD 는 레지스트리를 보지 않는다.** 새 이미지가 Harbor 에 올라와도 Git 에 태그가 적히기 전에는 배포되지 않는다 — 태그 커밋 한 줄이 Harbor 와 ArgoCD 를 잇는 유일한 다리다.
- **앱 리포와 인프라 리포를 나눴다.** 같은 매니페스트가 두 곳에 있으면 "어느 쪽이 진짜냐"가 생긴다. 인프라 리포 하나로 클러스터 전체가 보이고, 태그 커밋이 앱 리포의 빌드를 다시 부르지 않는다.
- **webhook 대신 2분 폴링.** Jenkins 가 Cloudflare Access 뒤에 있어 GitHub 이 들어올 수 없다 — 운영 도구는 인터넷에 열지 않는다.
- **스키마 변경 때만 사람이 Sync 한다.** 자동 Sync 는 태그 커밋을 3분 안에 배포해 "덤프 → Sync" 순서를 깬다. 평소 배포는 자동이 낫고, 되돌릴 수 없는 순간(MySQL DDL 은 트랜잭션이 아니다)에만 사람이 문을 연다.
- **DB 는 runshoes 네임스페이스의 자기 StatefulSet(2026-10-21).** 같은 클러스터의 펫퍼민트 MySQL 에 데이터베이스만 더하면 메모리는 거의 들지 않지만, 펫퍼민트의 초기화 Job · Secret 을 고쳐야 하고 롤백 · 실험을 같이 산다. 메모리 512Mi 를 더 쓰고 격리를 골랐다 — StatefulSet 을 직접 운영해 보는 것도 학습 목표였다. 설정 값은 펫퍼민트 MySQL 과 맞췄다.

#### 3. 시도했던 것들

- **웹 터미널 수동 배포(2026-07~09).** React + json-server 를 학교 웹 터미널에 손으로 올렸다. 옛 절차는 `archive/DEPLOY.md`.
- **학교 vcluster GitOps(2026-09 → 10-18).** 학교 RKE2 위 vcluster 에 GitLab · Jenkins/kaniko · std-harbor · ArgoCD(auto + prune + selfHeal)로 처음 GitOps 를 했다. 교내망에서만 닿아 집에서 손댈 수 없었다. 2026-10-18 자체 kubeadm 클러스터로 옮기며 GitHub 하나 · BuildKit rootless · 자체 Harbor · 커밋 해시 태그(전에는 `BUILD_NUMBER` + `latest`) · prune · selfHeal 끔으로 바꿨다 — 같은 클러스터에 먼저 올라간 펫퍼민트의 패턴이다.
- **Pod 에서 Ollama 로 가는 길(2026-09 → 10-18).** 학교 vcluster 의 Pod 는 오버레이 네트워크 안이라 같은 사설 IP 대역의 GPU 서버로 경로가 없었다(요청이 늘 타임아웃 — 방화벽이 아니라 구조의 제약). 클러스터 안에 Ollama 를 띄우는 것은 컨테이너 상한 2Gi 에서 8B 모델이 돌지 않아 기각했다. GPU 서버의 Ollama 를 Cloudflare 터널 + Access(Service Token 헤더, Secret 으로 주입)로 공개 HTTPS 에 내고 Pod 의 egress 로 불렀다 — Gemini API 로 바꾸는 안은 보류했다. 자체 클러스터로 옮긴 뒤로는 노드가 GPU 호스트 위 VM 이라 같은 사설망에 있어 `http://192.168.122.1:11434` 로 바로 부른다(터널 · Service Token 불필요).
- **공용 터널 무중단 이전(2026-10-18).** 클러스터 공용 터널이 다른 프로젝트 네임스페이스에 손으로 apply 돼 있었고 git 에 없었다. 끊기면 ArgoCD · Jenkins 도 끊기는 변경이라 되돌리기 4단을 먼저 만들고, 같은 터널에 커넥터를 더 띄워(2 → 4) 확인한 뒤 옛것을 지웠다. 공개 주소 4개를 1초마다 1,360회 — 실패 0.
- **Spring 전환(2026-10-21 01:39 KST).** MySQL 을 먼저 선택 Sync 로 띄우고, 앱 이미지와 Deployment 변경은 Sync 한 번에 내보냈다 — 새 이미지가 DB 설정 없이 뜨는 창이 없게. 공개 `/api/terms` 를 1초마다 90회 — 실패 0, 롤링 겹침 2초 동안 Node 와 Spring 이 번갈아 응답했다. 되돌리기 길(Node 이미지 + PVC 의 db.json)은 V3 적용 뒤 데이터와 맞지 않아 같은 날 닫았다.
- **자동 Sync 를 켰다(2026-10-21) → 스키마 변경 때마다 끈다.** 처음에는 수동 Sync 였다. 자동으로 바꾼 뒤 V3 런북에 "자동 Sync 는 이 순서를 깬다"를 적었고, V4 · V5(10-29) · V6~V9(10-30) · V10 · V11(11-01) · V12(11-02) 모두 끄고 켰다. V6~V9 는 자동 Sync 를 두 번 끄고 켜지 않으려고 한 번에 배포했다(2026-10-30 사용자).
- **롤링 겹침이 PK 충돌을 냈다(2026-11-01).** `maxSurge 1` 이라 배포 중 Pod 가 둘인 순간이 있다. 앱이 JVM 안의 잠금으로 매기던 `max + 1` id 가 두 Pod 에서 같아져 충돌했다 — V10 에서 AUTO_INCREMENT 로 고쳤다(`07_database.md` 3절). "Pod 는 하나"라는 가정이 롤링 배포에서는 성립하지 않는다.
- **상태를 추정으로 보고했다가 고쳤다.** 자동 Sync · 배포 상태를 확인하지 않고 말한 적이 있어, 이후 매번 `syncPolicy` · 이미지 태그 · Pod 로그를 읽고 보고한다(사용자 — "확인 안 하고 꺼져 있다고 하지 마라").

#### 4. 남은 한계

- **정기 백업이 없다.** 덤프는 스키마 변경 · 적재 전에만 뜬다. 그 사이의 리뷰 · 관리 화면 수정은 백업이 없다.
- **DB 가 노드 하나에 묶인다.** local-path PV 라 w1 에 묶이고, w1 이 멈추면 DB 와 앱 Ready 가 함께 빠진다. 다른 프로젝트의 MySQL 도 w1 에 있다 — 노드가 3대라 감수한다.
- **앱은 replicas 1 이다.** 롤링 배포 중에만 둘이 된다. 노드 장애 때 Pod 를 다시 띄우는 동안 끊긴다.
- **배포가 느리다.** 폴링 2분 + 빌드 4~5분 + 감지 3분 — push 에서 반영까지 10~15분.
- **스키마 변경 배포는 사람이 세 번 손댄다**(자동 Sync 끄기 · Sync · 켜기). 빼먹으면 Jenkins 태그 커밋이 덤프 전에 배포된다 — 런북의 1단계 확인(`automated` 없음)이 유일한 장치다.
- **노드 메모리를 다른 프로젝트와 나눈다.** 빌드 Pod 는 상한 3Gi 라 다른 빌드와 겹치면 기다린다.

#### 5. 검증 항목

- 배포 뒤: `kubectl -n runshoes get deploy runshoes -o wide`(이미지 태그 = 커밋 12자리) · ArgoCD `sync.status` · `health.status` · `sync.revision`(= infra 태그 커밋).
- 스키마 변경 뒤: Pod 로그 `Migrating … → Successfully applied 1 migration … vN`, 공개 API 200, 행 수(신발 302 · 리뷰 104), 자동 Sync 다시 켜짐(`syncPolicy.automated`).
- 배포 전: `scripts/check-image-migrations.sh` — Harbor 이미지 안의 마이그레이션 파일이 git 과 같은지(sha256).
- 보고 전에는 위를 **읽어서 확인**한다 — 추정으로 말하지 않는다.

#### 다음에 할 일

- 정기 백업(MySQL 덤프 CronJob, 저장소 밖 보관).
