# RUNSHOES — 인프라 · CI/CD

> **push 한 번으로 빌드부터 배포까지**
> BuildKit으로 빌드하고, Harbor에 올리고, GitOps로 배포한다

RUNSHOES(React + Spring Boot + MySQL)를 자체 쿠버네티스 클러스터에 배포하는 구성과 CI/CD 파이프라인.
애플리케이션은 [README](../README.md), API 계약은 [API_CONTRACT.md](API_CONTRACT.md), 이 구성에 이르기까지의 이주 · 전환 기록은 [HISTORY.md](HISTORY.md).

---

## 1. 한눈에 보기

```
개발자                Jenkins (jenkins ns)            Harbor (harbor.ronanlab.dev)
  │ git push            │                                 │
  ├── GitHub main ─────▶│ ① 2분 폴링 → BuildKit 빌드 ×2 ──▶│ runshoes:<커밋12>          (Spring Boot + React)
  │                     │                                 │ runshoes-chatbot:<커밋12>  (파이썬 웹소켓)
  │                     │ ② ronanlab-infra 태그 커밋        │
  │                     ▼                                 │
  │            ronanlab-infra (GitHub, private)           │
  │            apps/runshoes/kustomization.yaml           │
  │                     │                                 │
  │                     │ ③ 감지 → Sync(사람)               │
  │                     ▼                                 │
  │                  ArgoCD ──────────────────────────────┤ 이미지 pull (harbor-pull)
  │                     │
  │                     ▼
  │            runshoes 네임스페이스
  │            ├ Deployment runshoes          Pod = runshoes(Spring :3000) + chatbot(:8766)
  │            └ StatefulSet runshoes-mysql   MySQL 8 (local-path PVC)
  │                     ▲
  └── 방문자 ── Cloudflare ── 공용 터널(cloudflared ns) ── ingress-nginx
```

핵심은 **Jenkins와 ArgoCD가 서로를 직접 호출하지 않는다**는 점이다.
둘 다 Git만 바라본다. Jenkins는 Git에 "새 태그"를 **쓰고**,
ArgoCD는 Git을 **읽어** 클러스터를 맞춘다. Git이 유일한 접점이다.

---

## 2. 구성 요소

| 요소 | 위치 | 역할 |
| --- | --- | --- |
| **앱 레포** | GitHub `Gabriel-Joo/runshoes` (public) | 프런트(`src/`) · 백엔드(`backend/`) · Dockerfile 2개 · Jenkinsfile · 계약(`contract/`) |
| **인프라 레포** | GitHub `Gabriel-Joo/ronanlab-infra` (private) `apps/runshoes/` | 배포 명세(매니페스트 · 이미지 태그). 클러스터 공용 구성(`platform/`)도 여기 |
| **클러스터** | kubeadm v1.35, `m-k8s`(control-plane) + `w1~w3-k8s` | GPU 호스트 위 VM 4대(Vagrant · libvirt, 사설망 192.168.122.0/24), 노드당 메모리 약 3.9GiB |
| **Jenkins** | `jenkins.ronanlab.dev` · `jenkins` 네임스페이스 | Job `runshoes-app` — 폴링 · BuildKit 빌드 · 태그 커밋. Job은 JCasC가 만든다 |
| **BuildKit** | 빌드 때 에이전트 Pod 안 컨테이너(rootless) | 도커 데몬 없이 이미지 빌드 |
| **Harbor** | `harbor.ronanlab.dev/runshoes` (private) | 이미지 레지스트리 |
| **ArgoCD** | `argocd.ronanlab.dev` · Application `runshoes` | Git → 클러스터 동기화(수동 Sync) |
| **MySQL** | `runshoes-mysql` StatefulSet(8.0.46) · local-path 2Gi | 데이터. 스키마 · 시드는 앱이 Flyway로 |
| **외부 노출** | Cloudflare Tunnel — `cloudflared` 네임스페이스(ronanlab-infra `platform/cloudflared`) | 클러스터 공용 터널. runshoes · petmint · argocd · harbor · jenkins 공개 주소 전부 |
| **Ollama** | GPU 호스트 `192.168.122.1:11434` | 리뷰 요약 · 챗봇. Pod가 VM 사설망으로 바로 부른다 |

Jenkins · Harbor · ArgoCD는 Cloudflare Access 뒤에 있다(로그인해야 열린다). runshoes 공개 주소에는 Access가 없다.

