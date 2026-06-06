"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { Markdown } from "./Markdown";
import { useLang } from "@/lib/i18n/context";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatPanelProps {
  topicId?: string;
  checkpointId?: string;
  /** 顶部提示语 */
  hint?: string;
  /** 初始 placeholder */
  placeholder?: string;
}

export function ChatPanel(props: ChatPanelProps) {
  const { lang, t } = useLang();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "learn",
          messages: next,
          topicId: props.topicId,
          checkpointId: props.checkpointId,
          language: lang,
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.text();
        setMessages((m) => [
          ...m,
          { role: "assistant", content: `[${t.chat.requestFailed}] ${err}` },
        ]);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((m) => {
          const copy = m.slice();
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
    } catch (e) {
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `[${t.chat.networkError}] ${(e as Error).message}` },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
      {props.hint && (
        <div className="px-3 py-2 text-xs text-zinc-500 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950">
          {props.hint}
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-sm text-zinc-400 text-center mt-8">
            {props.placeholder ?? t.chat.emptyHint}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "flex justify-end"
                : "flex justify-start"
            }
          >
            <div
              className={
                "max-w-[88%] rounded-lg px-3 py-2 text-sm " +
                (m.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100")
              }
            >
              {m.role === "assistant" ? (
                <Markdown>{m.content || "..."}</Markdown>
              ) : (
                <div className="whitespace-pre-wrap">{m.content}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-zinc-200 dark:border-zinc-800 p-2 flex gap-2 bg-zinc-50 dark:bg-zinc-950">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          rows={2}
          placeholder={t.chat.inputPlaceholder}
          className="flex-1 resize-none px-2 py-1 text-sm bg-transparent outline-none"
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          className="self-end px-3 py-2 rounded-md bg-blue-600 text-white text-sm disabled:opacity-40 flex items-center gap-1"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {t.chat.send}
        </button>
      </div>
    </div>
  );
}
