"use client";

import {
  ALL_TOPICS,
  CATEGORY_META,
  MASTERY_META,
  type Category,
} from "@/lib/knowledge";
import type { ProgressMap } from "@/lib/storage";

interface Props {
  progress: ProgressMap;
  onPick?: (checkpointId: string) => void;
  highlightId?: string;
}

const CATEGORY_ORDER: Category[] = ["training", "inference", "hardware", "system"];

export function KnowledgeMap({ progress, onPick, highlightId }: Props) {
  return (
    <div className="space-y-5">
      {CATEGORY_ORDER.map((cat) => {
        const topics = ALL_TOPICS.filter((t) => t.category === cat);
        const meta = CATEGORY_META[cat];
        return (
          <div key={cat}>
            <div className="text-xs font-semibold text-zinc-500 mb-2 flex items-center gap-1">
              <span>{meta.emoji}</span> {meta.label}
            </div>
            <div className="space-y-1.5">
              {topics.map((t) => (
                <div key={t.id} className="flex items-center gap-2">
                  <div className="text-xs w-32 shrink-0 truncate text-zinc-600 dark:text-zinc-300">
                    {t.title}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {t.checkpoints.map((cp) => {
                      const s = progress[cp.id]?.status ?? "unknown";
                      const m = MASTERY_META[s];
                      const isHi = cp.id === highlightId;
                      return (
                        <button
                          key={cp.id}
                          onClick={() => onPick?.(cp.id)}
                          title={`${cp.name} · ${m.label}`}
                          className={
                            "w-5 h-5 rounded " +
                            m.color +
                            (isHi
                              ? " ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-zinc-900"
                              : "") +
                            (onPick ? " hover:scale-110 transition" : "")
                          }
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="flex gap-3 text-xs text-zinc-500 pt-2 border-t border-zinc-200 dark:border-zinc-800">
        {(["unknown", "gap", "learning", "mastered"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`w-3 h-3 rounded ${MASTERY_META[s].color}`} />
            {MASTERY_META[s].label}
          </span>
        ))}
      </div>
    </div>
  );
}
