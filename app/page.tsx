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
  loadProgress,
  type TopicStat,
} from "@/lib/storage";
import { BookOpen, MessageSquare, Target } from "lucide-react";

const CATEGORY_ORDER: Category[] = ["training", "inference", "hardware", "system"];

export default function HomePage() {
  const [stats, setStats] = useState<TopicStat[]>([]);
  const [totals, setTotals] = useState({ mastered: 0, gap: 0, total: 0 });

  useEffect(() => {
    const progress = loadProgress();
    const s = computeTopicStats(progress);
    setStats(s);
    const acc = s.reduce(
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
  const overallPct =
    totals.total === 0 ? 0 : Math.round((totals.mastered / totals.total) * 100);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <section className="mb-8">
        <h1 className="text-2xl font-bold mb-2">
          欢迎，开始你的 AI Infra 学习之旅
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400">
          共 <strong>{ALL_TOPICS.length}</strong> 个主题、
          <strong>{totals.total}</strong> 个 checkpoint。已掌握{" "}
          <strong className="text-emerald-600">{totals.mastered}</strong>，盲点{" "}
          <strong className="text-rose-600">{totals.gap}</strong>。
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
          title="查漏补缺"
          desc="挑一个 checkpoint，AI 出题、批改、揭示你的盲点"
          color="bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300"
        />
        <ActionCard
          href={`/learn/${ALL_TOPICS[0].id}`}
          icon={<BookOpen className="w-5 h-5" />}
          title="开始学习"
          desc="从知识点详情进入，边读边和 AI 导师对话"
          color="bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300"
        />
        <ActionCard
          href="/interview"
          icon={<MessageSquare className="w-5 h-5" />}
          title="模拟面试"
          desc="多轮对话式模拟，结束生成可量化的 scorecard"
          color="bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300"
        />
      </section>

      {CATEGORY_ORDER.map((cat) => {
        const topics = TOPICS_BY_CATEGORY[cat];
        const meta = CATEGORY_META[cat];
        return (
          <section key={cat} className="mb-10">
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-xl">{meta.emoji}</span>
              <h2 className="text-lg font-semibold">{meta.label}</h2>
              <span className="text-xs text-zinc-500">{meta.description}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {topics.map((t) => (
                <TopicCard key={t.id} topic={t} stat={statMap.get(t.id)} />
              ))}
            </div>
          </section>
        );
      })}
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
