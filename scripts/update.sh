#!/usr/bin/env bash
# 服务器更新流水线（蓝绿零停机版）。
#
# 架构：
#   ~/apps/current          → 指向当前生产目录的符号链接（pm2 以此为 cwd）
#   ~/apps/AI-infra-tutor / AI-infra-tutor-next   两套目录蓝绿轮换
#   ~/apps/app.env          服务环境变量快照（KNOWLEDGE_LIBRARY_PATH 等）
#   ~/apps/ai-tutor-run.sh  稳定启动入口：source env 后 cd ~/apps/current 启动
#
# 流程（构建/装依赖全程不动线上服务）：
#   1. 维护「镜像工作目录」~/apps/deploy-work：git fetch + reset origin/main + release.cjs
#   2. node_modules 与线上目录硬链接复用，锁文件变化时增量 npm install（不停服务）
#   3. 试运行（备用端口）验证新构建可启动、页面 200 后，才允许切换
#   4. 切换：current 符号链接指向新目录 + pm2 restart（秒级中断）
#   5. 健康检查失败 → 自动回滚到旧目录并再次 restart
#   6. notes-sync 数据同步 + 迁移报告（与旧版一致）
#
# 用法：  bash scripts/update.sh
# 日志：  ~/logs/update.log（轮询 "update.sh done, health=200"）
set -u
LIVE="$HOME/apps/AI-infra-tutor"        # 主目录（保留；首次运行从中引导）
CUR="$HOME/apps/current"                # 生产目录符号链接
WORK="$HOME/apps/deploy-work"           # 构建工作目录（与生产解耦）
ENVF="$HOME/apps/app.env"
RUNSH="$HOME/apps/ai-tutor-run.sh"
LOG="${UPDATE_LOG:-$HOME/logs/update.log}"
HOST="${HOST:-http://127.0.0.1:8001}"
APP="ai-tutor-web"
BUILD=1
for arg in "$@"; do case "$arg" in --no-build) BUILD=0 ;; esac; done
mkdir -p "$HOME/apps" "$(dirname "$LOG")"
say() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }
fail() { say "ERROR: $*"; exit 1; }
say "===== update.sh(blue-green) start ====="
health() { curl -s -o /dev/null -w "%{http_code}" -m 8 "$HOST/" 2>/dev/null || echo 000; }

# ---------- 0. 工作目录 ----------
if [ ! -d "$WORK/.git" ]; then
  say "初始化构建工作目录（本地硬链接 clone）：$WORK"
  rm -rf "$WORK"
  git clone --local "$HOME/apps/current/.git" "$WORK" >> "$LOG" 2>&1 || fail "clone 失败"
fi

# ---------- 1. 同步代码 ----------
cd "$WORK" || exit 1
git fetch origin >> "$LOG" 2>&1 || fail "git fetch 失败"
if git diff --quiet HEAD origin/main 2>/dev/null; then
  say "代码无变化"
else
  git reset --hard origin/main >> "$LOG" 2>&1 || fail "git reset 失败"
  say "代码已重置到 origin/main"
fi
# release.cjs 在工作目录内 bump 版本号 + 追加更新日志（不提交；下次 reset 时重算）
node "$WORK/scripts/release.cjs" >> "$LOG" 2>&1 || say "WARN: release.cjs 失败，继续"

# ---------- 2. 依赖 ----------
ensure_swap() {
  if ! swapon --show 2>/dev/null | grep -q swapfile; then
    if [ ! -f /swapfile ]; then
      say "创建 4G swap（低内存实例保护）"
      sudo fallocate -l 4G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=4096 status=none
      sudo chmod 600 /swapfile && sudo mkswap /swapfile >/dev/null 2>&1
      sudo swapon /swapfile 2>/dev/null || say "WARN: swap 启用失败"
    else
      sudo swapon /swapfile 2>/dev/null || true
    fi
  fi
}
ensure_swap
sudo pkill -9 -f "npm install" >/dev/null 2>&1 || true

DEPLOYED_DIR="$(readlink "$CUR" 2>/dev/null || echo "$HOME/apps/AI-infra-tutor")"
cd "$WORK" || exit 1
if [ ! -d node_modules ] && [ -d "$DEPLOYED_DIR/node_modules" ]; then
  say "硬链接复用线上 node_modules"
  cp -al "$DEPLOYED_DIR/node_modules" ./node_modules >> "$LOG" 2>&1 \
    && echo cloned > node_modules/.lockfile-hash.tmp \
    || say "WARN: cp -al 失败，改走 npm install"
fi

LOCK_HASH="$(git hash-object package-lock.json 2>/dev/null || echo none)"
NPM_INSTALL="npm install --force --prefer-offline --no-audit --registry=https://registry.npmmirror.com"
if [ -d node_modules ]; then
  if [ "$(cat node_modules/.lockfile-hash 2>/dev/null)" = "$LOCK_HASH" ]; then
    say "依赖无变化，跳过安装"
  else
    say "依赖有变化，执行增量 npm install（服务不停）"
    export NODE_OPTIONS="--max-old-space-size=1024"
    $NPM_INSTALL >> "$LOG" 2>&1 || fail "npm install 失败（线上服务不受影响）"
    echo "$LOCK_HASH" > node_modules/.lockfile-hash
    rm -f node_modules/.lockfile-hash.tmp
  fi
