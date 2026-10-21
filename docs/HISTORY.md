# RUNSHOES — 구축 · 전환 기록

지금 구조는 [README](../README.md) · [INFRA.md](INFRA.md) 에 있다. 이 문서는 **어떻게 지금이 됐는지**를 모은다 — 학교 클러스터에서 자체 클러스터로의 이주,
공용 Cloudflare 터널 무중단 전환, 녹화한 응답 계약으로 검증한 백엔드 전환(json-server → Spring Boot + MySQL), 운영 데이터를 옮기며 붙인 로그인, 그 과정의 트러블슈팅.
API 의 모양이 json-server 를 닮은 이유(id max+1 · terms id 12 · DOUBLE …)는 [API_CONTRACT.md](API_CONTRACT.md).

## 1. 한눈에

| 시기 | 무엇 | 어디 |
|---|---|---|
| 2026-07~09 | React + json-server 로 만들고 웹 터미널(aisw-lab)에 수동 배포 | [DEPLOY.md](DEPLOY.md) |
| 2026-09 | 학교 RKE2 위 vcluster 에 GitOps(GitLab · Jenkins/Kaniko · std-harbor · ArgoCD) | 2.2 |
| 2026-09 | Ollama 를 Cloudflare Tunnel + Access 로 vcluster 에 연결, 챗봇 사이드카 | 5 |
| 2026-10-18 | 자체 kubeadm 클러스터로 이주(GitHub · BuildKit · 자체 Harbor · ronanlab-infra) | 2.1 |
| 2026-10-18 | 클러스터 공용 터널을 platform 으로 무중단 이전, runshoes 주소를 공용 터널로 | 3 |
| 2026-10-18~21 | 응답을 녹화하고 계약으로 비교하며 Spring Boot + MySQL 로 전환. 운영 전환 끊김 0 | 4 |
| 2026-10-21 | 로그인 — 기존 리뷰 105건을 계정 30개로 옮기는 V3 를 운영에 적용, 이어 쓰기 권한 · 로그인 화면 배포 | 6 |

---

## 2. 학교 환경 → 자체 클러스터

학교 서비스(GitLab · Harbor · vcluster)는 교내망에서만 닿아 집에서 손댈 수 없었다. 같은 자체 클러스터에 먼저 올라간 petmint 의 파이프라인 패턴을 따랐다.
옮긴 뒤에도 구조(db.json + PVC, 앱 + 챗봇 사이드카)는 그대로 두고, 백엔드 전환은 따로 했다(4장).

### 2.1 무엇을 무엇으로 (2026-10-18)

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

**정리 (이후)**

- 호스트 systemd `cloudflared-runshoes.service`(runshoes-tunnel) — DNS 전환 뒤 요청 0 을 확인하고 서비스 · 유닛 · Cloudflare 터널 객체를 지웠다. 설정 · 자격 파일은 호스트 백업으로(2026-10-18)
- `ollama-tunnel`(`ollama.ronanlab.dev`) — 클러스터는 더 쓰지 않는다. 로컬 개발의 챗봇 기본값만 남아 있어 남겨 두었다
- 학교 쪽(vcluster 의 runshoes, GitLab · std-harbor)은 버렸다
- About 페이지(학교 파이프라인 도식)는 지웠다(2026-10-18) — 다시 쓸 예정
- ArgoCD `runshoes` 자동 Sync — 이주 검증 뒤 켰다가 같은 날 껐다(Spring 전환 중 반쯤 된 상태가 배포되지 않게)

### 2.2 학교 환경 (2026-09 ~ 10-18)

학교 쿠버네티스(RKE2 위 vcluster `vc-kopo17`)에 처음 GitOps를 구성했을 때의 구성과 시행착오다.
지금 구성의 대부분이 여기서 정한 원칙(Pull형, 레포 분리, 태그 커밋이 유일한 다리)을 그대로 잇는다.

#### 그때의 구성

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
- Ollama: `ollama-tunnel`로 공개한 `https://ollama.ronanlab.dev`를 Cloudflare Access Service Token(Secret `cf-access-credentials`)으로 통과해 불렀다(5장)

#### 트러블슈팅 기록

