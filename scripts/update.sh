#!/usr/bin/env bash
# 【已停用】服务端构建流水线 —— 部署迁移为本地构建 + 推送（零停机蓝绿）。
#
# 新流程见仓库 scripts/deploy.sh（在本机执行 `npm run deploy`）：
#   本地 next build → rsync 产物到服务器备用目录 → 服务器 18001 端口试运行验证
#   → current 符号链接切换 + pm2 restart（秒级中断）→ 健康检查失败自动回滚。
#
# 服务器内存极小，此脚本保留仅作占位：任何直接运行都会被拒绝。
echo "[$(date '+%F %T')] update.sh 已停用：请在本机执行 npm run deploy（蓝绿零停机部署）" >> "${UPDATE_LOG:-$HOME/logs/update.log}"
exit 1