else
  say "node_modules 缺失，执行 npm ci --force（服务不停）"
  npm ci --force --prefer-offline --no-audit --registry=https://registry.npmmirror.com >> "$LOG" 2>&1 || fail "npm ci 失败"
  echo "$LOCK_HASH" > node_modules/.lockfile-hash
fi

# ---------- 3. 构建（服务不停） ----------
if [ "$BUILD" = 1 ]; then
  export NODE_OPTIONS="--max-old-space-size=1024"
  say "在工作目录执行 build（线上服务不受影响）"
  if ! npm run build >> "$LOG" 2>&1; then
    say "WARN: build 失败，以更小内存重试一次"
    export NODE_OPTIONS="--max-old-space-size=768"
    if ! npm run build >> "$LOG" 2>&1; then
      fail "build 重试仍失败（线上服务未动，仍为 $DEPLOYED_DIR）"
    fi
  fi
fi

# ---------- 4. 数据仓库先同步 ----------
bash "$WORK/scripts/notes-sync.sh" >> "$LOG" 2>&1 || say "WARN: notes-sync 失败，继续"

# ---------- 5. 试运行新构建（备用端口，不动 8001） ----------
say "试运行新构建（工作目录，备用端口 18001）"
if [ ! -f "$ENVF" ] && npx --prefix "$WORK" pm2 describe "$APP" --no-color >/dev/null 2>&1; then
  # 从现有 pm2 应用导出环境变量快照（KNOWLEDGE_LIBRARY_PATH 等），供稳定入口使用
  npx --prefix "$WORK" pm2 env 0 | grep -E "^(export )?[A-Z][A-Z0-9_]*=" | sed 's/^export //' > ~/apps/app.env.new 2>/dev/null \
    && mv "$HOME/apps/app.env.new" "$ENVF" \
    && say "已固化环境变量快照 → $ENVF"
fi
TEST_PORT=18001
pkill -f "next start.*$TEST_PORT" >/dev/null 2>&1 || true
( cd "$WORK" && set -a; [ -f "$ENVF" ] && . "$ENVF" || true; set +a; timeout 40 npx next start -p "$TEST_PORT" >> "$LOG" 2>&1 & ) >/dev/null 2>&1
sleep 14
TEST_CODE="$(curl -s -o /dev/null -w "%{http_code}" -m 8 "http://127.0.0.1:$TEST_PORT/" 2>/dev/null || echo 000)"
pkill -f "next start.*$TEST_PORT" >/dev/null 2>&1 || true
if [ "$TEST_CODE" != "200" ]; then
  fail "新构建试运行失败（health=$TEST_CODE）——线上服务未切换"
fi
say "试运行通过（health=$TEST_CODE），切换"

# ---------- 6. 切换 + 重启（秒级中断，失败自动回滚） ----------
env_app_cwd() {
  npx pm2 jlist 2>/dev/null | python3 -c "
import json,sys
try:
    apps=json.load(sys.stdin)
except Exception:
    print(''); raise SystemExit
for a in apps:
    if a.get('name')=='$APP':
        print(a.get('pm2_env',{}).get('pm_cwd',''))
        break
" 2>/dev/null
}
switch() {
  local cwd; cwd="$(env_app_cwd)"
  if [ -n "$cwd" ] && [ "$cwd" != "$CUR" ]; then
    # 一次性迁移：pm2 从旧的固定目录改挂稳定入口（cwd=~/apps/current，start 脚本逐次解析符号链接）
    say "pm2 入口迁移：$cwd → $RUNSH（cwd=$CUR，配合 current 符号链接实现蓝绿）"
    printf '#!/usr/bin/env bash\nset -a\n[ -f "$HOME/apps/app.env" ] && . "$HOME/apps/app.env"\nset +a\nexport NODE_ENV=production\ncd "$HOME/apps/current"\nexec npx next start -p 8001\n' > "$RUNSH"
    chmod +x "$RUNSH"
    npx pm2 delete "$APP" >> "$LOG" 2>&1 || true
    ( cd "$CUR" && npx pm2 start "$RUNSH" --interpreter bash --name "$APP" >> "$LOG" 2>&1 ) \
      && npx pm2 save >> "$LOG" 2>&1 \
      || say "WARN: pm2 重新注册失败，回滚检查将继续"
  else
    pm2_restart
  fi
}
pm2_restart() { npx pm2 restart "$APP" >> "$LOG" 2>&1; }

PREV_DIR="$(readlink "$CUR" 2>/dev/null || echo "$HOME/apps/AI-infra-tutor")"
ln -sfn "$WORK" "$CUR"
switch
for i in $(seq 1 15); do
  CODE="$(health)"
  [ "$CODE" = "200" ] && break
  sleep 2
done
if [ "$CODE" != "200" ]; then
  say "ERROR: 切换后 health=$CODE → 回滚到 $PREV_DIR"
  ln -sfn "$PREV_DIR" "$CUR"
  pm2_restart
  sleep 4
  say "回滚完成 health=$(health)"
  exit 1
fi
say "已切换到新版本（秒级中断），health=$CODE"

# ---------- 7. 迁移报告 ----------
sleep 3
MIGRATE="$(curl -sS -m 60 -X POST "$HOST/api/admin/migrate" 2>&1 || echo curl-failed)"
say "迁移报告: $MIGRATE"
say "update.sh done, health=200"
