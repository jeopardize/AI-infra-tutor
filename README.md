# AI Infra Tutor — AI 基础设施学习助手

一个本地/自托管运行的 **AI Infra 学习伴侣**：体系化知识笔记、AI 追问式学习、智能测验查漏补缺、模拟面试评分、题库管理，以及**每天早上自动推送到企业微信的复习问题清单**。

技术栈：**Next.js 16 + TypeScript + Tailwind CSS v4 + Claude API + 企业微信智能机器人（长连接）**。

适合谁：

- 想转型 / 入门 AI Infra（训练、推理、硬件、系统）的工程师
- 准备 AI Infra 面试、需要结构化问答练习的人
- 有个人 markdown 笔记库（Obsidian / VSCode 等），想把笔记融入学习路径的人

---

## ✨ 功能总览

| 模块 | 路由 | 功能 |
|---|---|---|
| 📊 总览 | `/` | 四大方向（训练 / 推理 / 硬件 / 系统）主题分组 + 整体掌握度进度 |
| 📖 学习 | `/learn/[topicId]` | 知识点详情 + 内嵌流式 AI 对话追问；自动关联你的本地笔记 |
| 🎯 查漏补缺 | `/quiz` | AI 生成开放题 → 你作答 → AI 评分，更新彩色知识地图 |
| 🎙 模拟面试 | `/interview` | 多轮模拟面试、四维评分卡、历史回放、薄弱点统计、markdown 导出 |
| 📚 笔记库 | `/library` | 浏览 / 预览 / 编辑 / 新建本地 markdown 笔记 |
| 🗂 题库 | `/bank` | 双语题库管理：单条 / 批量录入、AI 自动补全翻译、筛选搜索、导出 |
| 📝 简历 | `/resume` | 单页简历编辑器：拖拽排序、富文本、A4 预览、PDF 导出 |
| 📬 每日推送 | 企业微信 | 每天 9:00 自动推送 10 道复习题 + 笔记缺失点总结 |

技术亮点：

- **Prompt 缓存** — 每次 Claude 调用都把完整知识树放进 system prompt 并标记 `cache_control: ephemeral`，重复调用又快又便宜
- **结构化输出** — 测验评分和面试评分卡使用 tool use + 严格 JSON Schema，不做脆弱的正则解析
- **题库 git 持久化** — 题库和掌握度数据保存到独立 git 仓库，天然具备云端备份、版本历史、跨服务器迁移能力
- **笔记双向打通** — 浏览器里编辑笔记直接写回 `.md` 文件；面试记录可一键导出到笔记库

---

## 🚀 一、本地开发部署

### 1. 准备环境

- Node.js **≥ 20**（Next 16 要求）
- npm
- 一个 Claude API Key（官方或任何 Anthropic 兼容中转服务）

### 2. 克隆与安装

```bash
git clone https://github.com/jeopardize/AI-infra-tutor.git
cd AI-infra-tutor
npm install
```

### 3. 配置环境变量

复制示例文件并填写：

```bash
cp .env.local.example .env.local
```

编辑 `.env.local`（**此文件已被 gitignore，不会被上传**）：

```bash
# 【必填】Claude API 凭证（两种写法二选一）
PROJECT_ANTHROPIC_AUTH_TOKEN=你的令牌
# 或
PROJECT_ANTHROPIC_API_KEY=sk-ant-...

# 【可选】API 端点（使用中转服务时填写）
PROJECT_ANTHROPIC_BASE_URL=

# 【可选】模型指定（默认 claude-sonnet-4-6）
PROJECT_ANTHROPIC_MODEL=claude-sonnet-4-6
PROJECT_ANTHROPIC_FAST_MODEL=claude-sonnet-4-6

# 【可选】本地笔记库路径（默认 ~/Documents/knowlege_library）
KNOWLEDGE_LIBRARY_PATH=/你的笔记目录

# 【可选】数据存储目录（题库缓存、简历等）
DATA_DIR=

# 【可选】题库 git 持久化仓库路径与远端
DATA_REPO_PATH=~/apps/data
DATA_REPO_REMOTE=https://github.com/your-name/your-data-repo.git

# 【可选】企业微信智能机器人（每日推送，见下文第三节）
WECOM_BOT_ID=
WECOM_BOT_SECRET=
WECOM_CHAT_ID=
```

### 4. 启动

```bash
npm run dev
# 打开 http://localhost:3000
```

常用脚本：

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发模式（3000 端口） |
| `npm run dev:test` | 开发模式（3001 端口，避免和常驻服务冲突） |
| `npm run build` / `npm run start` | 生产构建 / 启动 |
| `npm run dev:bg` / `dev:bg:stop` / `dev:bg:logs` | 用 pm2 后台跑开发模式 |

---

## 🖥 二、服务器部署（教学）

以 Ubuntu 24.04 为例，目标：服务跑在 **8001 端口**、开机可用、每天 8 点自动推送。

### 1. 安装 Node 20+

