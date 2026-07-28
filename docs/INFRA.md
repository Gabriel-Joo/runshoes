# RUNSHOES — 인프라 · CI/CD

> **push 한 번으로 빌드부터 배포까지**
> Kaniko로 빌드하고, Harbor에 올리고, GitOps로 배포한다

이 문서는 RUNSHOES를 학교 쿠버네티스 클러스터에 배포하기 위해 구성한
CI/CD 파이프라인을 설명한다. 애플리케이션 자체 문서는 [README](../README.md)를 참고.

---

## 1. 한눈에 보기

```
 개발자                Jenkins (cicd)            Harbor
   │                       │                       │
   │  git push             │                       │
   ├──────────────────────▶│  ① Kaniko 빌드         │
   │      (웹훅)            ├──────────────────────▶│  이미지 :BUILD_NUMBER
   │                       │                       │
   │                       │  ② gitops 레포          │
   │                       │     태그 커밋           │
   │                       ▼                       │
   │              gitops 레포 (Git)                 │
   │              apps/runshoes/kustomization.yaml  │
   │                       │                       │
   │                       │  ③ 감지               │
   │                       ▼                       │
   │                   ArgoCD  ─────────────────────┤  이미지 pull
   │                       │                       │
   │                       ▼                       │
   │              runshoes 네임스페이스 (배포)        │
```

핵심은 **Jenkins와 ArgoCD가 서로를 직접 호출하지 않는다**는 점이다.
둘 다 Git만 바라본다. Jenkins는 Git에 "새 태그"를 **쓰고**,
ArgoCD는 Git을 **읽어** 클러스터를 맞춘다. Git이 유일한 접점이다.

---

## 2. 구성 요소

| 요소            | 위치                                                       | 역할                                                                 |
| --------------- | ---------------------------------------------------------- | -------------------------------------------------------------------- |
| **앱 레포**     | `std-gitlab.kopoctc.kr/kopo17/runshoes`                    | 소스 · Dockerfile · Jenkinsfile (GitHub `Gabriel-Joo/runshoes` 미러) |
| **Jenkins**     | `kopo17-jenkins.std.kopoctc.kr` · `cicd` 네임스페이스      | 빌드 트리거 · Kaniko 빌드 · gitops 태그 커밋                         |
| **Kaniko**      | 빌드 시 에이전트 Pod 내 컨테이너                           | 도커 데몬 없이 이미지 빌드                                           |
| **Harbor**      | `std-harbor.kopoctc.kr/kopo17/runshoes`                    | 이미지 레지스트리 (창고)                                             |
| **gitops 레포** | `std-gitlab.kopoctc.kr/kopo17/gitops` · `apps/runshoes/`   | 배포 명세 (무엇을 어떤 태그로 배포할지)                              |
| **ArgoCD**      | `vcluster-argocd.kopoctc.kr` · Project `kopo17`            | Git → 클러스터 동기화                                                |
| **배포 대상**   | `runshoes` 네임스페이스 · `kopo17-runshoes.std.kopoctc.kr` | 실제 서비스                                                          |

---

## 3. 왜 GitOps인가

### Push형 vs Pull형

초기에는 Jenkins가 클러스터에 직접 명령하는 **Push형**으로 구성했다.

```
Jenkins ──(kubectl set image)──▶ 클러스터
```

이 방식은 동작하지만 문제가 있다.

- Jenkins가 클러스터를 수정할 권한(kubeconfig / SA)을 들고 있어야 한다.
  Jenkins가 뚫리면 클러스터도 뚫린다.
- "지금 무엇이 배포됐는지"를 알려면 `kubectl`을 쳐봐야 한다.
- 누가 손으로 `kubectl edit`을 하면 그대로 반영되고 추적이 안 된다.

그래서 **Pull형(GitOps)** 으로 전환했다.

```
Jenkins ──(git commit)──▶ Git ◀──(watch)── ArgoCD ──▶ 클러스터
```

### 얻은 것

|                | 효과                                                                              |
| -------------- | --------------------------------------------------------------------------------- |
| 자격증명 축소  | Jenkins는 Git에 커밋만 한다. 클러스터 조작 권한 불필요 → `rbac-jenkins.yaml` 제거 |
| 단일 진실 원천 | "무엇이 배포됐나"의 답이 항상 Git에 있다. 롤백은 `git revert`                     |
| self-heal      | 누가 클러스터를 손대도 ArgoCD가 Git 기준으로 되돌린다                             |
| 감사 추적      | 모든 배포가 Git 커밋으로 남는다                                                   |

### 오해하기 쉬운 점

**ArgoCD는 Harbor(레지스트리)를 감시하지 않는다.**
새 이미지가 Harbor에 올라와도 ArgoCD는 모른다.
"이 태그를 써라"는 명세가 **Git에 적혀야만** ArgoCD가 배포한다.

그래서 Jenkins가 하는 일이 두 가지다.

