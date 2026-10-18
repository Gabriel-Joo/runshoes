# backend — RUNSHOES API (Spring Boot 3.5 · Java 21 · MySQL 8)

json-server(`server.cjs` + `db.json`)를 대신한다. **계약의 정답은 `contract/baseline/node`(Node 앱 실제 응답)** — 계획서([docs/SPRING_MIGRATION_PLAN.md](../docs/SPRING_MIGRATION_PLAN.md))와 다르면 녹화를 따른다.

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

## json-server 와 같게 한 것 (녹화로 확인)

- 404 `{}` — 없는 id · 비숫자 id(`abc`, `01`) · 없는 컬렉션 · 그 밖의 `/api` 경로, 어떤 메서드든
- 새 id 는 **max + 1**(마지막 것을 지우면 그 id 를 다시 쓴다) — AUTO_INCREMENT 가 아니라 앱이 매긴다. POST body 에 id 가 있으면 그 id(있는 id 면 500)
- PATCH 는 body 에 있는 키만, null 도 반영. PUT 은 통째로 바꾸고 id 만 남긴다. DELETE 는 200 `{}`
- POST 201 + `Location: <요청 URL>/<id>` + `Access-Control-Expose-Headers: Location`
- 목록: 컬렉션에 있는 필드면 필터(`?brand=호카`, 값 여러 개는 OR), 없는 필드는 무시(`junk=1`), `_ne` · `_lte` · `_gte` · `_like` · `q`,
  `_sort`/`_order`(여러 키, lodash `orderBy` — stable, 오름차순에서 null 뒤), `_start`/`_end`/`_limit` + `X-Total-Count`.
  비교는 JS 문자열 기준(`rating=4` 는 맞고 `rating=4.0` 은 안 맞는다)
- 헤더: 모든 경로 `ACAO: *`. `/api` 는 Origin 이 오면 그 값을 돌려주고 `Allow-Credentials: true`, `Cache-Control: no-cache` + `Pragma` + `Expires: -1`.
  OPTIONS 는 204 + `Allow-Methods` + 요청 헤더 반사, `Cache-Control: no-store`
- reviews: `likeCount` 가 NULL 이면 키를 뺀다. `createdAt` 은 UTC ms 까지(`2026-07-18T00:00:00.000Z` — 시드의 날짜만 값과 같은 순간)
- terms: 시드의 id 12 두 개를 그대로
- 요약 `/api/shoes/{id}/summary`: 프롬프트 글자 단위로 같게, 공감 순(stable), 리뷰 3개 미만이면 `reason`, 리뷰 수가 같으면 캐시, 실패면 `reason`. 헤더는 `ACAO *` · `no-store` 만(json-server 앞에서 응답)
- SPA: `dist` 의 파일, 없으면 index.html(없는 `/assets/*.js` 도). `Cache-Control: public, max-age=0`

## json-server 와 다른 것 (기준선에 없고 프런트가 쓰지 않는 경우)

| 경우 | json-server | 여기 |
|---|---|---|
| 모르는 필드(POST · PATCH) | 그대로 저장 · 응답 | 버린다 |
| 타입이 다른 값(숫자 칸에 문자열) | 그대로 저장 | 400 `{}` |
| 없는 신발의 리뷰(POST · PATCH) | 받는다 | 400 `{}` (FK) |
| PUT 에서 빠진 필드 | 키가 사라진다 | null — NOT NULL 칸이면 500 `{}` |
| POST review 에 createdAt 없음 | 키 없이 저장 | 지금 시각 |
| reviews `liked` | 키가 없을 수 있다 | 늘 낸다(없음 = false) |
| terms 쓰기 | 받는다 | 405 |
| `_page`(Link) · `_embed` · `_expand` · `/api/db` | 있다 | 없다(404 또는 무시) |
| BASE_PATH 가 있을 때 | `/api` 를 BASE 아래와 루트 양쪽에서 받는다 | context-path 아래에서만(웹 터미널용 — 클러스터는 BASE_PATH 없음) |
| `/actuator/health/*` | 없다(SPA index.html) | probes 용 |
| 상태줄 · `Vary` 표기 | `200 OK`, `Origin, Accept-Encoding` | `200`, `origin,accept-encoding` — 의미는 같다 |
| 동시 쓰기 | 한 프로세스가 차례로 | JVM 안에서는 잠금. Pod 가 둘이면 id 충돌이 500 으로 드러난다 |
