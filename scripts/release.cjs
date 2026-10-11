#!/usr/bin/env node
/**
 * 自动发版：仓库有新提交时，bump lib/versions.ts 的 APP_VERSION（patch 位），
 * 在 CHANGELOG 顶部追加更新条目（取自上次发版以来的 commit 主题），commit 并 push。
 * 无新提交时静默跳过（幂等，可安全地在每次 update.sh 里调用）。
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const REPO = path.join(__dirname, "..");
const MARKER = process.env.RELEASE_MARKER || path.join(process.env.HOME, "logs", ".last-release-commit");
const VERSIONS = path.join(REPO, "lib", "versions.ts");

function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", cwd: REPO, ...opts }).trim();
}

try {
  const content = fs.readFileSync(VERSIONS, "utf8");
  const m = content.match(/export const APP_VERSION = "([^"]+)"/);
  if (!m) throw new Error("lib/versions.ts 中找不到 APP_VERSION");
  const current = m[1];

  let last = "";
  try { last = fs.readFileSync(MARKER, "utf8").trim(); } catch {}

  // 上次发版以来的提交主题
  let subjects = [];
  try {
    const raw = last
      ? sh(`git log --pretty=%s ${JSON.stringify(last + "..HEAD")}`)
      : sh("git log --pretty=%s -10");
    subjects = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  } catch (e) {
    console.log("[release] git log 失败，跳过发版:", e.message);
    process.exit(0);
  }
  // 排除流水线自身的机械提交
  const items = subjects
    .filter((s) => !/^(migrate|release|data):/.test(s))
    .slice(0, 12);
  if (items.length === 0) {
    console.log("[release] 无新提交，跳过发版");
    process.exit(0);
  }

  const parts = current.split(".").map(Number);
  parts[2] = (parts[2] || 0) + 1;
  const next = parts.join(".");
  const today = new Date().toISOString().slice(0, 10);

  const entry =
    `  {\n    version: "${next}",\n    date: "${today}",\n    items: [\n` +
    items.map((s) => "      " + JSON.stringify(s)).join(",\n") +
    ",\n    ],\n  },\n";

  let updated = content.replace(
    /export const APP_VERSION = "[^"]+"/,
    `export const APP_VERSION = "${next}"`,
  );
  updated = updated.replace(
    /export const CHANGELOG: ChangelogEntry\[\] = \[\n/,
    `export const CHANGELOG: ChangelogEntry[] = [\n${entry}`,
  );
  fs.writeFileSync(VERSIONS, updated, "utf8");

  sh("git add lib/versions.ts");
  sh(
    `git -c user.name=ai-infra-tutor -c user.email=bot@ai-infra-tutor.local commit -m "release: v${next}"`,
  );
  try {
    sh("git push origin HEAD");
  } catch (e) {
    console.log("[release] push 失败（本地已提交，稍后 update.sh 流水线重试）");
  }
  const head = sh("git rev-parse HEAD");
  fs.mkdirSync(path.dirname(MARKER), { recursive: true });
  fs.writeFileSync(MARKER, head, "utf8");
  console.log(`[release] 已发布 v${next}（${items.length} 条更新）`);
} catch (e) {
  console.error("[release] 失败:", e.message);
  process.exit(1);
}
