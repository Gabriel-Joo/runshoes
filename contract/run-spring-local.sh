#!/usr/bin/env bash
# Spring 백엔드를 시드 상태에서 띄워 계약 시나리오를 녹화하고 Node 기준선과 비교한다(로컬, Phase 2~3).
#   contract/run-spring-local.sh            # 본 시나리오 50건
#   contract/run-spring-local.sh summary    # 요약 9건 — mock-ollama(:3109)를 같이 띄운다. 진짜 Ollama 는 부르지 않는다
# 먼저 backend/target/runshoes-0.1.0.jar 와 dist/(yarn build)를 만든다(backend/README.md). MySQL 은 docker compose(:3307), 앱은 :3200.
# 시나리오가 쓰기를 섞으므로 매번 DB 를 비우고(compose down -v) Flyway 시드부터 시작한다.
# 같은 호스트의 다른 작업을 밀지 않게 컨테이너 CPU 를 낮게 잡는다(cpu-shares 2, nice 19).
set -euo pipefail
cd "$(dirname "$0")/.."
SET=${1:-main}
OUT=contract/run/spring${SET/main/}
[ "$SET" = summary ] && OUT=contract/run/spring-summary
JAR=backend/target/runshoes-0.1.0.jar
[ -f "$JAR" ] || { echo "$JAR 가 없다 — 먼저 빌드"; exit 2; }
[ -f dist/index.html ] || { echo "dist/ 가 없다 — 먼저 yarn build(SPA 시나리오 21~23)"; exit 2; }

cleanup() {
  docker stop runshoes-spring-dev >/dev/null 2>&1 || true
  [ -n "${MOCK_PID:-}" ] && kill "$MOCK_PID" 2>/dev/null || true
}
trap cleanup EXIT

docker compose down -v >/dev/null 2>&1
docker compose up -d >/dev/null 2>&1
until [ "$(docker inspect -f '{{.State.Health.Status}}' runshoes-mysql-dev)" = healthy ]; do sleep 1; done

OLLAMA=http://127.0.0.1:9            # 본 시나리오는 Ollama 를 부르지 않는다 — 부르면 바로 실패하게 닫힌 포트
if [ "$SET" = summary ]; then
  node contract/mock-ollama.mjs 3109 >/dev/null 2>&1 & MOCK_PID=$!
  OLLAMA=http://127.0.0.1:3109
fi

docker run -d --rm --name runshoes-spring-dev --network host --cpus=2 --cpu-shares=2 --user "$(id -u):$(id -g)" \
  -e HOME=/tmp -e TZ=UTC -e SERVER_PORT=3200 -e OLLAMA_URL="$OLLAMA" -e APP_STATIC=/static \
  -v "$PWD/backend/target":/app:ro -v "$PWD/dist":/static:ro \
  maven:3.9-eclipse-temurin-21 nice -n 19 java -XX:MaxRAMPercentage=65 -jar /app/runshoes-0.1.0.jar >/dev/null
for i in $(seq 1 90); do
  curl -sf -o /dev/null http://127.0.0.1:3200/actuator/health/readiness && break
  docker ps -q -f name=runshoes-spring-dev | grep -q . || { echo "Spring 이 죽었다"; exit 1; }
  sleep 1
done

rm -rf "$OUT"
if [ "$SET" = summary ]; then
  node contract/record.mjs --base http://127.0.0.1:3200 --host runshoes.ronanlab.dev --set summary --mock http://127.0.0.1:3109 --out "$OUT" >/dev/null
  node contract/diff.mjs contract/baseline/node-summary "$OUT"
else
  node contract/record.mjs --base http://127.0.0.1:3200 --host runshoes.ronanlab.dev --out "$OUT" >/dev/null
  node contract/diff.mjs contract/baseline/node "$OUT"
fi