---

## 3. 왜 GitOps인가

### Push형 vs Pull형

Jenkins가 클러스터에 직접 명령하는 **Push형**도 동작은 한다.
Jenkins ──(kubectl set image)──▶ 클러스터
하지만 문제가 있다.

- Jenkins가 클러스터를 수정할 권한(kubeconfig / SA)을 들고 있어야 한다.
  Jenkins가 뚫리면 클러스터도 뚫린다.
- "지금 무엇이 배포됐는지"를 알려면 `kubectl`을 쳐봐야 한다.
- 누가 손으로 `kubectl edit`을 하면 그대로 반영되고 추적이 안 된다.

그래서 **Pull형(GitOps)** 을 쓴다.
Jenkins ──(git commit)──▶ Git ◀──(watch)── ArgoCD ──▶ 클러스터

### 얻은 것

|                | 효과                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| 자격증명 축소  | Jenkins는 Git에 커밋만 한다. 클러스터 조작 권한(kubeconfig · RBAC)이 필요 없다     |
| 단일 진실 원천 | "무엇이 배포됐나"의 답이 항상 Git에 있다. 롤백은 `git revert`                     |
| 감사 추적      | 모든 배포가 Git 커밋으로 남는다                                                   |

### 오해하기 쉬운 점

**ArgoCD는 Harbor(레지스트리)를 감시하지 않는다.**
새 이미지가 Harbor에 올라와도 ArgoCD는 모른다.
"이 태그를 써라"는 명세가 **Git에 적혀야만** ArgoCD가 배포한다.

그래서 Jenkins가 하는 일이 두 가지다.

1. Harbor에 이미지 push (창고에 물건 넣기)
2. 인프라 레포의 `newTag`를 갱신하는 커밋 (명세서 고치기)

2번이 없으면 ArgoCD는 영원히 옛 태그만 배포한다.
이 커밋 한 줄이 **Harbor와 ArgoCD를 잇는 유일한 다리**다.

---

## 4. 레포 분리 설계

매니페스트를 앱 레포가 아니라 별도의 인프라 레포에 둔다.

|             | 앱 레포 (`runshoes`)            | 인프라 레포 (`ronanlab-infra`) |
| ----------- | ------------------------------- | ------------------------------ |
| 담는 것     | 소스 · Dockerfile · Jenkinsfile | 매니페스트 · Application 정의 · 클러스터 공용 구성 |
| 바뀌는 이유 | 기능 · 버그                     | 배포 설정 · 이미지 태그        |
| 바꾸는 주체 | 개발자                          | 운영자 또는 CI 자동            |
| 산출물      | 이미지                          | 클러스터 상태                  |

**분리 이유**

- 진실의 원천을 하나로 둔다. 같은 매니페스트가 두 군데 있으면
  "어느 게 진짜냐"가 생기고, self-heal이 켜지면 수동 수정이 되돌려져 혼란이 온다.
- 인프라 레포 하나만 보면 클러스터 전체 상태가 보인다.
- Jenkins가 인프라 레포에 커밋해도 앱 레포와 분리돼 있어 무한 빌드 루프가 없다.

`ronanlab-infra`는 클러스터 단위로 묶는다 — `apps/<이름>/`(프로젝트별 매니페스트)와
`platform/`(Harbor · Jenkins · ArgoCD · 터널 등 클러스터의 것).

---

## 5. 이미지 빌드 — BuildKit

클러스터 안에서는 도커 데몬을 쓰지 않는다(DinD 지양).
**BuildKit rootless**(`moby/buildkit:*-rootless`)로 데몬 없이 빌드한다.

- 에이전트 Pod에 `buildkit` 컨테이너 하나. 특권 컨테이너 대신 seccomp · AppArmor만 푼다(rootlesskit이 사용자 네임스페이스를 만든다)
- **이미지 두 개를 한 컨테이너에서 차례로** — `buildctl-daemonless.sh`는 부를 때마다 데몬을 새로 띄운다
  - `Dockerfile` → `harbor.ronanlab.dev/runshoes/runshoes`
  - `Dockerfile.chatbot` → `harbor.ronanlab.dev/runshoes/runshoes-chatbot`
