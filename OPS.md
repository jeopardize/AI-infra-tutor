# AI Infra Tutor — 运维手册

日常使用、服务恢复、更新流程。

---

## 目录

- [1. 常用命令](#1-常用命令)
- [2. 日常使用](#2-日常使用)
- [3. 服务挂了怎么办](#3-服务挂了怎么办)
- [4. 更新代码后怎么办](#4-更新代码后怎么办)
- [5. 换电脑 / 换环境](#5-换电脑--换环境)

---

## 1. 常用命令

```bash
# 启动后台服务
npm run dev:bg

# 查看运行状态（绿色 online 表示正常）
npm run dev:bg:status

# 查看实时日志
npm run dev:bg:logs

# 重启后台服务
npm run dev:bg:restart

# 停止后台服务
npm run dev:bg:stop

# 开一个临时测试服务（端口 3001，不影响后台 3000）
npm run dev:test
```

所有数据存储位置：

| 数据 | 位置 | 说明 |
|------|------|------|
| 题库、简历 | `.data/*.json` | **这是核心持久化文件**，gitignored，备份时复制这个目录 |
| 学习进度、测验历史、面试记录 | 浏览器 localStorage | 换浏览器 / 清缓存后会丢失 |
| API 密钥 | `.env.local` | gitignored，换环境需要重新配置 |

---

## 2. 日常使用

### 2.1 启动

```bash
npm run dev:bg
```

等几秒钟，访问 `http://localhost:3000` 确认页面正常加载。

之后命令行就可以关掉了（Terminal 退出也不影响），服务在后台继续运行。

### 2.2 关闭电脑后再开机

pm2 不会随系统启动自动恢复，如果重启了电脑需要重新执行：

```bash
# 进到项目目录
cd ~/ai-infra-tutor

# 重新启动后台服务
npm run dev:bg
```

> 如果想开机自启，可以执行 `pm2 startup`，pm2 会生成一条 launchd 命令，按提示粘贴执行即可。不过开发机一般不需要。

### 2.3 查看是否正常

```bash
npm run dev:bg:status
```

输出中的 `status` 列显示 `online`（绿色）即为正常运行。或者访问 `http://localhost:3000` 看能否打开。

---

## 3. 服务挂了怎么办

### 3.1 判断是否挂了

- 网页打不开 / 白屏 / 报错 "连接被拒绝"
- `npm run dev:bg:status` 显示 `stopped` 或 `errored`

### 3.2 重启

```bash
npm run dev:bg:restart
```

等 5-8 秒让 Next.js 重新编译，然后刷新浏览器。

### 3.3 重启后还不行

```bash
# 停掉当前进程
npm run dev:bg:stop

# 手动启动前台看看报什么错
npm run dev
```

看终端输出的错误信息排查。修复后 Ctrl+C 停掉前台进程，再：

```bash
npm run dev:bg
```

### 3.4 数据会丢吗

**不会。** 数据存在两个地方：

- `.data/resume.json`、`.data/question-bank.json` — 磁盘文件，服务挂了也在
- 浏览器 localStorage — 清浏览器缓存才会丢

就算你把整个服务停掉再重装，只要这两个文件在，数据就在。

如果担心，定期备份：

```bash
cp -r .data ~/backups/ai-tutor-data/
```

---

## 4. 更新代码后怎么办

### 4.1 从 GitHub 拉取最新代码

```bash
# 1. 停掉后台服务
npm run dev:bg:stop

# 2. 拉取最新代码
git pull

# 3. 安装可能新增的依赖
npm install

# 4. 重新启动
npm run dev:bg
```

### 4.2 自己改了代码

```bash
npm run dev:bg:restart
```

大部分改动 Next.js 热加载会自动生效。如果页面没刷新过来，重启一下后台进程即可。

### 4.3 更新后数据结构变了怎么办

如果更新说明里提到了数据结构变更（例如 `QuestionItem` 新增字段），旧数据会自动兼容：

- `JSON.parse` 对新字段返回 `undefined`，代码里处理一下即可
- `.data/*.json` 不会被覆盖，文件内容保持不变

如果真的需要迁移数据，项目里会附带迁移脚本，或者手动操作：

```bash
# 旧数据备份
cp .data/question-bank.json .data/question-bank.json.bak

# 如果需要格式化 / 转换，可以用 Node.js 临时处理
node -e "
  const d = require('./.data/question-bank.json');
  // 这里写转换逻辑
  require('fs').writeFileSync('.data/question-bank.json', JSON.stringify(d, null, 2));
"
```

### 4.4 提交流改时注意

```bash
git status
```

确认只有代码文件（`.ts`、`.tsx`、`.css`、`package.json` 等），**不包含**：

- `.data/` 开头的文件
- `.env.local`

---

## 5. 换电脑 / 换环境

```bash
# 1. 在新机器上 clone 项目
git clone <repo-url>
cd ai-infra-tutor
npm install

# 2. 配置 API 密钥
cp .env.local.example .env.local
# 编辑 .env.local 填入 ANTHROPIC_API_KEY

# 3. 复制旧数据（从旧机器）
# 把 .data/ 目录整个复制到新机器的项目根目录

# 4. 启动
npm run dev:bg
```

如果没有旧数据备份，所有题目和简历信息需要重新录入，但知识库内容（学习页面、测验、面试）是代码自带的，不受影响。
