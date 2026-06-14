"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ALL_TOPICS,
  CATEGORY_META,
  TOPICS_BY_CATEGORY,
  type Category,
} from "@/lib/knowledge";
import { TopicCard } from "@/components/TopicCard";
import {
  computeTopicStats,
  computeCustomTopicStats,
  loadProgress,
  loadCustomTopics,
  type TopicStat,
  type CustomTopic,
} from "@/lib/storage";
import { useT } from "@/lib/i18n/context";
import { BookOpen, MessageSquare, Target } from "lucide-react";

const CATEGORY_ORDER: Category[] = ["training", "inference", "hardware", "system"];

export default function HomePage() {
  const t = useT();
  const [stats, setStats] = useState<TopicStat[]>([]);
  const [customStats, setCustomStats] = useState<TopicStat[]>([]);
  const [customTopics, setCustomTopics] = useState<CustomTopic[]>([]);
  const [totals, setTotals] = useState({ mastered: 0, gap: 0, total: 0 });

  useEffect(() => {
    const progress = loadProgress();
    const s = computeTopicStats(progress);
    const cs = computeCustomTopicStats(progress);
    const ct = loadCustomTopics();

    setStats(s);
    setCustomStats(cs);
    setCustomTopics(ct);

    const allStats = [...s, ...cs];
    const acc = allStats.reduce(
      (a, x) => ({
        mastered: a.mastered + x.mastered,
        gap: a.gap + x.gap,
        total: a.total + x.total,
      }),
      { mastered: 0, gap: 0, total: 0 },
    );
    setTotals(acc);
  }, []);

  const statMap = new Map(stats.map((s) => [s.topicId, s]));
  const customStatMap = new Map(customStats.map((s) => [s.topicId, s]));
  const overallPct =
    totals.total === 0 ? 0 : Math.round((totals.mastered / totals.total) * 100);

  const totalTopics = ALL_TOPICS.length + customTopics.length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <section className="mb-8">
        <h1 className="text-2xl font-bold mb-2">{t.dashboard.welcomeTitle}</h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          {t.dashboard.statsTpl({
            topics: totalTopics,
            total: totals.total,
            mastered: totals.mastered,
            gap: totals.gap,
          })}
        </p>
        <div className="mt-3 h-2 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden max-w-md">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-10">
        <ActionCard
          href="/quiz"
          icon={<Target className="w-5 h-5" />}
          title={t.dashboard.actionQuizTitle}
          desc={t.dashboard.actionQuizDesc}
          color="bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300"
        />
        <ActionCard
          href={`/learn/${ALL_TOPICS[0].id}`}
          icon={<BookOpen className="w-5 h-5" />}
          title={t.dashboard.actionLearnTitle}
          desc={t.dashboard.actionLearnDesc}
          color="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
        />
        <ActionCard
          href="/interview"
          icon={<MessageSquare className="w-5 h-5" />}
          title={t.dashboard.actionInterviewTitle}
          desc={t.dashboard.actionInterviewDesc}
          color="bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
        />
      </section>

      {CATEGORY_ORDER.map((cat) => {
        const topics = TOPICS_BY_CATEGORY[cat];
        const meta = CATEGORY_META[cat];
        const catText = t.categories[cat];
        return (
          <section key={cat} className="mb-10">
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-xl">{meta.emoji}</span>
              <h2 className="text-lg font-semibold">{catText.label}</h2>
              <span className="text-xs text-zinc-500">{catText.description}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {topics.map((t) => (
                <TopicCard key={t.id} topic={t} stat={statMap.get(t.id)} />
              ))}
            </div>
          </section>
        );
      })}

      {customTopics.length > 0 && (
        <section className="mb-10">
          <div className="flex items-baseline gap-2 mb-3">
            <span className="text-xl">📚</span>
            <h2 className="text-lg font-semibold">自定义知识库</h2>
            <span className="text-xs text-zinc-500">你创建的主题</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {customTopics.map((topic) => (
              <CustomTopicCard key={topic.id} topic={topic} stat={customStatMap.get(topic.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function CustomTopicCard({
  topic,
  stat,
}: {
  topic: import("@/lib/storage").CustomTopic;
  stat?: import("@/lib/storage").TopicStat;
}) {
  const total = stat?.total ?? 0;
  const mastered = stat?.mastered ?? 0;
  const learning = stat?.learning ?? 0;
  const gap = stat?.gap ?? 0;
  const pct = total === 0 ? 0 : Math.round((mastered / total) * 100);

  return (
    <div className="block p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">📚</span>
        <span className="text-xs text-zinc-500">{topic.category}</span>
      </div>
      <div className="font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
        {topic.title}
      </div>
      <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-3 line-clamp-2">
        {topic.summary}
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <div className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
        </div>
        <span className="tabular-nums">{mastered}/{total}</span>
      </div>
      {(learning > 0 || gap > 0) && (
        <div className="mt-2 flex items-center gap-3 text-[11px] text-zinc-500">
          {learning > 0 && (
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-1" />
              学习中 {learning}
            </span>
          )}
          {gap > 0 && (
            <span>
              <span className="inline-block w-2 h-2 rounded-full bg-rose-500 mr-1" />
              待补强 {gap}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function ActionCard({
  href,
  icon,
  title,
  desc,
  color,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="block p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 bg-white dark:bg-zinc-900 transition"
    >
      <div
        className={`inline-flex items-center justify-center w-9 h-9 rounded-md mb-2 ${color}`}
      >
        {icon}
      </div>
      <div className="font-semibold mb-1">{title}</div>
      <div className="text-sm text-zinc-500 dark:text-zinc-400">{desc}</div>
    </Link>
  );
}