- 태그는 **커밋 해시 12자리, 두 이미지가 같은 태그**. `latest`는 쓰지 않는다 — 태그로 어느 커밋이 도는지 알 수 있어야 한다
- Harbor 인증은 robot 계정 `robot$runshoes+jenkins`(push) — Jenkins 자격 증명 `harbor-robot-runshoes-jenkins`. 노드가 당길 때는 `robot$runshoes+pull`(Secret `runshoes/harbor-pull`)
- Harbor는 `harbor.ronanlab.dev` 그대로 부른다. 클러스터 CoreDNS가 이 이름을 ingress-nginx 내부 Service로 돌려 Access를 거치지 않는다(ronanlab-infra `platform/coredns`)
- 에이전트 메모리: requests 1.5GiB · limit 3GiB. 앱 이미지는 Vite · Maven 단계가 동시에 돌아 최대 2.4GiB(로컬 실측). 한 번에 4~5분

### Dockerfile — 4단

```
web     node:20-alpine            yarn install → vite build              → dist/
server  maven:3.9-temurin-21      mvn package(단위 테스트 포함)           → app.jar
jre     eclipse-temurin:21-jdk    jlink — 필요한 모듈 17개만              → /jre
실행    alpine:3.24               /jre + app.jar + static/(dist), 사용자 10001, :3000
```

- 이미지 252MB. JRE를 jlink로 줄여 `eclipse-temurin:21-jre-alpine`(그대로면 421MB)보다 작다. 모듈이 빠지면 실행 중 `NoClassDefFoundError`로 드러나므로 의존성을 더하면 계약을 다시 돌린다(`backend/README.md`)
- 실행 Alpine은 jdk 이미지와 같은 버전(musl)
- root로 돌지 않는다(사용자 10001) — Deployment에서 `runAsNonRoot: true`
- 기동 약 5~7초, 유휴 메모리 약 235MiB

---

## 6. 트리거 — 폴링 2분

Jenkins Job `runshoes-app`은 GitHub `Gabriel-Joo/runshoes` main을 **2분마다 폴링**한다.
GitHub webhook을 쓰지 않는 이유: Jenkins가 Cloudflare Access 뒤에 있어 GitHub이 들어올 수 없다(운영 도구는 인터넷에 열지 않는다).

Job·자격 증명은 ronanlab-infra `platform/jenkins/values.yaml`의 **JCasC**가 만든다 — Jenkins UI에서 고치지 않는다.
바꾸려면 values.yaml을 고쳐 `helm upgrade jenkins jenkins/jenkins --version 5.9.68 -n jenkins -f platform/jenkins/values.yaml`.
Job을 처음 더한 직후에는 목록에 안 보일 수 있다 — `POST /configuration-as-code/reload` 한 번(values.yaml 주석).

---

## 7. Jenkinsfile 핵심

전체는 앱 레포 루트의 `Jenkinsfile` 참고. 세 스테이지로 구성된다.

1. **태그** — `GIT_COMMIT` 앞 12자리
2. **빌드·push** — BuildKit으로 두 이미지를 같은 태그로 Harbor에 push
3. **매니페스트 태그** — ronanlab-infra를 clone → `apps/runshoes/kustomization.yaml`의 `newTag` 두 줄을 새 태그로 → 커밋 · push

```sh
git clone -q --depth 1 --branch main "$INFRA_REPO" "$D"
sed -E -i 's/^(    newTag: )"[0-9a-f]{12}"/\1"'"$TAG"'"/' "$KUSTOMIZATION"
n=$(grep -c '^    newTag: "'"$TAG"'"' "$KUSTOMIZATION" || true)
[ "$n" = 2 ] || { echo "newTag 줄이 2개가 아니다($n)"; exit 1; }
git commit -q -am "runshoes: 이미지 태그 $TAG"
git push -q origin HEAD:main     # 실패하면 최신 main 위에서 다시(3번까지)
```

**설계 판단**

