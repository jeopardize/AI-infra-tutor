#!/usr/bin/env bash
# 服务器更新/升级流水线：每周日 05:00 由 crontab 自动触发，也可手动运行。
#
# 用法：
#   bash scripts/update.sh                 # 完整更新（拉代码 → 发版 → 装依赖 → 构建）
#   bash scripts/update.sh --no-pull       # 跳过 git pull（本地已是最新时）
#   bash scripts/update.sh --no-build      # 跳过构建
#
# 流程（保证每次升级都先迁移数据并同步 git 仓库，再重启服务）：
#   1. git pull 拉最新代码
#   2. release.cjs 依据新提交自动发新版本（bump 版本号 + 更新版本更新日志）
#   3. package-lock 变化时 npm ci 重装依赖
#   4. npm run build 构建
#   5. notes-sync.sh 先同步数据 git 仓库（题库/反馈/进度/笔记），保证已有数据先入 git
#   6. pm2 restart 重启服务（启动时 instrumentation 自动执行数据迁移）
#   7. curl /api/admin/migrate 拿迁移报告写日志
set -u
REPO="$(cd "$(dirname "$0")/.." && pwd)"
LOG="${UPDATE_LOG:-$HOME/logs/update.log}"
HOST="${DAILY_PUSH_HOST:-http://127.0.0.1:8001}"
PULL=1; BUILD=1
for arg in "$@"; do
  case "$arg" in
    --no-pull) PULL=0 ;;
    --no-build) BUILD=0 ;;
  esac
done
mkdir -p "$(dirname "$LOG")"
say() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }
say "===== update.sh start (pull=$PULL build=$BUILD) ====="

cd "$REPO" || exit 1

# 1. 拉代码
if [ "$PULL" = 1 ]; then
  if ! git pull --ff-only origin main >> "$LOG" 2>&1; then
    say "ERROR: git pull --ff-only 失败（本地可能有未提交修改），中止。请手动处理后重跑"
    git status --porcelain >> "$LOG" 2>&1
    exit 1
  fi
fi

# 2. 自动发版（有新提交时 bump 版本号 + 追加更新日志）
node "$REPO/scripts/release.cjs" >> "$LOG" 2>&1 || say "WARN: release.cjs 失败，继续更新流程"

# 3. 依赖：package-lock 变化时重装
LOCK_HASH="$(git hash-object package-lock.json 2>/dev/null || echo none)"
if [ ! -f node_modules/.lockfile-hash ] || [ "$(cat node_modules/.lockfile-hash 2>/dev/null)" != "$LOCK_HASH" ]; then
  say "依赖有变化，执行 npm ci --force"
  if ! npm ci --force --registry=https://registry.npmmirror.com >> "$LOG" 2>&1; then
    say "ERROR: npm ci 失败，中止"; exit 1
  fi
  echo "$LOCK_HASH" > node_modules/.lockfile-hash
else
  say "依赖无变化，跳过 npm ci"
fi

# 4. 构建
if [ "$BUILD" = 1 ]; then
  if ! npm run build >> "$LOG" 2>&1; then
    say "ERROR: build 失败，中止（保持旧版本运行）"; exit 1
  fi
fi

# 5. 先迁移数据并同步 git 仓库（题库/反馈/进度/笔记 push，写时未推成功的在此补推）
bash "$REPO/scripts/notes-sync.sh" >> "$LOG" 2>&1 || say "WARN: notes-sync 失败，继续"

# 6. 重启服务（启动时 instrumentation.ts 自动执行数据迁移）
if [ -x "$(command -v npx)" ]; then
  npx pm2 restart ai-tutor-web >> "$LOG" 2>&1 || say "ERROR: pm2 restart 失败"
fi

# 7. 迁移报告
sleep 3
MIGRATE="$(curl -sS -m 60 -X POST "$HOST/api/admin/migrate" 2>&1 || echo curl-failed)"
say "迁移报告: $MIGRATE"

# 健康检查
CODE="$(curl -s -o /dev/null -w "%{http_code}" -m 15 "$HOST/" 2>/dev/null || echo 000)"
say "update.sh done, health=$CODE"
[ "$CODE" = "200" ] || exit 1
