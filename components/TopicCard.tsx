"use client";

import Link from "next/link";
import { CATEGORY_META, type Topic } from "@/lib/knowledge";
import type { TopicStat } from "@/lib/storage";

export function TopicCard({
  topic,
  stat,
}: {
  topic: Topic;
  stat?: TopicStat;
}) {
  const meta = CATEGORY_META[topic.category];
  const total = stat?.total ?? topic.checkpoints.length;
  const mastered = stat?.mastered ?? 0;
  const learning = stat?.learning ?? 0;
  const gap = stat?.gap ?? 0;
  const pct = total === 0 ? 0 : Math.round((mastered / total) * 100);

  return (
    <Link
      href={`/learn/${topic.id}`}
      className="block p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 dark:hover:border-zinc-600 transition bg-white dark:bg-zinc-900"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{meta.emoji}</span>
        <span className="text-xs text-zinc-500">{meta.label}</span>
      </div>
      <div className="font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
        {topic.title}
      </div>
      <div className="text-sm text-zinc-500 dark:text-zinc-400 mb-3 line-clamp-2">
        {topic.summary}
      </div>
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <div className="flex-1 h-1.5 bg-zinc-200 dark:bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500"
            style={{ width: `${pct}%` }}
          />
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
              盲点 {gap}
            </span>
          )}
        </div>
      )}
    </Link>
  );
}