- **`sh '''` (작은따옴표)** — Groovy가 문자열을 해석하지 않게 해 자격 증명이 셸 환경변수로만 다뤄진다. Harbor 인증 줄 앞에는 `set +x`로 로그에 펼쳐지지 않게 한다
- **sed 한 번에 두 줄** — `images:`에 두 항목을 같은 모양으로 두면 같은 정규식이 둘 다 바꾼다. 바뀐 줄이 정확히 2개인지 세서, 한쪽만 바뀌는 일을 막는다. MySQL 이미지는 `images:`에 넣지 않는다(StatefulSet에 고정 태그)
- **ronanlab-infra는 `sh 'git clone'`으로** — Jenkins 폴링은 빌드 중 git 단계로 받은 저장소를 전부 감시한다. git 단계로 받으면 태그 push가 빌드를 다시 부르고, 그 빌드가 또 push하는 루프가 된다
- **deploy key** — ronanlab-infra 쓰기 전용 SSH 키(`ronanlab-infra-deploy-key`). 토큰과 달리 만료로 배포가 조용히 멈추지 않는다. GitHub 호스트 키는 박아 둔다
- **push 재시도** — 같은 저장소에 다른 프로젝트 Jenkins도 태그를 push한다. 먼저 push됐으면 최신 main을 받아 다시 바꾼다

---

## 8. 매니페스트 — kustomize

ronanlab-infra `apps/runshoes/`.

```
apps/runshoes/
├─ kustomization.yaml         ← 리소스 목록 + 이미지 태그 2개(같은 값)
├─ mysql/statefulset.yaml     ← runshoes-mysql (MySQL 8.0.46, local-path 2Gi, w1 선호)
├─ mysql/service.yaml         ← runshoes-mysql:3306 (headless)
├─ app/deployment.yaml        ← runshoes(Spring) + chatbot 컨테이너
├─ app/service.yaml           ← 포트 http(80→3000) · chatbot(8766)
├─ app/ingress.yaml           ← / → http, /ws/chat → chatbot
├─ scripts/create-secrets.sh  ← runshoes-mysql · harbor-pull (사람이 돌린다)
└─ README.md
```

**앱 — Deployment `runshoes`**

- **무상태 · RollingUpdate(maxSurge 1, maxUnavailable 0)** — 새 Pod가 Ready가 된 뒤 옛 Pod를 내린다. 배포 중 끊기지 않는다
- **Ready는 DB까지** — `/actuator/health/readiness`(readinessState + db). startup `/actuator/health`(최대 2분 — Flyway 첫 기동), liveness `/actuator/health/liveness`
- **종료** — preStop 5초(Ingress가 엔드포인트를 뺄 시간) → SIGTERM → graceful shutdown(최대 20초)
- **DB 접속** — `SPRING_DATASOURCE_URL=jdbc:mysql://runshoes-mysql:3306/runshoes?…connectionTimeZone=UTC`, 계정 `runshoes`, 비밀번호는 Secret `runshoes-mysql`. `TZ=UTC`
- **챗봇 사이드카** — 같은 Pod의 별도 컨테이너. Ingress가 `/ws/chat`을 8766으로 보낸다(rewrite 없음). WebSocket이 끊기지 않게 Ingress 프록시 제한을 1시간으로
- **Ollama 직접 연결** — 두 컨테이너 모두 `OLLAMA_URL=http://192.168.122.1:11434`. Pod에서 VM 사설망의 GPU 호스트로 바로 간다
- **보안** — Spring 컨테이너는 `runAsNonRoot: true`(이미지 사용자 10001). 챗봇 컨테이너는 root
- 리소스: runshoes 200m/512Mi · limit 1Gi, chatbot 10m/48Mi · 256Mi

**DB — StatefulSet `runshoes-mysql`**

- MySQL 8.0.46, utf8mb4 · `utf8mb4_unicode_ci` · `default-time-zone=+00:00` · performance_schema 끔 · buffer pool 256M. 200m/512Mi · limit 1Gi
- 데이터베이스 `runshoes`와 계정은 이미지가 첫 기동에 만든다(`MYSQL_DATABASE` · `MYSQL_USER`). 스키마 · 시드는 앱의 Flyway(V1 스키마, V2 시드)
- local-path(노드 디스크)라 PV가 노드에 묶인다 — w1 선호(nodeAffinity preferred). PVC는 Retain — StatefulSet을 지워도 남는다. 백업은 `mysqldump`(apps/runshoes/README.md)
- 프로브는 `mysqladmin ping -h 127.0.0.1`(비밀번호를 인자에 남기지 않는다)

