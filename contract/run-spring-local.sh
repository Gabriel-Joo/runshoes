#!/usr/bin/env bash
# Spring 백엔드를 시드 상태에서 띄워 계약 시나리오를 녹화하고 기준선과 비교한다(로컬).
#   contract/run-spring-local.sh v3          # V3(로그인) 뒤 계약 115건 — 기준선 baseline/spring-v3(읽기 R · 쓰기 W · 인증 A)
#   contract/run-spring-local.sh v4          # V4(세대 구조) 새 기능 — 기준선 baseline/spring-v4. v3 · v3-search 는 V4 키를 --allow-added 로 "추가"만 허용해 옛 기준선과 비교
#   contract/run-spring-local.sh v3-search   # 검색 24건 — 기준선 baseline/spring-v3-search
#   contract/run-spring-local.sh v3-summary  # 요약 10건 — mock-ollama(:3109). 진짜 Ollama 는 부르지 않는다. 기준선 baseline/spring-v3-summary
#   main · summary · search                 # V3 전 기준선(node · node-summary · spring-search) — 이력. V3 뒤 앱에는 맞지 않는다(작성자 · 쓰기 401)
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
# 로그인(V3~) — 녹화마다 새로 만든 임시 값. Secret runshoes-auth 와 상관없다. 비밀번호는 record.mjs 도 env 로 받는다(기록에는 <가림>)
JWT_SECRET=${JWT_SECRET:-$(openssl rand -base64 48)}
export SEED_USER_PASSWORD=${SEED_USER_PASSWORD:-seed$(openssl rand -hex 8)1} ADMIN_PASSWORD=${ADMIN_PASSWORD:-admin$(openssl rand -hex 8)2}
AUTH_ENV=(-e JWT_SECRET="$JWT_SECRET" -e SEED_USER_PASSWORD -e ADMIN_PASSWORD)
if [ "$SET" = summary ] || [ "$SET" = v3-summary ]; then
  node contract/mock-ollama.mjs 3109 >/dev/null 2>&1 & MOCK_PID=$!
  OLLAMA=http://127.0.0.1:3109
fi

if [ -n "${IMAGE:-}" ]; then
  # Phase 4 — 만든 이미지 그대로(정적 파일 · 사용자 · ENTRYPOINT 까지). 메모리는 클러스터 limit(1Gi)과 같게
  docker run -d --rm --name runshoes-spring-dev --network host --cpus=2 --cpu-shares=2 --memory=1g \
    -e SERVER_PORT=3200 -e OLLAMA_URL="$OLLAMA" "${AUTH_ENV[@]}" "$IMAGE" >/dev/null
else
  docker run -d --rm --name runshoes-spring-dev --network host --cpus=2 --cpu-shares=2 --user "$(id -u):$(id -g)" \
    -e HOME=/tmp -e TZ=UTC -e SERVER_PORT=3200 -e OLLAMA_URL="$OLLAMA" "${AUTH_ENV[@]}" -e APP_STATIC=/static \
    -v "$PWD/backend/target":/app:ro -v "$PWD/dist":/static:ro \
    maven:3.9-eclipse-temurin-21 nice -n 19 java -XX:MaxRAMPercentage=65 -jar /app/runshoes-0.1.0.jar >/dev/null
fi
for i in $(seq 1 90); do
  curl -sf -o /dev/null http://127.0.0.1:3200/actuator/health/readiness && break
  docker ps -q -f name=runshoes-spring-dev | grep -q . || { echo "Spring 이 죽었다"; exit 1; }
  sleep 1
done

# 세트 → record.mjs 의 --set 과 기준선
case "$SET" in
  main)       REC=main;       BASE=node ;;
  summary)    REC=summary;    BASE=node-summary ;;
  search)     REC=search;     BASE=spring-search ;;
  v3)         REC=v3;         BASE=spring-v3 ;;
  v3-search)  REC=search;     BASE=spring-v3-search ;;
  v3-summary) REC=summary-v3; BASE=spring-v3-summary ;;
  v4)         REC=v4;         BASE=spring-v4 ;;
  *) echo "모르는 세트: $SET"; exit 2 ;;
esac
rm -rf "$OUT"
node contract/record.mjs --base http://127.0.0.1:3200 --host runshoes.ronanlab.dev --set "$REC" --mock http://127.0.0.1:3109 --out "$OUT" | grep -E "≠ 기대|기대와 다른" || true
if [ ! -d "contract/baseline/$BASE" ]; then echo "기준선 contract/baseline/$BASE 가 없다 — 녹화만 했다: $OUT"; exit 0; fi
# V4 키 — 옛 기준선(spring-v3 · v3-search · v3-summary)은 다시 녹화하지 않고, 응답에 더해진 이 키들만 허용한다(2026-10-24)
V4_KEYS=lineKey,generation,isCurrent,gender,weightSize,specSize,measuredWeight,measuredWeightSize,measuredStackHeight,measuredDrop,measuredSource,measuredCount
# V5 키 — 정가의 출처 · 확인 날짜 · 종류(2026-10-28). 시드에서는 셋 다 null
V5_KEYS=priceSource,priceCheckedAt,priceKind
node contract/diff.mjs --allow-added="$V4_KEYS,$V5_KEYS" "contract/baseline/$BASE" "$OUT"