실제로 막혔던 지점과 해결. 인프라 구성에서 겪는 전형적인 문제들이다.

##### OOMKilled — 빌드 중 에이전트 Pod 종료

`vite build`가 메모리를 크게 써서 빌드 도중 Pod가 OOM으로 죽었다.

**원인 두 가지**

- vcluster에 컨테이너당 메모리 상한(LimitRange 2Gi)이 걸려 있어 4Gi 요청이 거부됨
- Node가 컨테이너 limit을 모르고 시스템 메모리 기준으로 힙을 잡음

**해결**

- kaniko `resources`를 requests 1Gi / limits 2Gi로 상한에 맞춤
- Kaniko에 `--snapshot-mode=redo --single-snapshot` 추가 (메모리 · 시간 절약)
- Dockerfile 빌드 스테이지에 `ENV NODE_OPTIONS=--max-old-space-size=1536`

##### 이미지 태그 소멸 — kubectl 컨테이너

`bitnami/kubectl:1.29`, `alpine/kubectl:1.29.2`가 레지스트리에서
삭제돼 `ErrImagePull` 발생(구버전 태그 정리 정책).
→ GitOps 전환으로 kubectl 컨테이너 자체가 불필요해져 `alpine/git`으로 교체.

##### 토큰 정리 — 자격증명 공유의 함정

만료 · 폐기된 GitLab 토큰이 Jenkins와 ArgoCD 여러 곳에서 공유되고 있었다.
하나를 폐기하자 ArgoCD가 gitops 레포를 못 읽어 sync가 깨졌다.
→ 새 PAT를 발급해 재정비. **용도별 토큰 분리**(로컬 / Jenkins / ArgoCD 읽기전용)가
원칙임을 체감한 사례.

> 지금은 토큰 대신 deploy key를 용도별로 둔다 — ArgoCD 읽기용, Jenkins 쓰기용(ronanlab-infra `scripts/make-deploy-keys.sh`).

##### 쿼터 · 동시 빌드

이전 빌드의 에이전트 Pod가 완전히 종료되기 전 다음 빌드가 시작돼
쿼터를 놓고 충돌, Pending이 길어졌다.
→ Jenkinsfile에 `disableConcurrentBuilds()` 추가.

##### vcluster는 학교 사설망(물리 네트워크)으로 직접 나가지 못한다

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

→ 처음에는 리뷰 요약 기능을 배포 범위에서 제외했고(5장, [DEPLOY.md](DEPLOY.md) 8장 참고),
이후 Cloudflare Tunnel + Access로 우회했다(위 "그때의 구성").
클러스터 안에 LLM을 직접 컨테이너로 띄우는 대안도 검토했으나,
당시 리소스 상한(컨테이너당 2Gi)에서는 8B 모델 구동이 어려웠다.

> 자체 클러스터에서는 이 제약이 없다. 노드 VM이 GPU 호스트와 같은 사설망(192.168.122.0/24)에 있어
> Pod가 `192.168.122.1:11434`로 바로 닿는다(지금 구성은 [INFRA.md](INFRA.md) 8장).


> 레포: 2026-10-18 전에는 학교 GitLab(`std-gitlab.kopoctc.kr/kopo17/runshoes`)이 원본이고 GitHub은 거울이었다.
> `gitlab` remote의 push URL에 두 주소를 함께 등록해 한 번에 양쪽으로 밀었다(학교 GitLab 미러링이 외부 push를 막아서).
> 학교 GitLab은 버렸다 — 지금은 GitHub이 원본이다. 로컬 clone에 `gitlab` remote가 남아 있으면 지운다.

---

## 3. 공용 Cloudflare 터널 — 무중단 이전 (2026-10-18)

클러스터 공용 터널(petmint · argocd · harbor · jenkins 공개 주소)이 `petmint` 네임스페이스에 손으로 apply 돼 있었고 git 에 없었다.
이 터널이 끊기면 ArgoCD · Jenkins 도 끊긴다 — 작업 도구가 사라지는 변경이라 되돌리기부터 정했다.