**Namespace · Secret은 사람이 만든다** — `harbor-pull` · `runshoes-mysql`이 거기 있다. ArgoCD가 Namespace를 소유하면 Application 삭제 · prune 한 번에 Secret까지 사라질 수 있다.
Ingress — ingress-nginx, 호스트 `runshoes.ronanlab.dev`. TLS는 Cloudflare 엣지에서 끝난다(`ssl-redirect: "false"`).

---

## 9. ArgoCD Application

ronanlab-infra `platform/argocd/applications/runshoes.yaml`. Application 객체는 사람이 `kubectl apply`로 넣는다(git push만으로는 바뀌지 않는다).

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: runshoes
  namespace: argocd
spec:
  project: default
  source:
    repoURL: git@github.com:Gabriel-Joo/ronanlab-infra.git
    targetRevision: main
    path: apps/runshoes
  destination:
    server: https://kubernetes.default.svc
    namespace: runshoes
  syncPolicy:
    syncOptions:
      - CreateNamespace=false
```

- **Sync는 수동** — Jenkins 태그 커밋은 ArgoCD에 OutOfSync로 보이고, 사람이 Sync를 눌러야 배포된다. 이미지와 매니페스트 변경을 한 번의 Sync로 같이 내보낼 수 있다.
  자동으로 켤 때는 `automated: {prune: false, selfHeal: false}`
- **prune 없음** — git에서 지운 리소스는 클러스터에 남는다. PVC(DB 데이터)를 실수로 지우지 않게
- **finalizer 없음** — Application을 지워도 앱 · MySQL · PVC는 남는다
- **`CreateNamespace=false`** — Namespace는 사람이 만든다(8장)
- 인프라 레포는 private — ArgoCD는 읽기 전용 deploy key(Secret `argocd/repo-ronanlab-infra`)로 읽는다

---

## 10. 전체 흐름 요약
1. 개발자가 앱 레포(GitHub main)에 push
2. Jenkins가 2분 안에 폴링으로 감지 → BuildKit이 두 이미지를 빌드 → Harbor에 `:커밋12` push
3. Jenkins가 ronanlab-infra clone → `newTag` 두 줄 갱신 커밋 → push
4. ArgoCD가 3분 안에 변경 감지(OutOfSync) → 사람이 Sync
5. 새 Pod 기동 → Flyway(새 마이그레이션이 있으면) → Ready → 옛 Pod 종료(RollingUpdate)
6. 방문자는 Cloudflare → 공용 터널 → ingress-nginx → Pod

**되돌리기**: ronanlab-infra의 태그 커밋을 `git revert` → push → Sync. DB 스키마는 되돌아가지 않는다 — 스키마 변경은 앞으로만(Flyway 다음 버전), 적용된 마이그레이션 파일은 고치지 않는다.

**DB 구조를 바꾸는 배포**: 마이그레이션(V3…)이 옛 앱과 새 앱 양쪽에서 돌 수 있게 만든다 — 롤링 중 두 버전이 같은 DB를 잠깐 함께 쓴다.

**외부 노출**: 공용 터널 설정은 ronanlab-infra `platform/cloudflared/configmap.yaml`. 호스트를 더하면
Sync → `kubectl -n cloudflared rollout restart deploy/cloudflared`(cloudflared는 기동 때만 설정을 읽는다) → Cloudflare DNS CNAME을
`02ad6a13-ce45-4262-a32a-40241bf034dc.cfargotunnel.com`으로(`platform/cloudflared/README.md` "바꿀 때").

---

## 11. 자원

노드(워커 3대, 각 메모리 약 3.9GiB)를 Jenkins · Harbor · ArgoCD · ingress-nginx · cloudflared · 다른 프로젝트와 나눠 쓴다. namespace quota는 없고 노드 메모리가 상한이다.

| | CPU req | MEM req | MEM limit |
|---|---|---|---|
| runshoes(Spring) | 200m | 512Mi | 1Gi |
| chatbot | 10m | 48Mi | 256Mi |
| runshoes-mysql | 200m | 512Mi | 1Gi |
| 빌드 Pod(BuildKit, 빌드 중에만) | 500m | 1.5Gi | 3Gi |

- MySQL은 w1에 둔다(limits 여유가 가장 큰 노드). 다른 프로젝트의 MySQL PV도 w1에 있어 w1이 멈추면 둘 다 멈춘다 — 노드가 3대라 감수
- w1 drain 동안 DB가 멈추고 앱 Ready가 빠진다(apps/runshoes/README.md)
