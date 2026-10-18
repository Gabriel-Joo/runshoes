# RUNSHOES — 인프라 · CI/CD

> **push 한 번으로 빌드부터 배포까지**
> BuildKit으로 빌드하고, Harbor에 올리고, GitOps로 배포한다

이 문서는 RUNSHOES를 쿠버네티스에 배포하는 CI/CD 파이프라인을 설명한다.
애플리케이션 자체 문서는 [README](../README.md)를 참고.

> **2026-10-18 이주** — 학교 환경(GitLab · std-harbor · vcluster Jenkins · RKE2 vcluster)에서
> 자체 서버의 kubeadm 클러스터로 옮겼다. 구조(db.json + PVC, 앱 + 챗봇 사이드카)는 그대로다.
> 무엇을 무엇으로 바꿨는지는 [11장](#11-이주-기록--학교-환경--자체-클러스터), 학교 시절의 구성과 트러블슈팅은 [12장](#12-학교-환경-기록-2026-09--10-18).

---

## 1. 한눈에 보기

```
개발자                Jenkins (jenkins ns)            Harbor (harbor.ronanlab.dev)
  │ git push            │                                 │
  ├── GitHub main ─────▶│ ① 2분 폴링 → BuildKit 빌드 ×2 ──▶│ runshoes:<커밋12>
  │                     │                                 │ runshoes-chatbot:<커밋12>
  │                     │ ② ronanlab-infra 태그 커밋        │
  │                     ▼                                 │
  │            ronanlab-infra (GitHub, private)           │
  │            apps/runshoes/kustomization.yaml           │
  │                     │                                 │
  │                     │ ③ 감지 → 자동 Sync                │
  │                     ▼                                 │
  │                  ArgoCD ──────────────────────────────┤ 이미지 pull (harbor-pull)
  │                     │                                 │
  │                     ▼
  │            runshoes 네임스페이스
  │            Pod = runshoes(3000) + chatbot(8766)
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
| **앱 레포** | GitHub `Gabriel-Joo/runshoes` (public) | 소스 · Dockerfile 2개 · Jenkinsfile |
| **인프라 레포** | GitHub `Gabriel-Joo/ronanlab-infra` (private) `apps/runshoes/` | 배포 명세(매니페스트 · 이미지 태그). 클러스터 공용 구성(`platform/`)도 여기 |
| **클러스터** | kubeadm v1.35, `m-k8s`(control-plane) + `w1~w3-k8s` | GPU 호스트 위 VM 4대(Vagrant · libvirt, 사설망 192.168.122.0/24) |
| **Jenkins** | `jenkins.ronanlab.dev` · `jenkins` 네임스페이스 | Job `runshoes-app` — 폴링 · BuildKit 빌드 · 태그 커밋. Job은 JCasC가 만든다 |
| **BuildKit** | 빌드 때 에이전트 Pod 안 컨테이너(rootless) | 도커 데몬 없이 이미지 빌드 |
| **Harbor** | `harbor.ronanlab.dev/runshoes` (private) | 이미지 레지스트리 |
| **ArgoCD** | `argocd.ronanlab.dev` · Application `runshoes` | Git → 클러스터 자동 동기화 |
| **배포 대상** | `runshoes` 네임스페이스 · `runshoes.ronanlab.dev` | 실제 서비스 |
| **외부 노출** | Cloudflare Tunnel — `cloudflared` 네임스페이스(ronanlab-infra `platform/cloudflared`) | 클러스터 공용 터널. runshoes · petmint · argocd · harbor · jenkins 공개 주소 전부 |
| **Ollama** | GPU 호스트 `192.168.122.1:11434` | 리뷰 요약 · 챗봇. Pod가 VM 사설망으로 바로 부른다 |

Jenkins · Harbor · ArgoCD는 Cloudflare Access 뒤에 있다(로그인해야 열린다). runshoes 공개 주소에는 Access가 없다.

---

## 3. 왜 GitOps인가

### Push형 vs Pull형

초기에는 Jenkins가 클러스터에 직접 명령하는 **Push형**으로 구성했다.
Jenkins ──(kubectl set image)──▶ 클러스터
이 방식은 동작하지만 문제가 있다.

- Jenkins가 클러스터를 수정할 권한(kubeconfig / SA)을 들고 있어야 한다.
  Jenkins가 뚫리면 클러스터도 뚫린다.
- "지금 무엇이 배포됐는지"를 알려면 `kubectl`을 쳐봐야 한다.
- 누가 손으로 `kubectl edit`을 하면 그대로 반영되고 추적이 안 된다.

그래서 **Pull형(GitOps)** 으로 전환했다.
Jenkins ──(git commit)──▶ Git ◀──(watch)── ArgoCD ──▶ 클러스터

### 얻은 것

|                | 효과                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| 자격증명 축소  | Jenkins는 Git에 커밋만 한다. 클러스터 조작 권한 불필요 → `rbac-jenkins.yaml` 제거 |
| 단일 진실 원천 | "무엇이 배포됐나"의 답이 항상 Git에 있다. 롤백은 `git revert`                     |
| 감사 추적      | 모든 배포가 Git 커밋으로 남는다                                                   |

> 학교 환경에서는 selfHeal(드리프트 자동 교정)도 켰지만, 지금은 끈다(9장).

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
`platform/`(Harbor · Jenkins · ArgoCD · 터널 등 클러스터의 것). 학교 `kopo17/gitops`의 `apps/<이름>/` 관례를 그대로 이었다.

---

## 5. 이미지 빌드 — BuildKit

클러스터 안에서는 도커 데몬을 쓰지 않는다(DinD 지양).
**BuildKit rootless**(`moby/buildkit:*-rootless`)로 데몬 없이 빌드한다.

- 에이전트 Pod에 `buildkit` 컨테이너 하나. 특권 컨테이너 대신 seccomp · AppArmor만 푼다(rootlesskit이 사용자 네임스페이스를 만든다)
- **이미지 두 개를 한 컨테이너에서 차례로** — `buildctl-daemonless.sh`는 부를 때마다 데몬을 새로 띄우므로 kaniko 때처럼 컨테이너를 나눌 필요가 없다
  - `Dockerfile` → `harbor.ronanlab.dev/runshoes/runshoes`
  - `Dockerfile.chatbot` → `harbor.ronanlab.dev/runshoes/runshoes-chatbot`
- 태그는 **커밋 해시 12자리, 두 이미지가 같은 태그**. `latest`는 쓰지 않는다 — 태그로 어느 커밋이 도는지 알 수 있어야 한다
- Harbor 인증은 robot 계정 `robot$runshoes+jenkins`(push) — Jenkins 자격 증명 `harbor-robot-runshoes-jenkins`. 노드가 당길 때는 `robot$runshoes+pull`(Secret `runshoes/harbor-pull`)
- Harbor는 `harbor.ronanlab.dev` 그대로 부른다. 클러스터 CoreDNS가 이 이름을 ingress-nginx 내부 Service로 돌려 Access를 거치지 않는다(ronanlab-infra `platform/coredns`)

### Dockerfile — 멀티스테이지
builder (node:20-alpine) runtime (node:20-alpine)
yarn install 프로덕션 의존성만
vite build ──dist──▶ server.cjs (Express + json-server)

빌드 도구(vite · typescript)를 최종 이미지에서 제외해 크기를 줄인다.
시드 데이터(`db.json`)는 이미지 안 `db.json.seed`로 들어간다(8장 seed-db).

첫 빌드(2026-10-18, `#1`)는 두 이미지 합쳐 1분 43초.

---

## 6. 트리거 — 폴링 2분

Jenkins Job `runshoes-app`은 GitHub `Gabriel-Joo/runshoes` main을 **2분마다 폴링**한다.
GitHub webhook을 쓰지 않는 이유: Jenkins가 Cloudflare Access 뒤에 있어 GitHub이 들어올 수 없다(운영 도구는 인터넷에 열지 않는다).

Job·자격 증명은 ronanlab-infra `platform/jenkins/values.yaml`의 **JCasC**가 만든다 — Jenkins UI에서 고치지 않는다.
바꾸려면 values.yaml을 고쳐 `helm upgrade jenkins jenkins/jenkins --version 5.9.68 -n jenkins -f platform/jenkins/values.yaml`.

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
- **sed 한 번에 두 줄** — `images:`에 두 항목을 같은 모양으로 두면 같은 정규식이 둘 다 바꾼다. 바뀐 줄이 정확히 2개인지 세서, 한쪽만 바뀌는 일을 막는다
- **ronanlab-infra는 `sh 'git clone'`으로** — Jenkins 폴링은 빌드 중 git 단계로 받은 저장소를 전부 감시한다. git 단계로 받으면 태그 push가 빌드를 다시 부르고, 그 빌드가 또 push하는 루프가 된다(학교 때의 `[skip ci]` 대신)
- **deploy key** — ronanlab-infra 쓰기 전용 SSH 키(`ronanlab-infra-deploy-key`, petmint와 같이 쓴다). 토큰과 달리 만료로 배포가 조용히 멈추지 않는다. GitHub 호스트 키는 박아 둔다
- **push 재시도** — petmint Jenkins도 같은 저장소에 태그를 push한다. 먼저 push됐으면 최신 main을 받아 다시 바꾼다

---

## 8. 매니페스트 — kustomize

ronanlab-infra `apps/runshoes/`.

```
apps/runshoes/
├─ kustomization.yaml   ← 리소스 목록 + 이미지 태그 2개(같은 값)
├─ app/pvc.yaml         ← db.json (local-path 1Gi, RWO)
├─ app/deployment.yaml  ← runshoes + chatbot 컨테이너, initContainer seed-db
├─ app/service.yaml     ← 포트 http(80→3000) · chatbot(8766)
├─ app/ingress.yaml     ← / → http, /ws/chat → chatbot
├─ scripts/create-secrets.sh  ← harbor-pull (사람이 돌린다)
└─ README.md
```

```yaml
images:
  - name: harbor.ronanlab.dev/runshoes/runshoes
    newTag: "39bc1d1b7471"
  - name: harbor.ronanlab.dev/runshoes/runshoes-chatbot
    newTag: "39bc1d1b7471"
```

**주요 배포 설정**

- **`replicas: 1`, `strategy: Recreate`** — 상태가 PVC의 db.json 파일 하나다. 두 Pod가 같은 파일을 쓰면 깨지므로(single writer) 옛 Pod가 내려간 뒤 새 Pod가 뜬다. 배포 때 수십 초 끊긴다 — 무중단은 MySQL 전환 뒤(README 12장)
- **initContainer `seed-db`** — PVC에 `db.json`이 **없을 때만** 이미지의 `db.json.seed`를 복사한다. 있으면 그대로 둔다(사용자가 쓴 리뷰 보존)
- **PVC `runshoes-data`** — local-path(노드 디스크). Pod가 그 노드에 묶인다. StorageClass reclaimPolicy가 Delete라 PVC를 지우면 데이터도 사라진다. 백업이 없다
- **챗봇 사이드카** — 같은 Pod의 별도 컨테이너. Ingress가 `/ws/chat`을 8766으로 보낸다(rewrite 없음). WebSocket이 끊기지 않게 Ingress 프록시 제한을 1시간으로
- **Ollama 직접 연결** — 두 컨테이너 모두 `OLLAMA_URL=http://192.168.122.1:11434`. Pod에서 VM 사설망의 GPU 호스트로 바로 간다. 학교 때의 Cloudflare 터널 + Access Service Token(`CF_ACCESS_*`)은 쓰지 않는다
- **root로 실행** — Dockerfile에 `USER`가 없다. petmint의 `runAsNonRoot`를 넣지 않는다(Dockerfile은 MySQL 전환 때 고친다)
- **Namespace · Secret은 사람이 만든다** — `harbor-pull`이 거기 있다. ArgoCD가 Namespace를 소유하면 Application 삭제·prune 한 번에 Secret까지 사라질 수 있다
- Ingress — ingress-nginx, 호스트 `runshoes.ronanlab.dev`. TLS는 Cloudflare 엣지에서 끝난다(`ssl-redirect: "false"`)

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
    automated:
      prune: false
      selfHeal: false
    syncOptions:
      - CreateNamespace=false
```

- **자동 Sync** — Jenkins 태그 커밋이 사람 손 없이 배포된다(ArgoCD가 git을 3분마다 본다). 이주 검증을 마친 뒤 켰다(2026-10-18)
- **prune 끔** — git에서 지운 리소스는 클러스터에 남는다. PVC(db.json)를 실수로 지우지 않게
- **selfHeal 끔** — 클러스터를 손으로 바꾸면 OutOfSync로 표시만 하고 되돌리지 않는다. 다음 git 변경 때 git 쪽으로 맞춘다
- **finalizer 없음** — Application을 지워도 앱 · PVC는 남는다
- **`CreateNamespace=false`** — Namespace는 사람이 만든다(8장)
- 인프라 레포는 private — ArgoCD는 읽기 전용 deploy key(Secret `argocd/repo-ronanlab-infra`)로 읽는다

---

## 10. 전체 흐름 요약
1. 개발자가 앱 레포(GitHub main)에 push
2. Jenkins가 2분 안에 폴링으로 감지 → BuildKit이 두 이미지를 빌드 → Harbor에 `:커밋12` push
3. Jenkins가 ronanlab-infra clone → `newTag` 두 줄 갱신 커밋 → push
4. ArgoCD가 3분 안에 변경 감지 → 자동 Sync
5. 옛 Pod 종료 → 새 Pod(seed-db → runshoes + chatbot) 기동(Recreate)
6. 방문자는 Cloudflare → 공용 터널 → ingress-nginx → Pod

개발자가 하는 일은 **1번(코드 push) 하나**뿐이다. 나머지는 자동. push가 곧 배포다.

**되돌리기**: ronanlab-infra의 태그 커밋을 `git revert` → push → 자동 Sync. db.json은 되돌아가지 않는다(PVC).

**외부 노출**: 공용 터널 설정은 ronanlab-infra `platform/cloudflared/configmap.yaml`. 호스트를 더하면
Sync → `kubectl -n cloudflared rollout restart deploy/cloudflared`(cloudflared는 기동 때만 설정을 읽는다) → Cloudflare DNS CNAME을
`02ad6a13-ce45-4262-a32a-40241bf034dc.cfargotunnel.com`으로(`platform/cloudflared/README.md` "바꿀 때").

---

## 11. 이주 기록 — 학교 환경 → 자체 클러스터

2026-10-18. 학교 서비스(GitLab · Harbor · vcluster)는 교내망에서만 닿아 집에서 손댈 수 없었다.
같은 클러스터에 먼저 올라간 petmint의 파이프라인 패턴을 따랐다.

| 학교 (교내망 전용) | 지금 |
| --- | --- |
| `std-gitlab.kopoctc.kr/kopo17/runshoes` (원본) + GitHub(거울) | GitHub `Gabriel-Joo/runshoes` 하나 |
| `std-harbor.kopoctc.kr/kopo17/runshoes` | `harbor.ronanlab.dev/runshoes/` (robot push · pull 분리) |
| vcluster Jenkins · GitLab webhook | 클러스터 Jenkins · Job `runshoes-app`(JCasC) · 2분 폴링 |
| kaniko 컨테이너 × 2 · 태그 `BUILD_NUMBER` + `latest` | BuildKit rootless 하나 · 태그 커밋 해시 12자리 |
| gitops 레포(GitLab) `apps/runshoes/` · PAT | ronanlab-infra `apps/runshoes/` · deploy key |
| RKE2 위 vcluster `vc-kopo17` · Traefik · `nfs-std-1` | kubeadm 클러스터 · ingress-nginx · local-path |
| ArgoCD `kopo17-runshoes` (auto + prune + selfHeal) | ArgoCD `runshoes` (auto, prune · selfHeal 끔) |
| `kopo17-runshoes.std.kopoctc.kr` + 호스트 systemd 터널(`runshoes-tunnel`)로 `runshoes.ronanlab.dev` | `runshoes.ronanlab.dev` → 공용 터널(`cloudflared` 네임스페이스) |
| Ollama: `https://ollama.ronanlab.dev`(터널 + Access Service Token) | Ollama: `http://192.168.122.1:11434` 직접 |

**한 일 (순서대로)**

1. Harbor 프로젝트 `runshoes`(private) + robot 2개
2. ronanlab-infra `apps/runshoes/` · `platform/argocd/applications/runshoes.yaml`
3. Namespace · Secret(`harbor-pull`, Jenkins의 `harbor-robot-runshoes-jenkins`) — 사람이
4. Jenkins JCasC에 Job · 자격 증명 → `helm upgrade`(revision 5)
5. 앱 레포 Jenkinsfile 교체 · `chatbot_server.py`의 `OLLAMA_URL` 환경변수화 → 첫 빌드 `#1` 성공, 태그 커밋 `6b9ba25`
6. Application → Sync
7. 터널 전환 전 내부 검증 — VIP(192.168.122.240)에 Host 헤더로 `/` · `/api/*`(리뷰 105건) · WebSocket 환영 메시지
8. 공용 터널 ConfigMap에 호스트 추가 → Sync → rollout restart → Cloudflare DNS CNAME 변경
9. 검증 통과 뒤 자동 Sync 켜기

**데이터**: git의 `db.json`(리뷰 105건)으로 새로 시작했다. 학교 PVC의 리뷰 71건(테스트 흔적)은 가져오지 않았다.

**이주 중에 걸린 것**

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `helm upgrade` 뒤 Job `runshoes-app`이 404 — 디스크에는 `jobs/runshoes-app/config.xml`이 있음 | 기동 중 JCasC가 Job을 만든 직후 Jenkins가 미리 읽은 디스크 목록으로 Job 목록을 덮었다 | `POST /configuration-as-code/reload` 한 번(관리 → Configuration as Code → Reload). values.yaml 주석에 남김 |
| (막은 것) Job이 생기자마자 첫 폴링이 옛 kaniko Jenkinsfile로 돌 뻔함 | 기준 빌드가 없으면 Jenkins가 첫 폴링에서 강제로 빌드한다. 옛 Jenkinsfile은 없는 Secret(`harbor-credentials`)을 마운트하고 timeout도 없어 에이전트 Pod가 끝없이 대기 | 새 Jenkinsfile을 먼저 GitHub에 push하고 그다음 `helm upgrade` |
| (막은 것) 자리값 태그로 배포될 뻔함 | 첫 빌드 전 `newTag`는 Harbor에 없는 값. 자동 Sync가 켜져 있으면 바로 배포 → ImagePullBackOff | Application은 첫 빌드 뒤에 넣고, 자동 Sync는 검증 뒤에 켰다 |
| 터널 DNS를 먼저 바꾸면 404 | cloudflared는 설정을 기동 때만 읽는다. ConfigMap만 바뀌고 Pod는 옛 규칙 | Sync → rollout restart → `:2000/config`로 새 규칙 확인 → 그다음 DNS |

**남은 정리**

- 호스트 systemd `cloudflared-runshoes.service`(runshoes-tunnel) — DNS 전환 뒤 요청 0. 서비스를 멈추고 Cloudflare 터널 객체를 지운다
- `ollama-tunnel`(`ollama.ronanlab.dev`) — 클러스터 안에서는 더 쓰지 않는다. 로컬 개발의 챗봇 기본값(`chatbot_server.py`)과 Spring 전환 계획서가 아직 이 주소를 전제한다
- 학교 쪽(vcluster의 runshoes, GitLab · std-harbor) — 버린다. 새 Jenkinsfile은 학교 Jenkins에서 실패한다
- About 페이지(`src/pages/About.tsx`, `src/components/PipelineDiagram.tsx`)는 아직 학교 파이프라인(GitLab · Kaniko · vcluster · Traefik)을 그린다

---

## 12. 학교 환경 기록 (2026-09 ~ 10-18)

학교 쿠버네티스(RKE2 위 vcluster `vc-kopo17`)에 처음 GitOps를 구성했을 때의 구성과 시행착오다.
지금 구성의 대부분이 여기서 정한 원칙(Pull형, 레포 분리, 태그 커밋이 유일한 다리)을 그대로 잇는다.

### 12.1 그때의 구성

| 요소 | 위치 | 역할 |
| --- | --- | --- |
| 앱 레포 | `std-gitlab.kopoctc.kr/kopo17/runshoes` | 소스 · Dockerfile · Jenkinsfile (GitHub `Gabriel-Joo/runshoes` 미러) |
| Jenkins | `kopo17-jenkins.std.kopoctc.kr` · `cicd` 네임스페이스 | 빌드 트리거(GitLab 웹훅) · Kaniko 빌드 · gitops 태그 커밋 |
| Kaniko | 빌드 시 에이전트 Pod 내 컨테이너 | 도커 데몬 없이 이미지 빌드. 태그 `:BUILD_NUMBER`(추적용)와 `:latest`(편의용) |
| Harbor | `std-harbor.kopoctc.kr/kopo17/runshoes` | 이미지 레지스트리. 인증은 `harbor-credentials` 시크릿을 `.docker/config.json`으로 마운트 |
| gitops 레포 | `std-gitlab.kopoctc.kr/kopo17/gitops` · `apps/runshoes/` | 배포 명세 |
| ArgoCD | `vcluster-argocd.kopoctc.kr` · Project `kopo17` · Application `kopo17-runshoes` | auto sync + prune + selfHeal, `CreateNamespace=true` |
| 배포 대상 | `runshoes` 네임스페이스 · `kopo17-runshoes.std.kopoctc.kr` | 실제 서비스 |

- 매니페스트: `kustomization.yaml` · `pvc.yaml`(`nfs-std-1`) · `deployment.yaml`(runshoes + seed-db) · `service.yaml` · `ingress.yaml`
- Ingress — traefik, 호스트 기반, `web`·`websecure` entrypoint + TLS
  (traefik의 전역 HTTPS 리다이렉트 때문에 TLS 블록이 없으면 404). 단일 호스트에서 `/` → runshoes(3000), `/ws/chat` → chatbot(8766)
- 챗봇 이미지는 kaniko 컨테이너를 분리해 따로 빌드했다(한 컨테이너에서 재사용하면 kaniko 상태가 손상되는 문제가 있었다)
- gitops 태그 커밋에는 `[skip ci]` — gitops 레포에 웹훅이 걸릴 경우의 무한 루프 방지용 안전장치. `rm -rf gitops` — 재사용되는 워크스페이스의 이전 clone 잔재 제거
- 외부 노출: 호스트 서버의 `runshoes-tunnel`(systemd cloudflared)이 학교 인그레스를 `runshoes.ronanlab.dev`로 내보냈다
- Ollama: `ollama-tunnel`로 공개한 `https://ollama.ronanlab.dev`를 Cloudflare Access Service Token(Secret `cf-access-credentials`)으로 통과해 불렀다(README 11장)

### 12.2 트러블슈팅 기록

실제로 막혔던 지점과 해결. 인프라 구성에서 겪는 전형적인 문제들이다.

#### OOMKilled — 빌드 중 에이전트 Pod 종료

`vite build`가 메모리를 크게 써서 빌드 도중 Pod가 OOM으로 죽었다.

**원인 두 가지**

- vcluster에 컨테이너당 메모리 상한(LimitRange 2Gi)이 걸려 있어 4Gi 요청이 거부됨
- Node가 컨테이너 limit을 모르고 시스템 메모리 기준으로 힙을 잡음

**해결**

- kaniko `resources`를 requests 1Gi / limits 2Gi로 상한에 맞춤
- Kaniko에 `--snapshot-mode=redo --single-snapshot` 추가 (메모리 · 시간 절약)
- Dockerfile 빌드 스테이지에 `ENV NODE_OPTIONS=--max-old-space-size=1536`

#### 이미지 태그 소멸 — kubectl 컨테이너

`bitnami/kubectl:1.29`, `alpine/kubectl:1.29.2`가 레지스트리에서
삭제돼 `ErrImagePull` 발생(구버전 태그 정리 정책).
→ GitOps 전환으로 kubectl 컨테이너 자체가 불필요해져 `alpine/git`으로 교체.

#### 토큰 정리 — 자격증명 공유의 함정

만료 · 폐기된 GitLab 토큰이 Jenkins와 ArgoCD 여러 곳에서 공유되고 있었다.
하나를 폐기하자 ArgoCD가 gitops 레포를 못 읽어 sync가 깨졌다.
→ 새 PAT를 발급해 재정비. **용도별 토큰 분리**(로컬 / Jenkins / ArgoCD 읽기전용)가
원칙임을 체감한 사례.

> 지금은 토큰 대신 deploy key를 용도별로 둔다 — ArgoCD 읽기용, Jenkins 쓰기용(ronanlab-infra `scripts/make-deploy-keys.sh`).

#### 쿼터 · 동시 빌드

이전 빌드의 에이전트 Pod가 완전히 종료되기 전 다음 빌드가 시작돼
쿼터를 놓고 충돌, Pending이 길어졌다.
→ Jenkinsfile에 `disableConcurrentBuilds()` 추가.

#### vcluster는 학교 사설망(물리 네트워크)으로 직접 나가지 못한다

리뷰 요약 기능(로컬 PC의 Ollama 호출)을 이 클러스터에서도 쓸 수 있는지
검증하는 과정에서 확인했다.

- VM(학교 계정 셸)과 웹 터미널(aisw-lab)에서는 로컬 PC의 사설 IP
  (`192.168.x.x`)로 직접 `curl`이 성공한다 — 같은 물리 네트워크이기 때문이다.
- 반면 `runshoes` 네임스페이스의 Pod 안에서 같은 주소로 요청하면
  **항상 연결 타임아웃**이 발생한다(`kubectl exec ... -- curl ...`로 직접 확인).

vcluster는 자체 오버레이 네트워크를 쓰기 때문에, Pod 입장에서는
학교 사설망 대역으로 나가는 라우팅 경로 자체가 없다. 이는 방화벽 규칙
추가로 해결되는 문제가 아니라 **vcluster 네트워크 아키텍처의 제약**이며,
학생 권한으로 변경할 수 있는 범위 밖으로 판단했다.

→ 처음에는 리뷰 요약 기능을 배포 범위에서 제외했고([README](../README.md) 11장, [DEPLOY.md](DEPLOY.md) 8장 참고),
이후 Cloudflare Tunnel + Access로 우회했다(12.1).
클러스터 안에 LLM을 직접 컨테이너로 띄우는 대안도 검토했으나,
당시 리소스 상한(컨테이너당 2Gi)에서는 8B 모델 구동이 어려웠다.

> 자체 클러스터에서는 이 제약이 없다. 노드 VM이 GPU 호스트와 같은 사설망(192.168.122.0/24)에 있어
> Pod가 `192.168.122.1:11434`로 바로 닿는다(8장).
