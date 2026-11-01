#!/usr/bin/env bash
# 本地驱动的零停机部署（替代服务端 update.sh 构建；小程序服务器内存极小，不在服务器上构建）。
#
# 架构（服务器端）：
#   ~/apps/node_modules.live   唯一的依赖目录（两套目录内的 node_modules 都是它的软链）
#   ~/apps/AI-infra-tutor      目录 A
#   ~/apps/AI-infra-tutor-next 目录 B（蓝绿轮换）
#   ~/apps/current             符号链接 → 当前在线目录（pm2 的 cwd 固定为 ~/apps/current）
#   ~/apps/ai-tutor-run.sh     pm2 稳定入口：cd ~/apps/current 起 next start（.env 在目录内）
#
# 流程：
#   1. 本地 next build（macOS 构建产物平台无关，服务器试运行验证）
#   2. rsync .next/public/package*.json 到服务器「备用目录」
#   3. 备用目录试运行（18001 端口）确认 200
#   4. current 符号链接切到备用目录 + pm2 restart（秒级中断）
#   5. 健康检查失败自动回滚到旧目录
#
# 用法： bash scripts/deploy.sh [--skip-build]
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"
SERVER="${DEPLOY_SERVER:-admin@8.133.160.251}"
PORT="${DEPLOY_PORT:-8001}"
SSH="ssh -o ConnectTimeout=20 $SERVER"
SKIP_BUILD=0
for arg in "$@"; do case "$arg" in --skip-build) SKIP_BUILD=1 ;; esac; done

say() { echo "[$(date '+%F %T')] $*"; }
fail() { say "ERROR: $*"; exit 1; }

# ---------- 1. 本地构建 ----------
if [ "$SKIP_BUILD" = 0 ]; then
  say "本地构建…"
  npm run build >/tmp/deploy-build.log 2>&1 || { tail -20 /tmp/deploy-build.log; fail "build 失败"; }
  say "build 完成"
else
  say "跳过本地构建"
  [ -d .next ] || fail "本地无 .next 且 --skip-build"
fi
[ -f .next/BUILD_ID ] || fail ".next/BUILD_ID 缺失，构建不完整"

# ---------- 2. 探测服务器目录状态 ----------
read -r T O < <(
  ssh -o ConnectTimeout=20 "$SERVER" 'T=$(readlink ~/apps/current 2>/dev/null || echo ~/apps/AI-infra-tutor); case "$T" in */AI-infra-tutor) O=$HOME/apps/AI-infra-tutor-next ;; *) O=$HOME/apps/AI-infra-tutor ;; esac; echo "${T/#\~/$HOME} $O"'
) || fail "探测失败"
say "在线目录=$T ; 备用目录=$O"

# 备用目录就绪：本目录保留真实 node_modules（node 解析 next 自引用需真实目录；
# 变更为硬链接互拷，M+B 同 inode 不占额外磁盘）+ .env 从在线目录继承
$SSH "$(cat <<EOS
mkdir -p $O
if [ ! -d $O/node_modules ]; then
  cp -al $T/node_modules $O/node_modules
fi
[ -f $O/.env ] || cp $T/.env $O/.env
# 极少数情形（依赖有变化）才需要在服务器上增量安装——同步完成后再继续
if ! diff -q $O/package-lock.json $T/package-lock.json >/dev/null 2>&1 && [ ! -f $O/.lock-synced ]; then
  echo "package-lock 有变化：在备用目录执行增量 npm install（不影响在线服务）"
  cd $O && NODE_OPTIONS=--max-old-space-size=768 npm install --force --prefer-offline --no-audit --registry=https://registry.npmmirror.com 2>&1 | tail -2
  touch $O/.lock-synced
fi
true
EOS
)" >/dev/null 2>&1 || fail "备用目录准备失败"

# ---------- 3. rsync 产物（.next、public、package 描述文件；不含 .env/node_modules/源码） ----------
say "rsync 产物 → 备用目录…"
rsync -az --delete .next/ "$SERVER:$O/.next/" || fail "rsync .next 失败"
rsync -az --delete public/ "$SERVER:$O/public/" 2>/dev/null || true
rsync -az package.json package-lock.json next.config.ts "$SERVER:$O/" || fail "rsync 配置失败"
ssh -o ConnectTimeout=20 "$SERVER" "touch $O/.env" # .env 已从在线目录继承；确保存在

# ---------- 4. 服务器试运行（18001 端口，不动 8001） ----------
say "服务器试运行（备用目录，18001）…"
$SSH "bash \$HOME/apps/test-stage.sh $O" || { say "试运行失败：新构建不适合服务器，线上服务未动"; exit 1; }
say "试运行通过"

# ---------- 5. 切换 + 健康检查（失败回滚） ----------
say "切换 current → $O 并重启…"
$SSH "$(cat <<EOS
ln -sfn $O ~/apps/current
npx pm2 restart ai-tutor-web >/dev/null 2>&1 || echo pm2-restart-warn
for i in \$(seq 1 15); do
  C=\$(curl -s -o /dev/null -w '%{http_code}' -m 8 http://127.0.0.1:$PORT/ 2>/dev/null || echo 000)
  [ "\$C" = 200 ] && break
  sleep 2
done
echo NEW_HEALTH=\$C
if [ "\$C" != 200 ]; then
  echo rollback to $T
  ln -sfn $T ~/apps/current
  npx pm2 restart ai-tutor-web >/dev/null 2>&1 || true
  sleep 4
  echo ROLLBACK_HEALTH=\$(curl -s -o /dev/null -w '%{http_code}' -m 8 http://127.0.0.1:$PORT/ || echo 000)
  exit 9
fi
echo "[\$(date '+%F %T')] deploy.sh done, health=200 (target=$O)" >> \$HOME/logs/update.log
EOS
)" || { say "切换失败（已回滚）"; exit 1; }
say "部署完成，health=200"
