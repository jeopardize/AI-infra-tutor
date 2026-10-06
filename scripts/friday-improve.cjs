#!/usr/bin/env node
/**
 * 每周五「意见反馈 → 代码润色」流水线（在服务器上运行）。
 *
 * 步骤（由 friday-improve.sh 编排）：
 *   --step edit  读取反馈 → LLM 先读文件再产出修改 → 应用 → tsc + build 校验
 *                （失败把错误回喂给 LLM 自修复，最多 2 轮，仍失败则整体回滚）
 *   --step mark  构建成功后把反馈标记为已处理（写回数据 git 仓库并推送）
 *   --dry-run    仅做预检（工作区干净、反馈可读），不做任何修改
 *
 * 安全护栏：
 *  - 只允许修改 app/**、components/**、lib/**、public/** 下的文件
 *  - 单文件 ≤ 200KB，单次 ≤ 8 个文件
 *  - 代码推送使用服务器上的 GitHub 凭证（credential.helper store）
 */
const path = require("path");
const os = require("os");
const fs = require("fs");
const { spawn } = require("child_process");

const args = process.argv.slice(2);
const step = args.includes("--dry-run") ? "dryrun" : args[args.indexOf("--step") + 1];
const REPO = path.resolve(__dirname, "..");
const DATA_REPO = process.env.DATA_REPO_PATH
  ? process.env.DATA_REPO_PATH.replace(/^~/, os.homedir())
  : path.join(os.homedir(), "apps", "data");
const FEEDBACK_FILE = path.join(DATA_REPO, "question-bank", "feedback.json");
const LAST_RUN_FILE = path.join(DATA_REPO, "question-bank", "friday-last.json");

const ALLOWED_PREFIX = ["app/", "components/", "lib/", "public/"];
const MAX_FILES = 8;
const MAX_FILE_BYTES = 200 * 1024;
const MAX_FIX_ROUNDS = 2;

function sh(cwd, cmd, args, timeout = 300_000) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, timeout, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`${cmd} exit=${code}: ${(err || out).slice(0, 1200)}`))));
  });
}

function git(cwd, args, timeout) {
  return sh(cwd, "git", args, timeout);
}

function readFeedback() {
  const raw = fs.readFileSync(FEEDBACK_FILE, "utf-8");
  const items = JSON.parse(raw);
  return Array.isArray(items) ? items : [];
}

function safePath(rel) {
  if (typeof rel !== "string") return null;
  const norm = path.normalize(rel).replace(/\\/g, "/");
  if (norm.startsWith("/") || norm.split("/").includes("..")) return null;
  if (!ALLOWED_PREFIX.some((p) => norm === p.slice(0, -1) || norm.startsWith(p))) return null;
  if (!/\.(ts|tsx|js|jsx|mjs|cjs|css|md|json|svg)$/i.test(norm)) return null;
  return norm;
}

function listRepoFiles() {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 4) return;
    for (const name of fs.readdirSync(dir)) {
      if (name === "node_modules" || name === ".next" || name === ".git" || name.startsWith(".")) continue;
      const fp = path.join(dir, name);
      const st = fs.statSync(fp);
      if (st.isDirectory()) walk(fp, depth + 1);
      else out.push(`${path.relative(REPO, fp)} (${Math.round(st.size / 1024)}KB)`);
    }
  };
  for (const d of ["app", "components", "lib", "public"]) {
    const fp = path.join(REPO, d);
    if (fs.existsSync(fp)) walk(fp, 0);
  }
  return out;
}

function whatOrDefault(whats, paths) {
  return whats || ("以下文件读取失败（不存在或不允许读取）：" + JSON.stringify(paths) + "\n请基于已有信息继续。");
}

function readFile(REPObase, rel) {
  const normalized = safePath(rel);
  if (!normalized) return null;
  const abs = path.join(REPObase, normalized);
  try {
    let content = fs.readFileSync(abs, "utf-8");
    if (Buffer.byteLength(content, "utf-8") > 40_000) content = content.slice(0, 40_000) + "\n/* …已截断 */";
    return `### ${normalized}\n\`\`\`\n${content}\n\`\`\``;
  } catch { return null; }
}

function parseModelJson(text) {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  const s = cleaned.indexOf("{"); const e = cleaned.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("no json in model reply");
  return JSON.parse(cleaned.slice(s, e + 1));
}

