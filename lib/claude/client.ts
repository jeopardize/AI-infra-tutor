import Anthropic from "@anthropic-ai/sdk";

// 从环境变量读取模型名称，不限制具体模型
// 如果不配置，使用通用的默认值（代理 API 可能会忽略此参数）
const ENV_DEFAULT =
  process.env.PROJECT_ANTHROPIC_MODEL ||
  process.env.ANTHROPIC_MODEL ||
  "claude-sonnet-4-6";

const ENV_FAST =
  process.env.PROJECT_ANTHROPIC_FAST_MODEL ||
  process.env.ANTHROPIC_FAST_MODEL ||
  "claude-sonnet-4-6";

export const DEFAULT_MODEL: string = ENV_DEFAULT;
export const FAST_MODEL: string = ENV_FAST;

let _client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (_client) return _client;

  // 优先使用项目专属环境变量，避免与终端 Claude Code 配置冲突
  const apiKey =
    process.env.PROJECT_ANTHROPIC_AUTH_TOKEN ||
    process.env.PROJECT_ANTHROPIC_API_KEY ||
    process.env.ANTHROPIC_AUTH_TOKEN ||
    process.env.ANTHROPIC_API_KEY;

  const baseURL =
    process.env.PROJECT_ANTHROPIC_BASE_URL || process.env.ANTHROPIC_BASE_URL;

  if (!apiKey) {
    throw new Error(
      "Missing API key. Add PROJECT_ANTHROPIC_AUTH_TOKEN or PROJECT_ANTHROPIC_API_KEY to .env.local (see .env.local.example).",
    );
  }

  const config: { apiKey: string; baseURL?: string } = { apiKey };
  if (baseURL) {
    config.baseURL = baseURL;
  }

  _client = new Anthropic(config);
  return _client;
}

export type Mode = "quality" | "fast";
export function pickModel(mode: Mode = "quality") {
  return mode === "fast" ? FAST_MODEL : DEFAULT_MODEL;
}
