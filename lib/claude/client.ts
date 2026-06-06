import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";
export const FAST_MODEL = "claude-haiku-4-5-20250514";

let _client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (_client) return _client;

  // 支持自定义 API 端点（如 duckcoding.ai）
  const apiKey = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.ANTHROPIC_BASE_URL;

  if (!apiKey) {
    throw new Error(
      "Missing ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY. Add it to .env.local (see .env.local.example).",
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
