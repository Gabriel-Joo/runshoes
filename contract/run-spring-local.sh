#!/usr/bin/env bash
# Spring 백엔드를 시드 상태에서 띄워 계약 시나리오를 녹화하고 Node 기준선과 비교한다(로컬, Phase 2~3).
#   contract/run-spring-local.sh            # 본 시나리오 50건
#   contract/run-spring-local.sh summary    # 요약 9건 — mock-ollama(:3109)를 같이 띄운다. 진짜 Ollama 는 부르지 않는다
#   contract/run-spring-local.sh search     # 검색 24건 — json-server 에 없던 기능이라 기준선은 Spring 녹화(baseline/spring-search)
#   IMAGE=runshoes:phase4 contract/run-spring-local.sh   # jar 대신 만든 이미지로(Phase 4 게이트)
# 먼저 backend/target/runshoes-0.1.0.jar 와 dist/(yarn build)를 만든다(backend/README.md). MySQL 은 docker compose(:3307), 앱은 :3200.
# 시나리오가 쓰기를 섞으므로 매번 DB 를 비우고(compose down -v) Flyway 시드부터 시작한다.
# 같은 호스트의 다른 작업을 밀지 않게 컨테이너 CPU 를 낮게 잡는다(cpu-shares 2, nice 19).
set -euo pipefail
cd "$(dirname "$0")/.."
SET=${1:-main}
OUT=contract/run/spring${SET/main/}
[ "$SET" != main ] && OUT=contract/run/spring-$SET
JAR=backend/target/runshoes-0.1.0.jar
if [ -z "${IMAGE:-}" ]; then
  [ -f "$JAR" ] || { echo "$JAR 가 없다 — 먼저 빌드"; exit 2; }
  [ -f dist/index.html ] || { echo "dist/ 가 없다 — 먼저 yarn build(SPA 시나리오 21~23)"; exit 2; }
fi

cleanup() {
  docker stop runshoes-spring-dev >/dev/null 2>&1 || true
  [ -n "${MOCK_PID:-}" ] && kill "$MOCK_PID" 2>/dev/null || true
}
trap cleanup EXIT

docker compose down -v >/dev/null 2>&1
docker compose up -d >/dev/null 2>&1
until [ "$(docker inspect -f '{{.State.Health.Status}}' runshoes-mysql-dev)" = healthy ]; do sleep 1; done

OLLAMA=http://127.0.0.1:9            # 본 시나리오는 Ollama 를 부르지 않는다 — 부르면 바로 실패하게 닫힌 포트
# 로그인(V3~) — 녹화마다 새로 만든 임시 값. Secret runshoes-auth 와 상관없다
JWT_SECRET=${JWT_SECRET:-$(openssl rand -base64 48)}
if [ "$SET" = summary ]; then
  node contract/mock-ollama.mjs 3109 >/dev/null 2>&1 & MOCK_PID=$!
  OLLAMA=http://127.0.0.1:3109
fi

if [ -n "${IMAGE:-}" ]; then
  # Phase 4 — 만든 이미지 그대로(정적 파일 · 사용자 · ENTRYPOINT 까지). 메모리는 클러스터 limit(1Gi)과 같게
  docker run -d --rm --name runshoes-spring-dev --network host --cpus=2 --cpu-shares=2 --memory=1g \
    -e SERVER_PORT=3200 -e OLLAMA_URL="$OLLAMA" -e JWT_SECRET="$JWT_SECRET" "$IMAGE" >/dev/null
else
  docker run -d --rm --name runshoes-spring-dev --network host --cpus=2 --cpu-shares=2 --user "$(id -u):$(id -g)" \
    -e HOME=/tmp -e TZ=UTC -e SERVER_PORT=3200 -e OLLAMA_URL="$OLLAMA" -e JWT_SECRET="$JWT_SECRET" -e APP_STATIC=/static \
    -v "$PWD/backend/target":/app:ro -v "$PWD/dist":/static:ro \
    maven:3.9-eclipse-temurin-21 nice -n 19 java -XX:MaxRAMPercentage=65 -jar /app/runshoes-0.1.0.jar >/dev/null
fi
for i in $(seq 1 90); do
  curl -sf -o /dev/null http://127.0.0.1:3200/actuator/health/readiness && break
  docker ps -q -f name=runshoes-spring-dev | grep -q . || { echo "Spring 이 죽었다"; exit 1; }
  sleep 1
done

rm -rf "$OUT"
if [ "$SET" = summary ]; then
  node contract/record.mjs --base http://127.0.0.1:3200 --host runshoes.ronanlab.dev --set summary --mock http://127.0.0.1:3109 --out "$OUT" >/dev/null
  node contract/diff.mjs contract/baseline/node-summary "$OUT"
elif [ "$SET" = search ]; then
  node contract/record.mjs --base http://127.0.0.1:3200 --host runshoes.ronanlab.dev --set search --out "$OUT" >/dev/null
  node contract/diff.mjs contract/baseline/spring-search "$OUT"
else
  node contract/record.mjs --base http://127.0.0.1:3200 --host runshoes.ronanlab.dev --out "$OUT" >/dev/null
  node contract/diff.mjs contract/baseline/node "$OUT"
fi
