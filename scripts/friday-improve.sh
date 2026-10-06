#!/usr/bin/env bash
# 每周五自动化流水线（crontab 触发，需先 source .env 提供 Anthropic key）
# 流程：预检 → 读取反馈并让 LLM 润色代码（tsc+build 校验，失败回滚）→ 推 GitHub
#       → 数据迁移（题库/简历/反馈/笔记 push）→ 重启部署 → 标记反馈已处理
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${FRIDAY_LOG:-$HOME/logs/friday-improve.log}"
mkdir -p "$(dirname "$LOG")"
echo "[$(date '+%F %T')] friday-improve start" >> "$LOG"

# 自包含：加载项目环境变量（Anthropic key 等）到子进程环境
set -a
# shellcheck disable=SC1091
[ -f "$REPO/.env" ] && . "$REPO/.env"
set +a

run() { echo "[$(date '+%F %T')] $1" >> "$LOG"; "$@" >> "$LOG" 2>&1; }

cd "$REPO" || exit 1

# 1. 编辑+校验+推代码（node 脚本内部失败会回滚并退出非 0）
if ! run node "$REPO/scripts/friday-improve.cjs" --step edit; then
  echo "[$(date '+%F %T')] edit failed, pipeline aborted" >> "$LOG"; exit 1; fi

# 2. 数据迁移：推送数据仓库（题目/简历/反馈/笔记，写时未推成功的在此补推）
run bash "$REPO/scripts/notes-sync.sh"

# 3. 部署：重启服务（build 已在校验阶段完成）
if [ -x "$(command -v npx)" ]; then
  run npx pm2 restart ai-tutor-web
fi

# 4. 标记反馈为已处理（随后随第 6 步一起由下轮推送？不——立即再推一次数据仓库）
PENDING="$HOME/apps/data/question-bank/friday-pending.json"
if [ -f "$PENDING" ]; then
  SUMMARY=$(node -e "try{console.log(require('$PENDING').summary)}catch(e){console.log('')}")
  COUNT=$(node -e "try{console.log(require('$PENDING').count||0)}catch(e){console.log('0')}")
  if ! run node "$REPO/scripts/friday-improve.cjs" --step mark --summary "$SUMMARY"; then
    echo "[$(date '+%F %T')] mark failed" >> "$LOG"
  fi
  run bash "$REPO/scripts/notes-sync.sh"
  LAST=$(echo "$COUNT" | tr -d ' ')
cat >> "$LOG" <<EOF
[$(date '+%F %T')] friday-improve done: $LAST feedback item(s) processed — $SUMMARY
EOF
fi
exit 0