- **새것 먼저, 옛것 나중**: 같은 터널에 커넥터가 여럿 붙을 수 있다(이미 2개가 붙어 있었다). `cloudflared` 네임스페이스에 ArgoCD 로 2개를 더 띄워 커넥터 4개 → 확인 → 옛 Deployment 삭제
- 자격 증명 Secret 은 디스크 · 화면에 평문을 남기지 않게 파이프로 복사(sha256 대조). Namespace · Secret 은 사람이 만들고, 설정은 git(`ronanlab-infra platform/cloudflared`)
- 되돌리기 4단(새 Pod 0 으로 · 옛 Deployment 다시 · 백업 재적용 · 호스트에서 같은 터널에 비상 커넥터)을 미리 만들고 터널 없이 쓰는 길(m-k8s kubectl, MetalLB VIP)을 확인
- 결과: 공개 주소 4개를 1초마다 1,360회 — **실패 0**. 옛 커넥터를 지우는 동안에도 302(Access) 유지
- 새 Deployment 에 readinessProbe(`/ready` — 엣지 연결) · maxUnavailable 0 · 노드 분산을 더했다 — 설정을 바꿀 때 롤링이 터널 연결을 기다린다
- 그 뒤 `runshoes.ronanlab.dev` 를 학교 인그레스로 보내던 호스트 systemd 터널에서 공용 터널로: ConfigMap 에 호스트 추가 → Sync → `rollout restart`(cloudflared 는 기동 때만 설정을 읽는다 — `:2000/config` 로 새 규칙 확인) → DNS CNAME 변경. 순서를 바꾸면 404

---

## 4. 백엔드 전환 — json-server → Spring Boot + MySQL (2026-10-18~21)

목표는 **프런트를 한 줄도 바꾸지 않고** 백엔드를 갈아끼우는 것. 정답을 계획서가 아니라 **지금 도는 API 의 실제 응답**으로 삼았다.
계획: [SPRING_MIGRATION_PLAN.md](SPRING_MIGRATION_PLAN.md)(Phase 0~6). 재현한 계약과 그 근거: [API_CONTRACT.md](API_CONTRACT.md).

### 4.1 Phase 0 — 응답 녹화

- 운영 Node Pod 에 시드 db.json 으로 시작해 50 시나리오(GET · POST · PATCH · PUT · DELETE · OPTIONS, 404 7가지, 정렬 동점, createdAt 형식, cascade, id 재사용)를 순서대로 보내 상태코드 · 헤더 전체 · 본문을 파일로 남겼다(`contract/`). 쓰기가 섞이므로 전에 db.json 을 백업하고 끝나고 되돌렸다
- 요약은 GPU 를 쓰므로 운영에서 부르지 않았다 — 같은 커밋의 server.cjs 를 로컬에 띄우고 고정 응답 mock-ollama 로 9 시나리오(캐시 히트 · 실패 · 프롬프트 원문)
- `diff.mjs` — createdAt 은 같은 순간이면 같다, 숫자 epsilon, 키 순서 무시, **배열 순서는 본다**(정렬 동점의 id 순이 계약)
- 녹화하자마자 계획서와 다른 것이 나왔다: `Cache-Control` 은 `no-store` 가 아니라 `no-cache`, DELETE 본문은 지운 문서가 아니라 `{}`, OPTIONS 는 200 이 아니라 204 + Origin 반사, `?brand=` 같은 필드 필터가 실제로 동작

### 4.2 Phase 1~4 — 로컬에서 계약 PASS 까지

| Phase | 한 것 | 계약 | 계획과 달라진 것 |
|---|---|---|---|
| 1 스키마 · 시드 | Flyway V1(스키마) · V2(db.json 에서 생성), 로컬 MySQL(compose) | MySQL ↔ db.json 필드 단위 비교 PASS | id AUTO_INCREMENT 없음(max+1), terms id 12 그대로, 숫자 DOUBLE, `DATETIME(3)`. 호스트에 JDK 가 없어 Maven 컨테이너 안에서(nice 19) |
| 2 API | json-server 라우터 · 목록 규칙(필터 · lodash orderBy · `_limit`) · 헤더 필터 | 47 중 42 PASS(나머지 요약 · SPA) | CORS 는 Origin 반사 + credentials, POST 의 클라이언트 id 를 쓴다 |
| 3 요약 · SPA | 요약 이식(프롬프트 글자 단위 동일), SPA 서빙, BASE_PATH | 본 47 · 요약 4 PASS, FAIL 0 | Ollama 응답에 `response` 가 없으면 실패로(원래 동작) |
| 4 이미지 | Vite → Maven → jlink JRE → alpine, 사용자 10001 | 이미지 그대로 47 · 4 PASS | temurin jre 그대로면 421MB — jlink 로 252MB. BuildKit 3GiB 상한에서 최대 2.4GiB |

