/**
 * 企业微信智能机器人（API 模式 · 长连接）客户端。
 *
 * 使用 @wecom/aibot-node-sdk 的 WSClient 建立 WebSocket 长连接
 * （botId + secret，企业微信 PC 客户端「智能机器人 → API 模式 → 长连接」获取）。
 * 连接建立后可调用 sendMessage(chatid, {msgtype:'markdown', ...}) 主动推送消息。
 *
 * 环境变量：
 * - WECOM_BOT_ID / WECOM_BOT_SECRET   连接凭证
 * - WECOM_CHAT_ID                     推送目标会话（单聊填用户 userid；群聊填 chatid）
 */

type WsClientLike = {
  connect: () => void;
  isConnected?: () => boolean;
  on: (event: string, cb: (...args: unknown[]) => void) => void;
  sendMessage: (chatid: string, body: Record<string, unknown>) => Promise<unknown>;
};

type AiBotModule = {
  WSClient: new (opts: Record<string, unknown>) => WsClientLike;
};

let _client: WsClientLike | null = null;
let _connecting: Promise<WsClientLike> | null = null;

function getCreds(): { botId: string; secret: string } | null {
  const botId = process.env.WECOM_BOT_ID;
  const secret = process.env.WECOM_BOT_SECRET;
  if (!botId || !secret) return null;
  return { botId, secret };
}

export function botConfigured(): boolean {
  return getCreds() !== null;
}

export function chatIdConfigured(): boolean {
  return !!process.env.WECOM_CHAT_ID;
}

async function getClient(): Promise<WsClientLike> {
  if (_client && (_client.isConnected?.() ?? true)) return _client;
  if (_connecting) return _connecting;

  const creds = getCreds();
  if (!creds) throw new Error("WECOM_BOT_ID / WECOM_BOT_SECRET not configured");

  const mod = (await import("@wecom/aibot-node-sdk")) as unknown as AiBotModule;

  const client = new mod.WSClient({
    botId: creds.botId,
    secret: creds.secret,
    logger: {
      debug: () => {},
      info: (...a: unknown[]) => console.log("[wecom]", ...a),
      warn: (...a: unknown[]) => console.warn("[wecom]", ...a),
      error: (...a: unknown[]) => console.error("[wecom]", ...a),
    },
  });

  _connecting = new Promise<WsClientLike>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("wecom ws connect timeout (15s)")),
      15_000,
    );
    client.on("authenticated", () => {
      clearTimeout(timer);
      console.log("[wecom] authenticated");
      resolve(client);
    });
    client.on("error", (e) => {
      clearTimeout(timer);
      reject(e instanceof Error ? e : new Error(String(e)));
    });
    client.connect();
  });

  try {
    _client = await _connecting;
    return _client;
  } finally {
    _connecting = null;
  }
}

/**
 * 主动向指定会话发送 markdown 消息。
 * chatid 优先级：入参 > WECOM_CHAT_ID 环境变量。
 */
export async function sendWecomMarkdown(
  text: string,
  chatidOverride?: string,
): Promise<boolean> {
  const chatid = chatidOverride || process.env.WECOM_CHAT_ID;
  if (!chatid) {
    console.error("[wecom] no chatid (set WECOM_CHAT_ID or pass as argument)");
    return false;
  }
  try {
    const client = await getClient();
    await client.sendMessage(chatid, {
      msgtype: "markdown",
      markdown: { content: text },
    });
    return true;
  } catch (err) {
    const e = err as { message?: string; errcode?: number; errmsg?: string };
    console.error(
      "[wecom] send failed:",
      e.errcode != null
        ? `errcode=${e.errcode} errmsg=${e.errmsg}`
        : (e.message ?? e),
    );
    // 仅在连接确实断开时重置，避免正常连接被反复重建
    // （企业微信每个 bot 只允许一条长连接，新建会把旧连接踢掉）
    if (_client?.isConnected?.() === false) {
      _client = null;
    }
    return false;
  }
}