1. Harbor에 이미지 push (창고에 물건 넣기)
2. gitops 레포의 `newTag`를 갱신하는 커밋 (명세서 고치기)

2번이 없으면 ArgoCD는 영원히 옛 태그만 배포한다.
이 커밋 한 줄이 **Harbor와 ArgoCD를 잇는 유일한 다리**다.

---

## 4. 레포 분리 설계

매니페스트를 앱 레포가 아니라 별도의 gitops 레포에 둔다.

|             | 앱 레포 (`runshoes`)            | gitops 레포                   |
| ----------- | ------------------------------- | ----------------------------- |
| 담는 것     | 소스 · Dockerfile · Jenkinsfile | 매니페스트 · Application 정의 |
| 바뀌는 이유 | 기능 · 버그                     | 배포 설정 · 이미지 태그       |
| 바꾸는 주체 | 개발자                          | 운영자 또는 CI 자동           |
| 산출물      | 이미지                          | 클러스터 상태                 |

**분리 이유**

- 진실의 원천을 하나로 둔다. 같은 매니페스트가 두 군데 있으면
  "어느 게 진짜냐"가 생기고, self-heal이 켜지면 수동 수정이 되돌려져 혼란이 온다.
- gitops 레포 하나만 보면 클러스터 전체 상태가 보인다.
- Jenkins가 gitops에 커밋해도 앱 레포와 분리돼 있어 무한 빌드 루프가 없다.

기존에 만들어 둔 `kopo17/gitops` 모노레포 관례(`apps/<이름>/`)를 그대로 따랐다.

---

## 5. 이미지 빌드 — Kaniko

클러스터 안에서는 도커 데몬을 쓸 수 없다(보안상 DinD 지양).
그래서 데몬 없이 이미지를 빌드하는 **Kaniko**를 쓴다.

- 에이전트 Pod에 `kaniko` 컨테이너를 띄워 빌드
- Harbor 인증은 `harbor-credentials` 시크릿을 `.docker/config.json`으로 마운트
- 태그는 `:BUILD_NUMBER`(추적용)와 `:latest`(편의용) 동시 push

### Dockerfile — 멀티스테이지

```
builder (node:20-alpine)         runtime (node:20-alpine)
  yarn install                     프로덕션 의존성만
  vite build           ──dist──▶   server.cjs (Express + json-server)
```

빌드 도구(vite · typescript)를 최종 이미지에서 제외해 크기를 줄인다.

---

## 6. 트러블슈팅 기록

실제로 막혔던 지점과 해결. 인프라 구성에서 겪는 전형적인 문제들이다.

### OOMKilled — 빌드 중 에이전트 Pod 종료

`vite build`가 메모리를 크게 써서 빌드 도중 Pod가 OOM으로 죽었다.

**원인 두 가지**

- vcluster에 컨테이너당 메모리 상한(LimitRange 2Gi)이 걸려 있어 4Gi 요청이 거부됨
- Node가 컨테이너 limit을 모르고 시스템 메모리 기준으로 힙을 잡음

**해결**

- kaniko `resources`를 requests 1Gi / limits 2Gi로 상한에 맞춤
- Kaniko에 `--snapshot-mode=redo --single-snapshot` 추가 (메모리 · 시간 절약)
- Dockerfile 빌드 스테이지에 `ENV NODE_OPTIONS=--max-old-space-size=1536`

### 이미지 태그 소멸 — kubectl 컨테이너

`bitnami/kubectl:1.29`, `alpine/kubectl:1.29.2`가 레지스트리에서
삭제돼 `ErrImagePull` 발생(구버전 태그 정리 정책).
→ GitOps 전환으로 kubectl 컨테이너 자체가 불필요해져 `alpine/git`으로 교체.

### 토큰 정리 — 자격증명 공유의 함정

만료 · 폐기된 GitLab 토큰이 Jenkins와 ArgoCD 여러 곳에서 공유되고 있었다.
하나를 폐기하자 ArgoCD가 gitops 레포를 못 읽어 sync가 깨졌다.
→ 새 PAT를 발급해 재정비. **용도별 토큰 분리**(로컬 / Jenkins / ArgoCD 읽기전용)가
원칙임을 체감한 사례.

### 쿼터 · 동시 빌드

이전 빌드의 에이전트 Pod가 완전히 종료되기 전 다음 빌드가 시작돼
쿼터를 놓고 충돌, Pending이 길어졌다.
→ Jenkinsfile에 `disableConcurrentBuilds()` 추가.

---

## 7. Jenkinsfile 핵심

전체는 앱 레포 루트의 `Jenkinsfile` 참고. 두 스테이지로 구성된다.

### Build & Push (Kaniko)

Dockerfile을 빌드해 Harbor에 `:BUILD_NUMBER`, `:latest`로 push.

### Update GitOps Manifest

gitops 레포를 clone → `kustomization.yaml`의 `newTag`를 빌드 번호로 수정
→ 커밋 · push. ArgoCD가 이 커밋을 감지해 배포한다.

