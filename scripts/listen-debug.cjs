/**
 * 企业微信智能机器人调试监听器。
 *
 * 用途：抓取真实的 userid（单聊）或群 chatid，用于配置 WECOM_CHAT_ID。
 * 用法：
 *   npx pm2 stop ai-tutor-web          # 先停掉占用长连接的服务（一个 bot 只允许一条连接）
 *   set -a; source .env; set +a        # 加载 WECOM_BOT_ID / WECOM_BOT_SECRET
 *   node scripts/listen-debug.cjs
 * 然后在企业微信里给机器人发一条消息（单聊或群里 @它），
 * 终端会打印 frame 里的 from.userid / chatid。
 */
const AiBot = require("@wecom/aibot-node-sdk");

const wsClient = new AiBot.WSClient({
  botId: process.env.WECOM_BOT_ID,
  secret: process.env.WECOM_BOT_SECRET,
});

wsClient.on("authenticated", () =>
  console.log("LISTEN: authenticated, waiting for message..."),
);
wsClient.on("message.text", (f) => {
  console.log("GOT_TEXT frame:", JSON.stringify(f.body));
  setTimeout(() => process.exit(0), 500);
});
wsClient.on("message.image", (f) => {
  console.log("GOT_IMAGE frame:", JSON.stringify(f.body));
  setTimeout(() => process.exit(0), 500);
});
wsClient.on("message", (f) => {
  console.log("GOT_MSG frame:", JSON.stringify(f.body));
  setTimeout(() => process.exit(0), 500);
});
wsClient.on("event.enter_chat", (f) => {
  console.log("GOT_EVENT frame:", JSON.stringify(f.body));
});
wsClient.on("error", (e) => console.log("ERR", e));

wsClient.connect();
setTimeout(() => {
  console.log("LISTEN: timeout, no message");
  process.exit(2);
}, 300_000);
