#!/usr/bin/env bash
# 운영 적재 — scripts/load-prod.sh [--apply] [load.mjs 인자 …]   (catalog/load.mjs 를 운영 VIP 로)
#   인자 없음: 건조 실행(읽기만, 비밀번호를 읽지 않는다)
#   --apply  : 관리자 비밀번호를 Secret runshoes-auth 에서 이 스크립트 안에서만 읽어 적재기 환경변수로 넘긴다 — 명령줄 · 출력에 드러나지 않는다.
#              적재기는 먼저 관리 화면 수정을 decisions.json 으로 옮긴다. 끝나면 적재 기록을 백업 폴더(권한 600)에 두고 다시 건조 실행해 0건인지 본다
#   그 밖의 인자(--only · --limit · --revert …)는 load.mjs 로 그대로 넘긴다. --base · --host 는 이 스크립트가 정한다
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MK="$HOME/k8s-cluster/backup/2026-10-15-before-metallb/mk"
BASE=http://192.168.122.240
HOST=runshoes.ronanlab.dev
BACKUP="$HOME/k8s-cluster/backup/$(date +%F)-runshoes-load"
cd "$ROOT/catalog"

apply=0
args=()
for a in "$@"; do
  case "$a" in
    --apply) apply=1 ;;
    --base|--host|--base=*|--host=*) echo "--base · --host 는 정해져 있다(운영 $BASE · $HOST)" >&2; exit 2 ;;
    *) args+=("$a") ;;
  esac
done

if [ "$apply" = 0 ]; then
  exec node load.mjs --base "$BASE" --host "$HOST" "${args[@]}"
fi

[ -x "$MK" ] || { echo "클러스터 접속 래퍼가 없다: $MK" >&2; exit 2; }
ADMIN_PASSWORD="$("$MK" 'kubectl -n runshoes get secret runshoes-auth -o jsonpath={.data.ADMIN_PASSWORD}' | base64 -d)"
[ -n "$ADMIN_PASSWORD" ] || { echo "관리자 비밀번호를 읽지 못했다(Secret runshoes-auth)" >&2; exit 1; }
export ADMIN_EMAIL=admin@runshoes.test ADMIN_PASSWORD

before=$(ls -t loads/*.json 2>/dev/null | head -1 || true)
node load.mjs --base "$BASE" --host "$HOST" --apply "${args[@]}"
unset ADMIN_PASSWORD

after=$(ls -t loads/*.json 2>/dev/null | head -1 || true)
if [ -n "$after" ] && [ "$after" != "$before" ]; then
  mkdir -p "$BACKUP" && cp "$after" "$BACKUP/" && chmod 600 "$BACKUP"/*.json
  echo "적재 기록 → $BACKUP/$(basename "$after") (권한 600)"
fi
echo "--- 다시 건조 실행"
node load.mjs --base "$BASE" --host "$HOST" | grep '| POST' || true
