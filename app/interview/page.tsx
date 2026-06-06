"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  CATEGORY_META,
  getCheckpoint,
  localizedCheckpointName,
  localizedTopicTitle,
  type Category,
} from "@/lib/knowledge";
import { Markdown } from "@/components/Markdown";
import { DocDrawer } from "@/components/DocDrawer";
import { InterviewDetailDrawer } from "@/components/InterviewDetailDrawer";
import { useLang } from "@/lib/i18n/context";
import type { Dict, Lang } from "@/lib/i18n/translations";
import {
  DEFAULT_SETTINGS,
  loadInterviews,
  loadSettings,
  removeInterview,
  saveInterview,
  saveSettings,
  type AppSettings,
  type InterviewSession,
} from "@/lib/storage";
import { computeInterviewStats } from "@/lib/interviewExport";
import type { Scorecard } from "@/app/api/interview/scorecard/route";
import {
  BarChart3,
  CheckCircle2,
  Eye,
  FolderCog,
  Loader2,
  PlayCircle,
  Send,
  Square,
  Trash2,
  Trophy,
} from "lucide-react";

const ALL_CATS: Category[] = ["training", "inference", "hardware", "system"];
const DURATIONS = [15, 30, 45];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type Stage = "config" | "interviewing" | "scoring" | "done";

type LevelKey = "fresh" | "junior" | "mid" | "senior";
const LEVEL_KEYS: LevelKey[] = ["fresh", "junior", "mid", "senior"];