function makeClient() {
  const Anthropic = require("@anthropic-ai/sdk").default;
  return new Anthropic({
    apiKey: process.env.PROJECT_ANTHROPIC_AUTH_TOKEN || process.env.PROJECT_ANTHROPIC_API_KEY,
    baseURL: process.env.PROJECT_ANTHROPIC_BASE_URL || undefined,
  });
}

const SYSTEM_PROMPT = [
  "你是「AI Infra Tutor」（Next.js 16 + TypeScript + Tailwind CSS v4）应用的代码润色工程师，按照用户反馈做小步、聚焦的改进。",
  "",
  "工作方式：为避免凭空猜测现有代码，你先「读文件」再「改代码」。用严格 JSON 回复：",
  '  第一步回读: {"kind":"read","paths":["components/AppShell.tsx","app/library/page.tsx"]}  # 最多 10 个路径',
  '  第二步改码: {"kind":"edit","summary":"中文一句话总结","edits":[{"path":"相对路径","content":"文件完整新内容","action":"write 或 delete"}],"skipped":[{"content":"反馈原文","reason":"原因"}]}',
  "",
  "硬性规则：",
  "1. 修改前必须先读一遍要改的文件；绝不允许编造不存在的导入/组件/函数",
  "2. 只允许修改或新建 app/**、components/**、lib/**、public/** 下的文件；禁止修改 scripts/、配置文件、package.json、.env",
  "3. 不引入新的 npm 依赖，不改动整体架构",
  "4. 保持现有代码风格（2 空格缩进、双引号）；界面文案走 lib/i18n/translations.ts：它的 Dict interface、zh 字面量、en 字面量三处必须同步加字段，遗漏会编译失败",
  "5. 优先小而正确的修改；单次最多 8 个文件",
  "6. 输出必须是合法 JSON，不要 markdown 代码块、不要解释性文字",
  "",
  "参考（现有 i18n 用法，仅供确认，仍需读文件核实）:",
  'import { useLang } from "@/lib/i18n/context"; const { lang, t } = useLang(); t.nav.bank',
].join("\n");

/** 驱动一次 agent 会话：处理 read 轮次，返回 {edit 会话结果, convo} */
async function agentRun(feedback, existingConvo, client) {
  const model = process.env.PROJECT_ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const convo = existingConvo || [
    {
      role: "user",
      content: [
        "## 用户反馈（全部需处理，按时间从旧到新）",
        feedback.map((it, i) => `${i + 1}. [${new Date(it.createdAt).toISOString()}] ${it.content}`).join("\n"),
        "",
        "## 仓库文件清单（相对路径，含大小）",
        listRepoFiles().slice(0, 400).join("\n"),
      ].join("\n"),
    },
  ];
  for (let round = 0; round < 8; round++) {
    const resp = await client.messages.create({ model, max_tokens: 16000, system: SYSTEM_PROMPT, messages: convo });
    const text = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const parsed = parseModelJson(text);
    if (parsed.kind === "read" && Array.isArray(parsed.paths)) {
      const whats = parsed.paths.map((p) => readFile(REPO, p)).filter(Boolean).join("\n\n");
      convo.push({ role: "assistant", content: text }, { role: "user", content: whatOrDefault(whats, parsed.paths) });
      continue;
    }
    return { parsed, convo, modelText: text };
  }
  throw new Error("agent rounds exhausted");
}

async function applyEdits(edits) {
  const applied = [];
  for (const e of edits.slice(0, MAX_FILES)) {
    const rel = safePath(e.path);
    if (!rel) throw new Error(`rejected path: ${e.path}`);
    const abs = path.join(REPO, rel);
    if (e.action === "delete") {
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
      applied.push(rel);
      continue;
    }
    const content = String(e.content ?? "");
    if (Buffer.byteLength(content, "utf-8") > MAX_FILE_BYTES) throw new Error(`file too large: ${rel}`);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf-8");
    applied.push(rel);
  }
  return applied;
}

async function revert() {
  try { await git(REPO, ["checkout", "--", "."]); } catch {}
  try { await git(REPO, ["clean", "-fd", "app", "components", "lib", "public"]); } catch {}
}

async function verify() {
  log("typecheck...");
  await sh(REPO, "npx", ["tsc", "--noEmit"], 180_000);
  log("build...");
  return await sh(REPO, "npm", ["run", "build"], 600_000);
}

function log(...a) { console.log(`[friday]`, ...a); }

