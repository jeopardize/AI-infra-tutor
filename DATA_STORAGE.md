# 数据存储说明 / Data Storage

## 概述

为了确保个人学习数据（题库、简历、学习进度等）在代码更新时不会丢失，本项目将数据存储在**独立于代码仓库的目录**中。

## 默认存储位置

**默认路径**：`~/Documents/ai-infra-tutor-data/`

存储的数据文件包括：
- `question-bank.json` - 题库数据
- `resume.json` - 简历数据

## 自定义存储位置

如果你希望将数据存储在其他位置（例如云同步目录），可以在 `.env.local` 中配置：

```bash
# 示例：使用 iCloud Drive
DATA_DIR=~/Library/Mobile Documents/com~apple~CloudDocs/ai-infra-tutor-data

# 示例：使用 Dropbox
DATA_DIR=~/Dropbox/ai-infra-tutor-data

# 示例：自定义路径
DATA_DIR=/path/to/your/data
```

## 自动数据迁移

首次启动时，系统会自动检测旧的 `.data/` 目录中的数据文件，并迁移到新位置：

```
旧位置：项目根目录/.data/question-bank.json
新位置：~/Documents/ai-infra-tutor-data/question-bank.json
```

迁移日志会在控制台输出：
```
[server-storage] Migrated "question-bank": /path/to/project/.data/question-bank.json -> /Users/you/Documents/ai-infra-tutor-data/question-bank.json
```

## 数据安全

✅ **代码更新安全**：数据目录独立于代码，`git pull` 不会影响你的数据

✅ **版本控制隔离**：`.data/` 已在 `.gitignore` 中排除，不会被提交到仓库

✅ **备份建议**：
- 定期备份 `~/Documents/ai-infra-tutor-data/` 目录
- 或将 `DATA_DIR` 设置到云同步目录（iCloud/Dropbox/OneDrive）

## 多设备同步

如果你在多台电脑上使用本项目，可以将数据目录设置为云同步目录：

1. **在所有设备上设置相同的 `DATA_DIR`**：
   ```bash
   # .env.local
   DATA_DIR=~/Library/Mobile Documents/com~apple~CloudDocs/ai-infra-tutor-data
   ```

2. **数据会通过云服务自动同步**

⚠️ **注意**：多设备同时编辑可能导致冲突，建议同一时间只在一台设备上使用。

## 故障排查

### 问题：找不到我的题库数据

1. 检查数据文件是否存在：
   ```bash
   ls ~/Documents/ai-infra-tutor-data/
   ```

2. 检查控制台日志，查看迁移是否成功

3. 如果旧数据在 `.data/` 目录，手动复制到新位置：
   ```bash
   mkdir -p ~/Documents/ai-infra-tutor-data
   cp .data/*.json ~/Documents/ai-infra-tutor-data/
   ```

### 问题：数据目录路径配置不生效

1. 确认 `.env.local` 文件在项目根目录
2. 确认环境变量名为 `DATA_DIR`（不是 `DATA_PATH` 或其他）
3. 重启开发服务器使环境变量生效

## 技术细节

- 实现文件：`lib/data/server-storage.ts`
- 数据通过 `/api/data/[domain]` API 读写
- 前端同时使用 localStorage 作为快速缓存
- 服务端文件作为持久化存储
