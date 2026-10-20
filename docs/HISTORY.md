# RUNSHOES — 구축 · 전환 기록

지금 구조는 [README](../README.md) · [INFRA.md](INFRA.md) 에 있다. 이 문서는 **어떻게 지금이 됐는지**를 모은다 — 학교 클러스터에서 자체 클러스터로의 이주,
공용 Cloudflare 터널 무중단 전환, 녹화한 응답 계약으로 검증한 백엔드 전환(json-server → Spring Boot + MySQL), 그 과정의 트러블슈팅.
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