### 4.3 Phase 5 — 운영 전환 (2026-10-21 01:39 KST)

수동 Sync 를 써서 **MySQL 을 먼저 띄우고, 앱 이미지와 Deployment 변경은 Sync 한 번에** 내보냈다 — 새 이미지가 DB 설정 없이 뜨는 창이 없다.

1. Secret `runshoes-mysql`(사람이, 무작위) → MySQL StatefulSet · Service 커밋 → **선택 Sync**(두 리소스만 — 앱은 그대로) → `runshoes-mysql-0` Ready(w1)
2. 운영 db.json 이 시드와 같은지 다시 확인(같으면 시드에서 시작해도 잃는 데이터가 없다)
3. 앱 push → Jenkins 가 Spring 이미지 빌드(4분 40초) · 태그 커밋 — 이 사이 Sync 금지(git 에 새 이미지 + 옛 Deployment)
4. Deployment 커밋(RollingUpdate maxUnavailable 0, DB env, `/actuator/health` 프로브, runAsNonRoot) → **전체 Sync 한 번**
5. 새 Pod: Flyway V1 · V2(66ms) → 기동 6.7초 → Ready(DB 포함) → 옛 Node Pod 종료

- 공개 `/api/terms` 를 1초마다 90회 — **실패 0**. 01:39:00~02 동안 Node 와 Spring 이 번갈아 응답(롤링 겹침), 그 뒤 Spring
- 운영 계약(읽기 시나리오 26): PASS 23 · FAIL 0 · INFO 3. 공개 주소 · WebSocket · 다른 호스트 정상
- 되돌리기 길: Deployment 커밋과 태그 커밋을 revert → Sync 하면 Node 이미지와 PVC 의 db.json 으로 돌아간다(관찰 기간 동안 PVC 를 남긴다)
  — 2026-10-21 에 이 길을 닫았다. DB 가 V3(계정 · 리뷰 재배분, 6장)가 되어 Node 배포는 지금 데이터와 맞지 않고, PVC 에는 시드와 같은 db.json 하나뿐이었다(sha256 `0bccadd4…`) — PVC 를 지웠다

---

## 5. Ollama 로 가는 길

### 5.1 Pod 에서 Ollama 로 닿지 않던 문제 (학교 vcluster)

처음에는 Ollama가 별도 PC(사설 IP)에서 구동 중이었다. 로컬 개발 환경과
웹 터미널은 학교의 같은 물리 네트워크에 있어 직접 통신이 가능했지만,
쿠버네티스 Pod는 vcluster의 오버레이 네트워크 안에 있어 같은 사설 IP 대역으로도
경로 자체가 존재하지 않았다(Pod 안에서 직접 확인 — 요청이 항상 타임아웃).
방화벽 문제가 아니라 vcluster 네트워크 구조 자체의 제약이라,
Ollama를 클러스터 안에 띄우는 방안도 검토했으나 컨테이너 리소스 상한(2Gi)에서
8B 모델 구동이 어려워 기각했다.

### 5.2 터널 + Access 로 우회 (2026-09 ~ 10-18)

- **ollama-tunnel** 이 GPU 서버의 Ollama를 공개 HTTPS로 노출한다 →
  `https://ollama.ronanlab.dev`. Pod에서 공개 인터넷으로 나가는 경로(egress)는
  열려 있으므로 사설망 라우팅 제약을 우회한다.