```groovy
withCredentials([usernamePassword(
  credentialsId: 'gitlab-token',
  usernameVariable: 'GIT_USER',
  passwordVariable: 'GIT_TOKEN'
)]) {
  sh '''
    rm -rf gitops
    git clone https://oauth2:${GIT_TOKEN}@std-gitlab.kopoctc.kr/kopo17/gitops.git
    cd gitops/apps/runshoes
    sed -i "s|newTag:.*|newTag: \\"${TAG}\\"|" kustomization.yaml
    git commit -am "deploy: runshoes 이미지 :${TAG} [skip ci]"
    git push origin main
  '''
}
```

**설계 판단**

- **`sh '''` (작은따옴표)** — Groovy가 문자열을 해석하지 않게 해
  토큰(`${GIT_TOKEN}`)이 로그에 노출되지 않는다. 셸이 환경변수로 처리하며 마스킹 유지.
- **`TAG` 환경변수** — `BUILD_NUMBER`는 Groovy 변수라 작은따옴표 안에서 안 풀린다.
  `environment { TAG = "${BUILD_NUMBER}" }`로 선언해 셸 환경변수로 노출.
- **`[skip ci]`** — gitops 레포에 웹훅이 걸릴 경우의 무한 루프 방지용 안전장치.
- **`rm -rf gitops`** — 재사용되는 워크스페이스의 이전 clone 잔재 제거.

---

## 8. 매니페스트 — kustomize

`gitops/apps/runshoes/`에 kustomize로 구성.

```
apps/runshoes/
├─ kustomization.yaml    ← 리소스 목록 + 이미지 태그
├─ pvc.yaml
├─ deployment.yaml       ← runshoes 컨테이너 + seed-db initContainer
├─ service.yaml
└─ ingress.yaml
```

`kustomization.yaml`의 `images:` 한 줄이 Deployment의 두 컨테이너
(`runshoes` · initContainer `seed-db`)의 태그를 동시에 갱신한다.
Jenkins는 이 `newTag`만 고치면 된다.

```yaml
images:
  - name: std-harbor.kopoctc.kr/kopo17/runshoes
    newTag: "11"
```

**주요 배포 설정**

- `strategy: Recreate` — PVC를 단일 Pod가 점유하므로 롤링 대신 재생성
- initContainer `seed-db` — `db.json`이 없을 때만 시드를 복사(기존 데이터 보존)
- PVC(`nfs-std-1` StorageClass) — `db.json` 영속화
- Ingress — traefik, 호스트 기반, `web`·`websecure` entrypoint + TLS
  (traefik의 전역 HTTPS 리다이렉트 때문에 TLS 블록이 없으면 404)

---

## 9. ArgoCD Application

`gitops/argocd/runshoes-app.yaml`에 선언적으로 정의.

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: kopo17-runshoes
spec:
  project: kopo17
  source:
    repoURL: https://std-gitlab.kopoctc.kr/kopo17/gitops.git
    path: apps/runshoes
    targetRevision: main
  destination:
    server: https://192.168.26.217:443
    namespace: runshoes
  syncPolicy:
    automated:
      prune: true # Git에서 지우면 클러스터에서도 제거
      selfHeal: true # 수동 변경을 Git 기준으로 되돌림
    syncOptions:
      - CreateNamespace=true
```

- **prune** — Git이 진실. 레포에서 리소스를 지우면 클러스터에서도 삭제
- **selfHeal** — 드리프트 자동 교정. 이 옵션 때문에 수동 `kubectl` 개입은 무의미해짐
- **CreateNamespace** — 대상 네임스페이스를 ArgoCD가 생성

---

## 10. 전체 흐름 요약

```
1. 개발자가 앱 레포에 push
2. GitLab 웹훅 → Jenkins 빌드 트리거
3. Kaniko가 이미지 빌드 → Harbor에 :BUILD_NUMBER push
4. Jenkins가 gitops 레포 clone → newTag 갱신 커밋 → push
5. ArgoCD가 gitops 레포 변경 감지
6. ArgoCD가 Harbor에서 해당 태그 이미지를 받아 runshoes 네임스페이스에 배포
7. self-heal로 이후 상태 유지
```

개발자가 하는 일은 **1번(코드 push) 하나**뿐이다. 나머지는 자동.

---

## 11. 현재 상태

전 단계가 구성·검증 완료다. `git push` 한 번으로 Jenkins가 이미지를 빌드해
Harbor에 올리고, gitops 레포의 `newTag`를 갱신하는 커밋을 남기며,
ArgoCD가 이를 감지해 `runshoes` 네임스페이스에 자동 배포한다.

ArgoCD Application(`kopo17-runshoes`)은 auto sync + self-heal로 등록돼
Deployment를 관리한다(tracking-id 어노테이션으로 인수 확인).
`kopo17-runshoes.std.kopoctc.kr`에서 서비스 정상 응답.
