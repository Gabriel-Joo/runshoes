#!/usr/bin/env bash
# 텔레그램 알림 — scripts/notify-telegram.sh "제목" "핵심 줄" …  → "[런슈즈] 제목\n핵심 줄\n…"
# 토큰 · chat_id 는 저장소 맨 위 .env.telegram(git 밖, .gitignore .env*)에서 읽는다. 토큰이 든 주소는 출력하지 않는다
set -euo pipefail
ENV_FILE="$(cd "$(dirname "$0")/.." && pwd)/.env.telegram"
[ -f "$ENV_FILE" ] || { echo "알림 설정이 없다: $ENV_FILE" >&2; exit 2; }
set -a; . "$ENV_FILE"; set +a
[ $# -ge 1 ] || { echo "사용법: $0 제목 [줄 …]" >&2; exit 2; }
text="[런슈즈] $1"; shift
for line in "$@"; do text+=$'\n'"$line"; done
code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 \
  --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" --data-urlencode "text=${text}" \
  "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" 2>/dev/null) || code=000
[ "$code" = 200 ] && echo "알림 보냄" || { echo "알림 실패(HTTP $code)" >&2; exit 1; }