export default function InterviewPage() {
  const { lang, t } = useLang();

  const [stage, setStage] = useState<Stage>("config");
  const [levelKey, setLevelKey] = useState<LevelKey>("fresh");
  const [focus, setFocus] = useState<Category[]>(["inference"]);
  const [duration, setDuration] = useState(30);

  // 当前选中级别的本地化 label（每次渲染读取最新语言）
  const level = t.interview.levels[levelKey];

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [sessionId, setSessionId] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [history, setHistory] = useState<InterviewSession[]>([]);

  useEffect(() => setHistory(loadInterviews()), []);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<InterviewSession | null>(
    null,
  );
  const [openExportedPath, setOpenExportedPath] = useState<string | null>(null);
  useEffect(() => setSettings(loadSettings()), []);

  function updateSettings(next: AppSettings) {
    setSettings(next);
    saveSettings(next);
  }

  function onDeleteHistory(id: string) {
    removeInterview(id);
    setHistory(loadInterviews());
  }
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  function toggleFocus(c: Category) {
    setFocus((f) =>
      f.includes(c) ? f.filter((x) => x !== c) : [...f, c],
    );
  }

  async function startInterview() {
    if (focus.length === 0) return;
    const id = `iv-${Date.now()}`;
    setSessionId(id);
    setStage("interviewing");
    setMessages([]);
    setScorecard(null);
    // 让 AI 先开口
    await sendInternal([], t.interview.confirmStartFirstMsg, { level, focus, duration });
  }

  async function sendInternal(
    base: ChatMessage[],
    userText: string,
    cfg: { level: string; focus: Category[]; duration: number },
  ) {
    const next = [...base, { role: "user" as const, content: userText }];
    setMessages(next);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "interview",
          messages: next,
          language: lang,
          interview: {
            level: cfg.level,
            focus: cfg.focus.map((c) => t.categories[c].label),
            durationMin: cfg.duration,
          },
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.text();
        setMessages((m) => [...m, { role: "assistant", content: `[${t.chat.requestFailed}] ${err}` }]);
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
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    await sendInternal(messages, text, { level, focus, duration });
  }

  async function finishAndScore() {
    setStage("scoring");
    try {
      const res = await fetch("/api/interview/scorecard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          language: lang,
          config: {
            level,
            focus: focus.map((c) => t.categories[c].label),
            durationMin: duration,
          },
        }),
      });
      const data = (await res.json()) as Scorecard;
      setScorecard(data);
      saveInterview({
        id: sessionId,
        at: Date.now(),
        config: {
          level,
          focus: focus.map((c) => t.categories[c].label),
          durationMin: duration,
        },
        messages,
        scorecard: data,
      });
      setHistory(loadInterviews());
      setStage("done");
    } catch (e) {
      alert(t.interview.saveScorecardFailed((e as Error).message));
      setStage("interviewing");
    }
  }

  function reset() {
    setStage("config");
    setMessages([]);
    setScorecard(null);
    setSessionId("");
  }

  if (stage === "config") {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-1">{t.interview.title}</h1>
        <p className="text-zinc-500 dark:text-zinc-400 mb-6">
          {t.interview.subtitle}
        </p>

        <div className="space-y-6 border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-5">
          <div>
            <label className="text-sm font-semibold mb-2 block">{t.interview.level}</label>
            <div className="flex flex-wrap gap-2">
              {LEVEL_KEYS.map((k) => (
                <button
                  key={k}
                  onClick={() => setLevelKey(k)}
                  className={
                    "px-3 py-1.5 text-sm rounded-md border " +
                    (levelKey === k
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800")
                  }
                >
                  {t.interview.levels[k]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold mb-2 block">{t.interview.focus}</label>
            <div className="flex flex-wrap gap-2">
              {ALL_CATS.map((c) => {
                const m = CATEGORY_META[c];
                const on = focus.includes(c);
                return (
                  <button
                    key={c}
                    onClick={() => toggleFocus(c)}
                    className={
                      "px-3 py-1.5 text-sm rounded-md border flex items-center gap-1 " +
                      (on
                        ? "bg-blue-600 text-white border-blue-600"
                        : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800")
                    }
                  >
                    <span>{m.emoji}</span> {t.categories[c].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold mb-2 block">{t.interview.duration}</label>
            <div className="flex gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  className={
                    "px-3 py-1.5 text-sm rounded-md border " +
                    (duration === d
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800")
                  }
                >
                  {t.interview.durationMin(d)}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={startInterview}
            disabled={focus.length === 0}
            className="w-full py-2.5 rounded-md bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2"
          >
            <PlayCircle className="w-5 h-5" /> {t.interview.start}
          </button>
        </div>

        {history.length > 0 && (
          <div className="mt-8 space-y-4">
            <HistorySection
              history={history}
              settings={settings}
              showSettings={showSettings}
              onToggleSettings={() => setShowSettings((v) => !v)}
              onUpdateSettings={updateSettings}
              onSelectHistory={setSelectedHistory}
              onDelete={onDeleteHistory}
            />
          </div>
        )}

        <InterviewDetailDrawer
          session={selectedHistory}
          exportDir={settings.interviewExportDir}
          onClose={() => setSelectedHistory(null)}
          onDelete={onDeleteHistory}
          onOpenExported={(p) => setOpenExportedPath(p)}
        />
        <DocDrawer
          docPath={openExportedPath}
          onClose={() => setOpenExportedPath(null)}
        />
      </div>
    );
  }

  if (stage === "done" && scorecard) {
    return (
      <ScorecardView
        scorecard={scorecard}
        config={{ level, focus, duration }}
        onRestart={reset}
      />
    );
  }

  // interviewing / scoring
  return (
    <div className="max-w-4xl mx-auto px-4 py-6 flex flex-col h-[calc(100vh-100px)]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-zinc-500">
          {level} · {focus.map((c) => t.categories[c].label).join("/")} ·{" "}
          {t.interview.durationMin(duration)}
        </div>
        <button
          onClick={finishAndScore}
          disabled={stage === "scoring" || messages.length < 2}
          className="px-3 py-1.5 text-sm rounded-md border border-rose-300 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950 flex items-center gap-1 disabled:opacity-40"
        >
          {stage === "scoring" ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> {t.interview.generatingScorecard}
            </>
          ) : (
            <>
              <Square className="w-4 h-4" /> {t.interview.finishAndScore}
            </>
          )}
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-4 space-y-4"
      >
        {messages.slice(1).map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
          >
            <div
              className={
                "max-w-[88%] rounded-lg px-3 py-2 text-sm " +
                (m.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-zinc-100 dark:bg-zinc-800")
              }
            >
              {m.role === "assistant" ? (
                <>
                  <div className="text-xs font-semibold mb-1 text-zinc-500">
                    {t.interview.interviewer}
                  </div>
                  <Markdown>{m.content || "..."}</Markdown>
                </>
              ) : (
                <div className="whitespace-pre-wrap">{m.content}</div>
              )}
            </div>
          </div>
        ))}
        {loading && messages[messages.length - 1]?.role === "user" && (
          <div className="text-zinc-400 text-sm flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> {t.interview.interviewerThinking}
          </div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={3}
          placeholder={t.interview.sendShortcutHint}
          className="flex-1 p-3 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm outline-none focus:border-blue-500 resize-none"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="self-end px-4 py-2 rounded-md bg-blue-600 text-white text-sm disabled:opacity-40 flex items-center gap-1"
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

function ScorecardView({
  scorecard,
  config,
  onRestart,
}: {
  scorecard: Scorecard;
  config: { level: string; focus: Category[]; duration: number };
  onRestart: () => void;
}) {
  const { lang, t } = useLang();
  const dimLabels: Record<keyof Scorecard["dimensions"], string> = {
    concept_clarity: t.interview.dimConceptClarity,
    system_design: t.interview.dimSystemDesign,
    practical_experience: t.interview.dimPracticalExperience,
    communication: t.interview.dimCommunication,
  };
  const overallColor =
    scorecard.overall >= 80
      ? "text-emerald-600"
      : scorecard.overall >= 60
        ? "text-amber-600"
        : "text-rose-600";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Trophy className="w-6 h-6 text-amber-500" /> {t.interview.scoreReport}
        </h1>
        <button
          onClick={onRestart}
          className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          {t.interview.restart}
        </button>
      </div>

      <div className="text-xs text-zinc-500">
        {config.level} · {config.focus.map((c) => t.categories[c].label).join("/")} ·{" "}
        {t.interview.durationMin(config.duration)}
      </div>

      <div className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-5 flex items-center gap-6">
        <div>
          <div className="text-xs text-zinc-500">{t.interview.overall}</div>
          <div className={`text-5xl font-bold ${overallColor}`}>
            {scorecard.overall}
            <span className="text-lg text-zinc-400">/100</span>
          </div>
        </div>
        <div className="flex-1 text-sm text-zinc-700 dark:text-zinc-200">
          {scorecard.summary}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {(Object.keys(dimLabels) as Array<keyof Scorecard["dimensions"]>).map(
          (k) => (
            <div
              key={k}
              className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900 p-3"
            >
              <div className="text-xs text-zinc-500">{dimLabels[k]}</div>
              <div className="text-2xl font-semibold mt-1">
                {scorecard.dimensions[k]}
                <span className="text-sm text-zinc-400">/100</span>
              </div>
              <div className="mt-1 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500"
                  style={{ width: `${scorecard.dimensions[k]}%` }}
                />
              </div>
            </div>
          ),
        )}
      </div>

      {scorecard.strengths.length > 0 && (
        <Section title={t.interview.strengths} tone="emerald" items={scorecard.strengths} />
      )}
      {scorecard.weaknesses.length > 0 && (
        <Section title={t.interview.weaknesses} tone="rose" items={scorecard.weaknesses} />
      )}

      {scorecard.knowledge_gaps.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-zinc-500 mb-2">
            {t.interview.knowledgeGaps}
          </h2>
          <div className="space-y-2">
            {scorecard.knowledge_gaps.map((g, i) => {
              const found = g.checkpoint_id
                ? getCheckpoint(g.checkpoint_id)
                : undefined;
              return (
                <div
                  key={i}
                  className="p-3 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40"
                >
                  <div className="text-sm">{g.description}</div>
                  {found && (
                    <div className="mt-1 text-xs">
                      <Link
                        href={`/learn/${found.topic.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        → {t.interview.gotoStudy(localizedCheckpointName(found.checkpoint, lang))}
                      </Link>
                      <Link
                        href={`/quiz?cp=${found.checkpoint.id}`}
                        className="text-blue-600 hover:underline ml-3"
                      >
                        → {t.interview.quizMeOnIt}
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {scorecard.next_steps.length > 0 && (
        <Section
          title={t.interview.nextSteps}
          tone="blue"
          items={scorecard.next_steps}
        />
      )}
    </div>
  );
}

function Section({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "emerald" | "rose" | "blue";
  items: string[];
}) {
  const cls =
    tone === "emerald"
      ? "border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40"
      : tone === "rose"
        ? "border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40"
        : "border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40";
  return (
    <div>
      <h2 className="text-sm font-semibold text-zinc-500 mb-2">{title}</h2>
      <div className={`rounded-md border p-3 ${cls}`}>
        <ul className="list-disc pl-5 text-sm space-y-1">
          {items.map((s, i) => (
            <li key={i} className="flex items-start gap-1.5">
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 opacity-60" />
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function HistorySection({
  history,
  settings,
  showSettings,
  onToggleSettings,
  onUpdateSettings,
  onSelectHistory,
  onDelete,
}: {
  history: InterviewSession[];
  settings: AppSettings;
  showSettings: boolean;
  onToggleSettings: () => void;
  onUpdateSettings: (s: AppSettings) => void;
  onSelectHistory: (s: InterviewSession) => void;
  onDelete: (id: string) => void;
}) {
  const t = useLang().t;
  const stats = computeInterviewStats(history);

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-500 flex items-center gap-1.5">
          <BarChart3 className="w-3.5 h-3.5" />
          {t.interview.historyAnalytics(history.length)}
        </h2>
        <button
          onClick={onToggleSettings}
          className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white flex items-center gap-1"
        >
          <FolderCog className="w-3.5 h-3.5" /> {t.common.settings}
        </button>
      </div>

      {showSettings && (
        <SettingsCard settings={settings} onUpdate={onUpdateSettings} />
      )}

      {stats.count > 0 && <AnalyticsCard stats={stats} />}

      <div className="space-y-2">
        {history.map((h) => (
          <HistoryRow
            key={h.id}
            session={h}
            onOpen={() => onSelectHistory(h)}
            onDelete={() => {
              if (confirm(t.interview.confirmRemoveHistory)) onDelete(h.id);
            }}
          />
        ))}
      </div>
    </>
  );
}

function SettingsCard({
  settings,
  onUpdate,
}: {
  settings: AppSettings;
  onUpdate: (s: AppSettings) => void;
}) {
  const t = useLang().t;
  const [draft, setDraft] = useState(settings.interviewExportDir);
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-md p-3 bg-white dark:bg-zinc-900 text-sm">
      <label className="text-xs font-semibold text-zinc-500 block mb-1">
        {t.interview.exportDirLabel}
      </label>
      <div className="flex gap-2 items-center">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t.interview.exportDirPlaceholder}
          className="flex-1 px-2 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-700 bg-transparent outline-none focus:border-blue-500 font-mono"
        />
        <button
          onClick={() =>
            onUpdate({ ...settings, interviewExportDir: draft.trim() })
          }
          disabled={draft.trim() === settings.interviewExportDir}
          className="px-2.5 py-1 text-xs rounded bg-blue-600 text-white disabled:opacity-40"
        >
          {t.common.save}
        </button>
        <button
          onClick={() => {
            setDraft(DEFAULT_SETTINGS.interviewExportDir);
            onUpdate({
              ...settings,
              interviewExportDir: DEFAULT_SETTINGS.interviewExportDir,
            });
          }}
          className="px-2.5 py-1 text-xs rounded border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          {t.common.restoreDefault}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        {t.interview.exportDirHelp}
      </p>
    </div>
  );
}

function AnalyticsCard({
  stats,
}: {
  stats: ReturnType<typeof computeInterviewStats>;
}) {
  const { lang, t } = useLang();
  if (!stats.avgDims || stats.avgOverall == null) return null;
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-md p-3 bg-white dark:bg-zinc-900">
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-xs text-zinc-500">{t.interview.basedOnNSessions(stats.count)}</span>
        <span className="text-zinc-400">·</span>
        <span className="text-xs text-zinc-500">
          {t.interview.avgOverall}：<span className="text-emerald-600 font-bold">{stats.avgOverall}</span>
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <DimMini label={t.interview.dimConceptClarity} value={stats.avgDims.concept_clarity} />
        <DimMini label={t.interview.dimSystemDesign} value={stats.avgDims.system_design} />
        <DimMini label={t.interview.dimPracticalExperience} value={stats.avgDims.practical_experience} />
        <DimMini label={t.interview.dimCommunication} value={stats.avgDims.communication} />
      </div>

      {stats.topGaps.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-semibold text-zinc-500 mb-1">
            {t.interview.topGaps}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {stats.topGaps.map((g) => {
              const cp = getCheckpoint(g.checkpoint_id);
              const display = cp ? localizedCheckpointName(cp.checkpoint, lang) : g.checkpoint_id;
              return (
                <Link
                  key={g.checkpoint_id + g.count}
                  href={cp ? `/learn/${cp.topic.id}` : "#"}
                  className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 hover:bg-amber-200 dark:hover:bg-amber-900"
                >
                  {display}
                  <span className="ml-1 text-amber-600">×{g.count}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {stats.trend.length >= 2 && (
        <div>
          <div className="text-xs font-semibold text-zinc-500 mb-1">{t.interview.trend}</div>
          <TrendBars trend={stats.trend} />
        </div>
      )}
    </div>
  );
}

function DimMini({ label, value }: { label: string; value: number }) {
  const color =
    value >= 80 ? "bg-emerald-500" : value >= 60 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="p-1.5 rounded bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-xs">
      <div className="text-zinc-500">{label}</div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="font-semibold tabular-nums">{value}</span>
        <div className="flex-1 h-1 bg-zinc-200 dark:bg-zinc-800 rounded">
          <div
            className={`h-full rounded ${color}`}
            style={{ width: `${value}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function TrendBars({
  trend,
}: {
  trend: ReturnType<typeof computeInterviewStats>["trend"];
}) {
  const max = Math.max(100, ...trend.map((t) => t.overall));
  return (
    <div className="flex items-end gap-1 h-16">
      {trend.map((t, i) => {
        const h = Math.max(4, (t.overall / max) * 60);
        const color =
          t.overall >= 80
            ? "bg-emerald-500"
            : t.overall >= 60
              ? "bg-amber-500"
              : "bg-rose-500";
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center min-w-0 group relative"
            title={`${new Date(t.at).toLocaleDateString()} · ${t.overall}/100`}
          >
            <div
              className={`w-full rounded-t ${color}`}
              style={{ height: `${h}px` }}
            />
            <div className="text-[10px] text-zinc-400 mt-0.5 tabular-nums">
              {t.overall}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoryRow({
  session,
  onOpen,
  onDelete,
}: {
  session: InterviewSession;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const t = useLang().t;
  const sc = session.scorecard;
  const scoreColor =
    sc && sc.overall >= 80
      ? "text-emerald-600"
      : sc && sc.overall >= 60
        ? "text-amber-600"
        : "text-rose-600";
  return (
    <div className="border border-zinc-200 dark:border-zinc-800 rounded-md p-3 bg-white dark:bg-zinc-900 flex items-center justify-between gap-3">
      <button onClick={onOpen} className="flex-1 min-w-0 text-left">
        <div className="text-sm font-medium truncate">
          {session.config.level} · {session.config.focus.join("/")} ·{" "}
          {t.interview.durationMin(session.config.durationMin)}
        </div>
        <div className="text-xs text-zinc-500">
          {new Date(session.at).toLocaleString()} ·{" "}
          {t.interview.transcriptCountShort(session.messages.length - 1)}
        </div>
      </button>
      {sc && (
        <div className={`font-bold tabular-nums ${scoreColor}`}>
          {sc.overall}
          <span className="text-xs text-zinc-400">/100</span>
        </div>
      )}
      <div className="flex items-center gap-1">
        <button
          onClick={onOpen}
          title={t.common.preview}
          className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <Eye className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          title={t.common.delete}
          className="p-1.5 rounded hover:bg-rose-100 dark:hover:bg-rose-950 text-rose-600"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
