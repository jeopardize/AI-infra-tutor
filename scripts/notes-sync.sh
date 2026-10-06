#!/usr/bin/env bash
# 笔记库每日兜底同步：网页写入时的 push 失败可在此补推（crontab 每天 22:30）
# NOTES_DIR 即应用的数据/笔记 git 仓库（作业库）。
set -u
NOTES_DIR="${NOTES_DIR:-$HOME/apps/data}"
LOG="${NOTES_SYNC_LOG:-$HOME/logs/notes-sync.log}"
mkdir -p "$(dirname "$LOG")"
echo "[$(date '+%F %T')] notes-sync start" >> "$LOG"
cd "$NOTES_DIR" || exit 1
git pull --ff-only origin HEAD >> "$LOG" 2>&1 || echo "[$(date '+%F %T')] pull failed (keep local)" >> "$LOG"
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git -c user.name=ai-infra-tutor -c user.email=bot@ai-infra-tutor.local commit -m "notes: daily sync $(date +%F)" >> "$LOG" 2>&1
fi
for i in 1 2 3; do
  if git push origin HEAD >> "$LOG" 2>&1; then
    echo "[$(date '+%F %T')] push ok" >> "$LOG"; exit 0
  fi
  sleep 30
done
echo "[$(date '+%F %T')] push FAILED after 3 attempts" >> "$LOG"
exit 1
