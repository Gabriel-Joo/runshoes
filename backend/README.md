# backend — RUNSHOES API (Spring Boot 3.5 · Java 21 · MySQL 8)

RUNSHOES 의 REST API 와 React 빌드물 서빙. **계약의 정답은 `contract/baseline/node`(녹화한 응답)** — [docs/API_CONTRACT.md](../docs/API_CONTRACT.md).

```
domain/   Shoe · Review · Term + 리포지토리(스키마는 Flyway — db/migration/V1, 시드 V2 는 scripts/gen-seed-sql.mjs 생성물)
api/      JsonServerController(/api/{name}[/{id}]) · DocCollection 셋 · ListQuery(json-server 목록 규칙) · Js(JS 비교·문자열화)
config/   ApiHeadersFilter(CORS · Cache-Control — Node 와 같은 모양) · JacksonConfig(정수 값 숫자는 300 처럼)
```

## 빌드 · 실행 (로컬)

호스트에 JDK · Maven 이 없다 — Maven 이미지 안에서, 낮은 우선순위로(같은 호스트에 다른 작업이 돈다):

```bash
cd backend
docker run --rm --network host --cpus=4 --cpu-shares=2 --user $(id -u):$(id -g) -e HOME=/tmp \
  -e MAVEN_OPTS="-Dmaven.repo.local=/m2/repository -Xmx1024m" -v ~/.cache/runshoes-m2:/m2 -v "$PWD":/build -w /build \
  maven:3.9-eclipse-temurin-21 nice -n 19 mvn -q -B package

cd .. && docker compose up -d          # MySQL 127.0.0.1:3307 (3306 은 다른 프로젝트)
yarn build                             # dist/ — SPA 시나리오(21~23)에 쓴다
contract/run-spring-local.sh           # DB 를 비우고 Flyway 시드부터 → :3200 에 띄워 녹화 → 기준선 diff
contract/run-spring-local.sh summary   # 요약 — mock-ollama(:3109). 진짜 Ollama 는 부르지 않는다
```

## 이미지 (루트 `Dockerfile`)

Vite 빌드 → Maven 패키지(단위 테스트 포함) → jlink 로 필요한 모듈만 담은 JRE → `alpine:3.24` 위에 jar + `static/`. 사용자 10001(root 아님), `:3000`.

- 크기 252MB(2026-10-18). temurin `21-jre-alpine` 을 그대로 쓰면 421MB — 계획서 게이트(400MB)를 넘어 jlink 로 줄였다
- jlink 모듈: `java.base,java.compiler,java.desktop,java.instrument,java.logging,java.management,java.naming,java.net.http,java.scripting,java.security.jgss,java.sql,java.xml,jdk.charsets,jdk.crypto.ec,jdk.management,jdk.unsupported,jdk.zipfs`.
  빠진 모듈은 실행 중 `NoClassDefFoundError` 로 드러난다 — 의존성을 더하면 `IMAGE=… contract/run-spring-local.sh` 로 다시 확인한다
- 실행 Alpine 은 jdk 이미지(`eclipse-temurin:21-jdk-alpine`)와 같은 버전으로(musl)
- 빌드는 Jenkins 와 같은 BuildKit rootless 로 로컬에서도 된다. 메모리 상한 3GiB 에서 최대 2.4GiB(Vite · Maven 단계가 동시에 돈다)
- 기동 4.6초, 유휴 메모리 약 235MiB(limit 1Gi)

```bash
docker run --rm --cpus=4 --cpu-shares=2 --memory=3g --security-opt seccomp=unconfined --security-opt apparmor=unconfined \
  -e BUILDKITD_FLAGS=--oci-worker-no-process-sandbox -v "$PWD":/work:ro -v /tmp/out:/out -w /work --entrypoint sh \
  moby/buildkit:v0.33.1-rootless -c 'nice -n 19 buildctl-daemonless.sh build --frontend dockerfile.v0 --local context=. \
  --local dockerfile=. --output type=docker,name=runshoes:local,dest=/out/runshoes.tar'
docker load -i /tmp/out/runshoes.tar && IMAGE=runshoes:local contract/run-spring-local.sh
```

## 운영 설정 (클러스터)

ronanlab-infra `apps/runshoes/app/deployment.yaml` 이 넣는 값 — 그 밖은 application.yml 기본값.

| env | 값 |
|---|---|
| `SPRING_DATASOURCE_URL` | `jdbc:mysql://runshoes-mysql:3306/runshoes?useSSL=false&allowPublicKeyRetrieval=true&connectionTimeZone=UTC` |
| `SPRING_DATASOURCE_USERNAME` / `_PASSWORD` | `runshoes` / Secret `runshoes-mysql` 의 `MYSQL_PASSWORD` |
| `TZ` | `UTC` |
| `OLLAMA_URL` | `http://192.168.122.1:11434` (GPU 호스트, VM 사설망) |
| `SERVER_PORT` · `APP_STATIC` | 이미지 기본값 `3000` · `/opt/app/static` |
| `BASE_PATH` | 비움(루트). 주면 그 아래로(context-path) |

- 프로브: startup `/actuator/health` · readiness `/actuator/health/readiness`(readinessState + **db**) · liveness `/actuator/health/liveness`
- 종료: graceful shutdown 20초(`server.shutdown: graceful`) — Deployment preStop 5초 뒤
- 로그 확인: `kubectl -n runshoes logs deploy/runshoes -c runshoes` — 기동 때 Flyway(`Successfully applied …` 또는 `Schema … is up to date`)
- 운영에서 계약 확인은 읽기만: `node contract/record.mjs --read-only …`(contract/README.md)

## API 계약

API 는 녹화한 응답(`contract/baseline/node`)을 바이트 수준까지 재현한다 — id 를 max+1 로 매기고, terms 의 id 12 중복을 그대로 두고, 숫자 스펙이 DOUBLE 인 것 등.
같게 한 것 · 일부러 다르게 둔 것과 그 이유는 [docs/API_CONTRACT.md](../docs/API_CONTRACT.md).