- 앞단의 **Cloudflare Access**를 Service Token으로 통과한다.
  `CF-Access-Client-Id` / `CF-Access-Client-Secret` 헤더를 실어 호출하며,
  자격증명은 Kubernetes Secret(`cf-access-credentials`) → 환경변수로 주입한다.
  코드에 비밀값을 두지 않는 설정 외부화(README 12장)와 같은 구조다.
- runshoes · chatbot 두 서버 모두 이 방식으로 Ollama을 호출한다.

> Gemini API 전환은 한때 검토했던 방향이나, 터널 + Access로 클러스터에서
> 실시간 추론이 가능해져 **전환 보류**. 비용·응답속도 문제가 생기면
> 그때 대안으로 다시 검토한다.

### 5.3 지금 — 사설망 직접 연결 (2026-10-18 부터)

자체 클러스터의 노드는 GPU 호스트 위의 VM 이고 호스트와 같은 사설망(libvirt 192.168.122.0/24)에 있다 — Pod 가 `http://192.168.122.1:11434` 로 바로 닿는다.
터널 · Access 를 거치지 않아 Service Token 도 필요 없다. `ollama-tunnel` 은 클러스터 밖(로컬 개발)용으로만 남았다.

---

## 6. 로그인 — 운영 데이터를 옮기며 붙이기 (2026-10-21)

찜한 신발 둘을 레이더 차트로 비교하는 화면과, 그 화면을 읽는 챗봇을 만들려면 찜이 **사람에게 묶여야** 한다. 그때까지 찜은 모두가 같이 쓰는 BOOLEAN 한 칸이었고,
찜 수 · 평점은 프런트가 계산해 PATCH 했다(아무나 999를 보낼 수 있었다). 설계: [AUTH_DESIGN.md](AUTH_DESIGN.md).
두 단계로 나눠 배포했다 — 1단계는 스키마(V3) · 인증 API(쓰기는 아직 열어 둠), 2단계는 쓰기 권한 · 화면.

### 6.1 기존 데이터를 계정으로 — 리뷰 105건, 닉네임 101종 → 사용자 30명