服务器自带的 Node 往往太旧（Next 16 需要 ≥ 20）：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # 应显示 v20 或 v22
```

### 2. 拉取代码、装依赖、构建

```bash
git clone https://github.com/jeopardize/AI-infra-tutor.git ~/apps/AI-infra-tutor
cd ~/apps/AI-infra-tutor

# 如果 package-lock 里有 macOS 专用二进制包，加 --force 忽略平台校验
npm ci --force --registry=https://registry.npmmirror.com
npm run build
```

### 3. 编写生产环境配置

在项目根目录创建 `.env`（生产用，同样不要提交）：

```bash
cat > .env <<EOF
PROJECT_ANTHROPIC_AUTH_TOKEN=你的令牌
PROJECT_ANTHROPIC_BASE_URL=你的端点
KNOWLEDGE_LIBRARY_PATH=/home/你的用户/apps/knowlege_library
WECOM_BOT_ID=你的BotID
WECOM_BOT_SECRET=你的Secret
WECOM_CHAT_ID=你的会话ID
EOF
```

### 4. 用 pm2 启动（端口 8001）

> ⚠️ **重要**：Next 16 的 `next start` 生产模式**不再自动加载 `.env` 文件**（开发模式会加载）。
> 所以必须通过 `scripts/start.sh` 启动，它会先 `source .env` 再启动服务。

`scripts/start.sh` 内容（仓库已自带）：

```bash
#!/usr/bin/env bash
cd "$(dirname "$0")/.."
set -a; source .env; set +a
exec npx next start -p 8001
```

启动：

```bash
npx pm2 start scripts/start.sh --name ai-tutor-web
npx pm2 save          # 保存进程列表，重启服务器后可 pm2 resurrect
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8001/   # 应输出 200
```

常用运维命令：

```bash
npx pm2 ls                      # 查看状态
npx pm2 logs ai-tutor-web       # 看日志
npx pm2 restart ai-tutor-web    # 重启（改 .env 后必须重启才生效）
npx pm2 delete ai-tutor-web     # 删除
```

### 5. 配置每天 8:00 的企业微信推送

```bash
crontab -e
# 加入一行：
0 8 * * * DAILY_PUSH_HOST=http://127.0.0.1:8001 /home/你的用户/apps/AI-infra-tutor/scripts/daily-push.sh
```

脚本逻辑：调用 `POST /api/notify/daily-push`，失败自动重试 3 次，日志写在 `~/logs/daily-push.log`。

---

## 🤖 三、企业微信智能机器人配置（教学）

每日推送使用企业微信「智能机器人」的 **API 模式 · 长连接**。

### 1. 创建机器人并获取凭证

1. 登录 [企业微信管理后台](https://work.weixin.qq.com/)（PC 客户端也可）
2. 进入 **安全与管理 → 管理工具 → 智能机器人**（部分版本在 工作台 → 智能机器人）
3. **新建机器人**（例如取名「面试官」），进入编辑页，切换为 **API 模式**
4. 连接方式选择 **「长连接」**（不要选「URL 回调」！长连接不需要公网 IP 和域名）
5. 在机器人详情页复制 **BotID** 和 **Secret**

### 2. 填写配置

```bash
WECOM_BOT_ID=aibqXXXXXXXXXXXXXXXX    # 管理后台复制的 BotID
WECOM_BOT_SECRET=xxxxxxxxxxxxxxxx    # 管理后台复制的 Secret
WECOM_CHAT_ID=WangJingXin            # 推送目标，见下文
```

`WECOM_CHAT_ID` 怎么填：

- **推送到个人单聊**：填你的企业微信 **userid**（注意大小写必须完全一致，如 `WangJingXin` ≠ `WangJingxin`）
- **推送到群聊**：填群的 chatid（`wr-` 开头）

> 💡 **不知道自己 userid / 群 chatid？** 用仓库里的监听脚本抓一下：
> ```bash
> # 先停掉会占用连接的服务，机器人同时只允许一条长连接
> npx pm2 stop ai-tutor-web
> set -a; source .env; set +a
> node scripts/listen-debug.cjs
> # 然后在企业微信里给机器人发一条消息，终端会打印出 from.userid / chatid
> ```

### 3. ⚠️ 必须知道的三条规则

1. **先说话，后推送**：企业微信规定，机器人只能向「用户给机器人发过消息」的会话主动推送。
   部署完先在群里 @机器人 或在单聊里给它发条消息，否则推送报 `846607` 错误。
2. **一个 bot 只允许一条长连接**：新连接会把旧连接踢掉。不要同时跑多个使用同一 BotID 的进程。
3. **频控**：向单个会话发消息上限 30 条/分钟、1000 条/小时，正常推送完全够用。

### 4. 手动测试一次推送

```bash
curl -X POST http://127.0.0.1:8001/api/notify/daily-push
# 返回 {"ok":true,"message":"已推送到企业微信"} 即成功
```

企业微信里会收到：`📚 今日 AI Infra 复习` —— 10 道按掌握度智能挑选的题目 + AI 生成的笔记缺失点总结。

---

## 📖 四、使用指南

### 总览页 `/`
四大方向的掌握度地图，点击任意主题进入学习页。

### 学习页 `/learn/[topicId]`
- 每个主题由若干 checkpoint（知识点）组成，逐个标记掌握状态：✅ 已掌握 / 🔄 学习中 / ❌ 未掌握
- 右侧 AI 对话可以针对当前知识点无限追问，回答基于完整知识树（带缓存，成本可控）
- 如果你的笔记库里有相关笔记，会自动挂载在知识点旁边

### 查漏补缺 `/quiz`
1. 选择主题（或让 AI 随机），点击「生成题目」
2. 用自己的话作答（开放题）
3. AI 评分并给出参考答案，掌握度自动更新到知识地图

### 模拟面试 `/interview`
1. 选择岗位方向，开始多轮对话式面试
2. 结束后生成四维评分卡（深度 / 广度 / 表达 / 工程素养）
3. 历史记录可回放、可导出 markdown 到笔记库、可看薄弱点趋势统计

### 笔记库 `/library`
直接浏览、编辑、新建本地 markdown 文件，`Cmd/Ctrl+S` 保存即写回磁盘。笔记里的图片走 `/api/docs/asset` 自动路由。

### 题库 `/bank`
- 单条或批量粘贴录入题目（支持中英双语，AI 一键补全翻译）
- 题库数据持久化到 git 仓库（云端备份 + 版本历史）
- 每日推送的 10 道题就是从这里挑的：**优先掌握度低、久未复习的题**

### 简历 `/resume`
拖拽排序、`**加粗**` `*斜体*` 语法、嵌套列表、A4 实时预览、PDF 导出。

---

## 📂 项目结构（精简）

```
AI-infra-tutor/
├── app/
│   ├── page.tsx                    # 总览
│   ├── learn/[topicId]/            # 学习页
│   ├── quiz/ interview/ library/ bank/ resume/
│   └── api/
│       ├── chat/                   # 流式对话
│       ├── quiz/                   # 出题 + 评分
│       ├── interview/              # 面试评分卡
│       ├── bank/                   # 题库 AI 补全
│       ├── data/[domain]/          # 通用 JSON 持久化
│       ├── docs/                   # 笔记 CRUD（tree/read/write/create/mkdir/asset）
│       └── notify/daily-push/      # 每日推送触发接口
├── lib/
│   ├── claude/                     # Claude 客户端 + 知识树 prompt 缓存
│   ├── knowledge/                  # 知识库内容（训练/推理/硬件/系统）
│   ├── notify/                     # 企业微信推送（wecom 长连接客户端、daily-push）
│   ├── data/repo-storage.ts        # 题库 git 持久化
│   ├── docs/sync.ts                # 笔记库 git 同步
│   └── storage.ts                  # 本地数据存储
├── scripts/
│   ├── start.sh                    # 生产启动脚本（加载 .env，端口 8001）
│   ├── daily-push.sh               # crontab 调用的推送脚本
│   └── listen-debug.cjs            # 抓 userid/chatid 的调试监听器
└── .env.local.example              # 环境变量模板（复制为 .env.local 使用）
```

---

## 🛠 常见问题（FAQ）

<details>
<summary><b>启动报 lightningcss / @tailwindcss/oxide 原生绑定错误</b></summary>

macOS 上可能出现跨架构二进制问题，重装即可：

```bash
rm -rf node_modules && npm install
node scripts/fix-lightningcss.js
```
</details>

<details>
<summary><b>推送报 errcode=846607（send msg frequency limit exceeded）</b></summary>

最常见原因不是真的超频，而是：
1. 用户还没给机器人发过消息（先在单聊/群里 @它 说句话）
2. `WECOM_CHAT_ID` 大小写或内容不对（用 `listen-debug.cjs` 抓真实值）
3. 另一个进程占用了该 bot 的长连接，你的连接被踢（一个 bot 只跑一个进程）
</details>

<details>
<summary><b>生产模式读不到环境变量</b></summary>

Next 16 的 `next start` 不自动加载 `.env` 文件。务必用 `scripts/start.sh` 启动（先 source 再启动），或者由 pm2/systemd 注入环境变量。
</details>

<details>
<summary><b>笔记图片不显示</b></summary>

图片需与 `.md` 同目录使用相对路径（如 `![](images/x.png)`），应用会自动经 `/api/docs/asset` 路由。
</details>

<details>
<summary><b>API 花费预期</b></summary>

所有 AI 调用都启用了 prompt caching，日常使用的成本主要在首次缓存写入。模型可在 `.env.local` 中换成更便宜的（如 `claude-haiku-4-5`）。
</details>

---

## 🔒 安全说明

- 所有密钥只放在 `.env.local`（本地开发）和服务器 `.env`（生产），两者都在 `.gitignore` 中，**永远不会提交**
- 不要把 BotID/Secret、API Key 粘贴到 issue、截图或聊天记录里
- 企业微信规定：机器人创建者必须是超级管理员，回调里的 userid 才是明文

## 📄 License

MIT