async function main() {
  // 预检
  await git(REPO, ["fetch", "origin", "main"], 60_000);
  const dirty = await git(REPO, ["status", "--porcelain"]).then((s) => s.length > 0).catch(() => true);
  if (dirty) { log("ABORT: 工作区不干净，请人工检查"); process.exit(1); }
  const behind = await git(REPO, ["rev-list", "--count", "HEAD..origin/main"]).catch(() => "0");
  if (Number(behind) > 0) { log("ABORT: 本地落后远端，先人工 git pull"); process.exit(1); }

  let feedback;
  try { feedback = readFeedback(); } catch (e) { log(`读反馈失败: ${e.message}`); process.exit(1); }
  const open = feedback.filter((it) => it && it.status === "open" && it.content);
  log(`反馈 ${feedback.length} 条，待处理 ${open.length} 条`);

  if (step === "dryrun") { log("DRY-RUN OK（预检通过）"); process.exit(0); }
  if (!open.length) { log("没有待处理反馈，退出"); process.exit(0); }

  if (step === "mark") {
    const summary = args[args.indexOf("--summary") + 1] || "";
    const now = Date.now();
    for (const it of feedback) {
      if (it.status === "open") { it.status = "done"; it.processedAt = now; if (summary) it.note = summary; }
    }
    fs.mkdirSync(path.dirname(FEEDBACK_FILE), { recursive: true });
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(feedback, null, 2), "utf-8");
    fs.writeFileSync(LAST_RUN_FILE, JSON.stringify({ at: now, summary, count: open.length }, null, 2), "utf-8");
    log(`已标记 ${open.length} 条为 done`);
    process.exit(0);
  }

  if (step !== "edit") { log(`未知 step: ${step}`); process.exit(1); }

  const client = makeClient();
  let convo, result;
  try {
    ({ parsed: result, convo } = await agentRun(open, null, client));
  } catch (e) {
    log("LLM 调用/解析失败，本轮放弃（反馈保持待处理）:", e.message.slice(0, 300));
    process.exit(1);
  }

  let edits = Array.isArray(result.edits) ? result.edits : [];
  log(`计划修改 ${edits.length} 个文件，跳过 ${(result.skipped || []).length} 条反馈`);
  if (!edits.length && !(result.skipped || []).length) { revert().then(() => process.exit(1)); log("LLM 未产出任何内容，放弃本轮"); return; }

  // 应用 + 校验 + 失败自修复循环
  for (let attempt = 1; attempt <= 1 + MAX_FIX_ROUNDS; attempt++) {
    try {
      const applied = await applyEdits(edits);
      log(`第 ${attempt} 次应用修改:`, applied.join(", ") || "(none)");
      await verify();
      // 成功：提交 + 推送
      const summary = String(result.summary || "feedback polish").slice(0, 120);
      fs.writeFileSync(
        path.join(DATA_REPO, "question-bank", "friday-pending.json"),
        JSON.stringify({ at: Date.now(), summary, count: open.length }, null, 2), "utf-8",
      );
      await git(REPO, ["add", "-A"]);
      await git(REPO, [
        "-c", "user.name=ai-infra-tutor", "-c", "user.email=bot@ai-infra-tutor.local",
        "commit", "-m", `feedback: ${summary}`, "-m", `processed ${open.length} feedback item(s)`,
      ], 60_000);
      await git(REPO, ["push", "origin", "main"], 120_000);
      log(`代码已推送 GitHub: feedback: ${summary}`);
      process.exit(0);
    } catch (e) {
      log(`第 ${attempt} 轮校验失败:`, String(e.message).slice(0, 600));
      if (attempt > MAX_FIX_ROUNDS) break;
      // 回滚后把错误回喂给 LLM 修复
      await revert();
      try {
        const fixed = await agentRun([], convo, client); // continuation
        result = fixed.parsed;
        edits = Array.isArray(result.edits) ? result.edits : [];
        log("LLM 修复轮产出:", String(result.summary || "").slice(0, 80), `(${edits.length} files)`);
        if (!edits.length) break;
      } catch (e2) {
        log("修复轮 LLM 失败:", e2.message.slice(0, 200));
        break;
      }
    }
  }
  await revert();
  log("多次校验失败，已整体回滚（反馈保持待处理，下周五再试）");
  process.exit(1);
}

main().catch((e) => { console.error("[friday] fatal:", e); process.exit(1); });
