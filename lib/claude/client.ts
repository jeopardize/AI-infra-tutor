import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_MODEL = "claude-sonnet-4-6";
export const FAST_MODEL = "claude-haiku-4-5";

let _client: Anthropic | null = null;

export function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing ANTHROPIC_API_KEY. Add it to .env.local (see .env.local.example).",
    );
  }
  _client = new Anthropic({ apiKey });
  return _client;
}

export type Mode = "quality" | "fast";
export function pickModel(mode: Mode = "quality") {
  return mode === "fast" ? FAST_MODEL : DEFAULT_MODEL;
}
