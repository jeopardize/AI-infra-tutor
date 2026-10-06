#!/usr/bin/env node
/**
 * 每周五「意见反馈 → 代码润色」流水线（在服务器上运行）。
 *
 * 步骤（由 friday-improve.sh 编排）：
 *   --step edit  读取反馈 → LLM 生成代码修改 → 应用 → tsc + build 校验 → 失败回滚 / 成功 commit+push
 *   --step mark  构建成功后把反馈标记为已处理（写回数据 git 仓库并推送）
 *   --dry-run    仅做预检（工作区干净、反馈可读），不做任何修改
 *
 * 安全护栏：
 *  - 只允许修改 app/**、components/**、lib/**、public/** 下的文件
 *  - 单文件 ≤ 200KB，单次 ≤ 8 个文件
 *  - tsc/typecheck 与 next build 未通过则整体回滚
 *  - 代码推送 using 服务器上的 GitHub 凭证（credential.helper store）
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

function sh(cwd, cmd, args, timeout = 300_000) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd, timeout, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`${cmd} exit=${code}: ${(err || out).slice(0, 800)}`))));
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
  if (!/\.(ts|tsx|js|jsx|mjs|cjs|css|md|json|svg)$/i.test(norm) && norm !== "app/globals.css") return null;
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

async function llmPolish(feedback) {
  const Anthropic = require("@anthropic-ai/sdk").default;
  const client = new Anthropic({
    apiKey: process.env.PROJECT_ANTHROPIC_AUTH_TOKEN || process.env.PROJECT_ANTHROPIC_API_KEY,
    baseURL: process.env.PROJECT_ANTHROPIC_BASE_URL || undefined,
  });
  const model = process.env.PROJECT_ANTHROPIC_MODEL || "claude-sonnet-4-6";
  const system = [
    "你是「AI Infra Tutor」（Next.js 16 + TypeScript + Tailwind CSS v4）应用的代码润色工程师，按照用户反馈做小步、聚焦的改进。",
    "硬性规则：",
    "1. 只允许修改或新建 app/**、components/**、lib/**、public/** 下的文件；禁止修改 scripts/、配置文件、package.json、.env",
    "2. 不引入新的 npm 依赖，不改动整体架构",
    "3. 保持现有代码风格（2 空格缩进、双引号、lib/i18n/translations.ts 的双语约定：界面文案必须同时更新 zh 与 en 两份词条）",
    "4. 优先做小而正确的修改；单次最多 8 个文件；不要重写大文件的全部内容，除非反馈明确要求",
    "5. 输出严格 JSON（不要 markdown 代码块）:",
    '{"summary":"中文一句话总结","edits":[{"path":"相对路径","content":"文件完整新内容","action":"write"}],"skipped":[{"content":"无法处理的反馈原文","reason":"原因"}]}',
    "如某条反馈与代码无关 / 信息不足 / 属于纯讨论，放进 skipped，不要凭空猜测乱改。",
  ].join("\n");
  const fileList = listRepoFiles().slice(0, 400).join("\n");
  const user = [
    "## 用户反馈（全部需处理，按时间从旧到新）",
    feedback.map((it, i) => `${i + 1}. [${new Date(it.createdAt).toISOString()}] ${it.content}`).join("\n"),
    "",
    "## 仓库文件清单（相对路径，含大小）",
    fileList,
  ].join("\n");
  const resp = await client.messages.create({
    model,
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: user }],
  });
  const text = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  return parsed;
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

async function main() {
  const log = (...a) => console.log(`[friday]`, ...a);

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
    // 由 .sh 在部署成功后调用：标记为已处理
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

  // edit: LLM 生成修改 → 应用 → 校验 → push
  let result;
  try {
    result = await llmPolish(open);
  } catch (e) {
    log("LLM 调用/解析失败，本轮放弃（反馈保持待处理）:", e.message.slice(0, 300));
    process.exit(1);
  }
  const edits = Array.isArray(result.edits) ? result.edits : [];
  const skipped = Array.isArray(result.skipped) ? result.skipped : [];
  log(`计划修改 ${edits.length} 个文件，跳过 ${skipped.length} 条反馈`);
  if (!edits.length && !skipped.length) { log("LLM 未产出任何内容，放弃本轮"); process.exit(1); }

  try {
    const applied = await applyEdits(edits);
    log("已修改:", applied.join(", ") || "(none)");

    log("typecheck...");
    await sh(REPO, "npx", ["tsc", "--noEmit"], 180_000);
    log("build...");
    await sh(REPO, "npm", ["run", "build"], 600_000);

    const summary = String(result.summary || "feedback polish").slice(0, 120);
    // 把 summary 交给 .sh 后续 mark 步骤使用
    fs.writeFileSync(path.join(DATA_REPO, "question-bank", "friday-pending.json"),
      JSON.stringify({ at: Date.now(), summary, count: open.length }, null, 2), "utf-8");

    await git(REPO, ["add", "-A"]);
    await git(REPO, [
      "-c", "user.name=ai-infra-tutor", "-c", "user.email=bot@ai-infra-tutor.local",
      "commit", "-m", `feedback: ${summary}`, "-m", `processed ${open.length} feedback item(s)`,
    ], 60_000);
    await git(REPO, ["push", "origin", "main"], 120_000);
    log(`代码已推送 GitHub: feedback: ${summary}`);
    process.exit(0);
  } catch (e) {
    log("校验/提交失败，整体回滚:", e.message.slice(0, 400));
    await revert();
    process.exit(1);
  }
}

main().catch((e) => { console.error("[friday] fatal:", e); process.exit(1); });
