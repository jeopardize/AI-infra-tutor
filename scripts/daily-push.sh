#!/usr/bin/env bash
# 每日 9 点推送脚本 —— 由 crontab 调用。
# 优先调用本地 Next 服务的 HTTP API；服务不可用时退出码非 0。
set -u

HOST="${DAILY_PUSH_HOST:-http://127.0.0.1:3000}"
LOG="${DAILY_PUSH_LOG:-$HOME/logs/daily-push.log}"
mkdir -p "$(dirname "$LOG")"

echo "[$(date '+%F %T')] daily-push start" >> "$LOG"

for i in 1 2 3; do
  resp=$(curl -s -m 120 -X POST "$HOST/api/notify/daily-push" 2>&1)
  code=$?
  echo "[$(date '+%F %T')] attempt=$i http=$code resp=$resp" >> "$LOG"
  if [ $code -eq 0 ] && echo "$resp" | grep -q '"ok":true'; then
    exit 0
  fi
  sleep 20
done

echo "[$(date '+%F %T')] daily-push FAILED after 3 attempts" >> "$LOG"
exit 1