- 시험용 계정이라도 "누가 무엇을 썼는가"가 말이 되게 했다. 리뷰-신발 짝은 그대로 두고(내용이 그 신발에 맞게 쓰여 있다) 작성자만 30명에게 나눴다
- 리뷰에 담긴 성격을 어긋나지 않게 묶었다 — "과내전이 심해 **안정화만** 신는다"(#12)는 안정화가 카야노 하나뿐이라 그 사람에게 다른 리뷰를 주지 않았고,
  "늘 반 사이즈 크게"를 쓴 4건은 한 사람에게, 발볼이 "좁은 편"과 "넓다"는 섞지 않았다. 같은 사람이 같은 신발에 두 번 가지 않는 것은 스크립트로 검사했다
- 한 사람이 한 신발에 같은 말을 두 번 쓴 #29 · #81 중 정보가 적은 #81 을 지웠다 — 8번 신발 평점은 숫자를 박지 않고 남은 리뷰로 다시 셌다(4.4 → 4.3)
- 공용 찜 · 공감은 admin 몫으로 옮기고 숫자(시드의 좋아요 수)는 카운터로 남겼다 — `COUNT(likes)` 로 바꾸면 시드 값이 거의 0이 돼 랭킹이 무너진다

### 6.2 V3 를 안전하게 — "추가만", 가드, 지문

- **추가만 하고 지우는 것은 V4 로.** 옛 이미지로 되돌려도 뜨게 — Flyway 는 모르는 future 마이그레이션을 넘기고, `ddl-auto: validate` 는 늘어난 테이블 · 컬럼을 문제 삼지 않는다.
  말로 두지 않고 확인했다: 운영과 같은 커밋으로 jar 를 빌드해 V3 DB 에 띄우니 `validated 3 migrations` · 읽기 · 쓰기가 됐다. 그래서 `reviews.user_id` 도 V3 에서는 NULL 허용
- **"한 신발에 첫 리뷰 하나"는 DB 가 지킨다.** MySQL 에는 조건부 UNIQUE 가 없어 `IF(review_type='FIRST', shoe_id, NULL)` 생성 컬럼에 `UNIQUE(user_id, …)` — FOLLOWUP 은 NULL 이라 몇 건이든 된다.
  STORED 로 만들려다 거절됐다(ERROR 1215 — 기준 컬럼 shoe_id 의 FK 가 CASCADE). 빈 스키마에서 시험해 VIRTUAL 은 되는 것을 보고 바꿨다
- **가드가 테이블을 남기던 문제.** V3 는 리뷰 id 를 고정 목록으로 쓰므로, 운영 리뷰가 시드와 다르면 시작하지 않아야 한다. 처음 가드는 `CHECK` 가 걸린 임시 테이블에 조건을 INSERT 하는 방식이었다.
  그런데 MySQL DDL 은 트랜잭션이 아니라, 실패하면 **가드 테이블이 남은 채로** 멈춘다(로컬 시험에서 실제로 남았다). 가드를 **아무것도 만들지 않는 SELECT 한 줄**로 바꿨다 —
  조건이 틀리면 스칼라 서브쿼리가 두 행을 내 `ERROR 1242` 로 멈춘다. 다시 시험해 테이블 · 컬럼 추가 0, `flyway_schema_history` 실패 행 하나만 남는 것을 확인하고 복구 절차(그 행만 지운다)를 런북에 적었다.
  그 시험에서 SQL 만 고치고 jar 를 다시 빌드하지 않아 **옛 V3 가 돈 것**도 드러났다 — 그 뒤로 배포 전에 "이미지 안의 V3 sha256 = 시험한 파일"을 확인한다
- **지문.** 리뷰-신발 짝을 `"1:1,2:1,3:2,…"` 로 이어 SHA-256 — 시드 · 로컬 · 운영(API 로 읽기만)이 `166db588…` 로 같은 것을 보고 V3 가드에 박았다.
  운영 적용 뒤에는 Flyway checksum(V1 · V2 · V3)이 로컬 시험 DB 와 같았다 — 시험한 그 파일이 들어갔다

### 6.3 V3 운영 적용 — 순서가 곧 안전장치

| 순서 | 왜 |
|---|---|
| Secret `runshoes-auth` → **envFrom 만 먼저 Sync**(이미지 그대로) | 새 이미지는 `JWT_SECRET` 없이 뜨지 않는다. envFrom 을 optional 로 두지 않아, Secret 이 없으면 새 Pod 가 멈추고 옛 Pod 가 계속 돈다(maxUnavailable 0) — 실패가 조용히 넘어가지 않으면서 서비스는 죽지 않는다. 이미지와 분리하면 "Secret 연결"이 문제없다는 것을 따로 확인할 수 있다(롤링 · env 키 3개 · 200, 값은 보지 않는다) |
| 앱 push **를 미뤘다** | Jenkins 는 빌드 뒤 ronanlab-infra main 에 이미지 태그를 **직접 push** 한다. envFrom 커밋이 Sync 되기 전에 앱을 push 하면 main 에 envFrom 과 새 이미지가 같이 있게 되고, "envFrom 만 Sync" 를 누르는 순간 **백업 없이 V3 가 들어간다**. 그래서 envFrom Sync 를 끝낸 뒤에 앱을 push 했다 |
| Harbor 를 왕복한 이미지의 V3 확인 | 호스트에서 `docker pull` 이 `failed size validation` 으로 실패 — 원인은 레지스트리가 아니라 공개 경로의 Cloudflare Access(로그인 페이지 HTML). 노드는 내부 VIP 로 받으므로 Sync 와는 무관했다. 그래서 워커 노드의 containerd 로 받아 이미지 안 jar 의 V3 sha256 을 비교했다(`check-image-migrations.sh`) |
| **덤프 → 복원 확인 → 지문 → Sync 를 끊지 않고** | `--single-transaction` 덤프는 그 시점까지만 담는다. 덤프와 Sync 사이에 들어온 쓰기는, 실패해서 덤프로 복원하면 사라진다. 그래서 덤프 직후 지문을 보고 바로 Sync 했다 — 덤프 21:55:30Z → V3 적용 21:56:29Z, **59초**. 덤프는 다른 이름의 DB 로 넣어 운영 API 의 지문과 맞춘 뒤에만 믿었다 |
| 적용 뒤 `user_id IS NULL` | 롤링 중 1분쯤 옛 Pod 가 받은 리뷰는 작성자 칸이 빈다. 0건이었다. 있었다면 자동으로 아무 계정에 붙이지 않고 사람이 정한다 |

V3 는 241ms 에 끝났고(사용자 31 · 리뷰 104 · 작성자 없음 0), 덤프는 V4 적용 뒤 2주와 30일 중 늦은 때까지 둔다 — V4 가 공용 찜 칸을 지우면 원래 값은 덤프에만 남는다.

### 6.4 2단계 — 쓰기 권한과 서버가 정하는 값

- **401 → 404 → 403.** 로그인 없는 쓰기는 대상이 있는지 보기 전에 401 — 없는 id 로 존재 여부를 떠보지 못하게. 로그인했으면 없는 것은 404, 있으면 권한(403)
- **클라이언트가 정하던 값을 서버로.** 평점 · 리뷰 수(리뷰를 쓸 때 같은 트랜잭션에서, V3 와 같은 반올림), 찜 · 공감 수(행이 생길 때만 ±1), 작성자 · 리뷰 시각(실사용 후기의 "30일 뒤"가 클라이언트 시각에 흔들리지 않게).
  본문에 와도 admin 이어도 버린다. 리뷰 PUT 은 405 — admin 에게 열어 두면 "아무 필드나 덮어쓰는" 처음 문제로 돌아간다
- **토큰은 메모리, refresh 는 HttpOnly 쿠키(`/api/auth` 한정).** 쿠키가 붙는 곳이 `/api/auth` 뿐이라 CSRF 대상도 거기뿐 — 그 경로만 CORS 헤더를 빼고 Origin 을 본다.
  다른 `/api` 는 json-server 계약의 CORS(Origin 반사 + credentials)를 그대로 두었다. Spring Security 의 Cache-Control 은 껐다(계약 헤더를 덮는다)
- **계약은 "의도한 변경을 입힌 옛 기준선"과 비교해 새로 굳혔다.** 옛 녹화에 작성자 매핑 · #81 · 8번 신발 · 사용자별 liked 를 프로그램으로 입혀 새 녹화와 diff — 남는 차이 0 을 본 뒤에만 `spring-v3` 를 기준선으로.
  쓰기 시나리오마다 기대 상태코드(401 · 403 · 405 · 409)를 적어 녹화기가 어긋나면 멈추게 했고, 기록에는 비밀번호 · JWT · refresh 쿠키를 남기지 않는다
- **화면 검증에서 찾은 것.** `/account` 에서 로그아웃하면 세션이 먼저 지워져 가드가 로그인 화면으로 보냈다(홈으로 먼저 옮기고 끊게). 768px 에서 로그인하면 헤더가 39~117px 넘쳤다(태블릿에서 닉네임 말줄임 · 글자 축소).
  만료 시험이 처음에 통과하지 않은 것은 코드가 아니라 Spring 의 JWT 시계 오차 허용(60초) 때문이었다
- **배포.** 새 마이그레이션이 없어 이미지 Sync 하나. 배포 순간 로그인 없는 쓰기가 막히므로 직전 리뷰의 작성자 칸을 다시 봤다(NULL 0). Sync 뒤 로그인 없는 쓰기 세 가지가 401 이고 리뷰 수가 그대로인 것,
  시드 계정으로 로그인 · refresh · 로그아웃(공개 https — 내부 VIP 는 http 라 curl 이 Secure 쿠키를 저장하지 않아 처음 시험이 무효였다)을 확인했다

### 6.5 시험 도구의 착오 — 남겨 둘 것

- Jenkins 빌드 완료를 `build.xml` 의 `<result>` 로 판단했다가 1분 만에 "SUCCESS" 로 착각 — 빌드 중에도 그 줄이 있다. 로그 끝의 `Finished:` 줄로 본다
- 위의 jar 재빌드 누락, http 의 Secure 쿠키 — 셋 다 "검증이 통과했다"를 한 번 더 의심하게 한 경우다. 검증 결과보다 **검증이 무엇을 봤는지**를 먼저 확인한다

