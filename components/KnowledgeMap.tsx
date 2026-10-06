"use client";

import { useEffect, useState } from "react";
import { MASTERY_META, type MasteryStatus } from "@/lib/knowledge";
import { loadQuestionProgress } from "@/lib/storage";
import { useLang } from "@/lib/i18n/context";
import { Loader2, FolderTree } from "lucide-react";

/**
 * 知识地图：以笔记库文件夹分类（题库实际存储结构）为骨架，
 * 每道题一个掌握度色块，点击直接选中该题。
 */

interface MapQuestion {
  id: string;
  category: string;
  question: { zh: string; en: string };
}

interface Props {
  onPick?: (questionId: string) => void;
  highlightId?: string;
}

export function KnowledgeMap({ onPick, highlightId }: Props) {
  const { t } = useLang();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Map<string, MapQuestion[]>>(new Map());

  useEffect(() => {
    fetch("/api/questions")
      .then((r) => r.json())
      .then((d: { questions?: MapQuestion[] }) => {
        const map = new Map<string, MapQuestion[]>();
        for (const q of d.questions ?? []) {
          const arr = map.get(q.category) ?? [];
          arr.push(q);
          map.set(q.category, arr);
        }
        setGroups(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const progress = loadQuestionProgress();

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-400 py-6 justify-center">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 正在加载笔记库分类…
      </div>
    );
  }

  if (groups.size === 0) {
    return (
      <div className="text-xs text-zinc-400 py-6 text-center">
        <FolderTree className="w-5 h-5 mx-auto mb-1" />
        笔记库暂无题目，去题库页面添加
      </div>
    );
  }

  const entries = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "zh"));

  return (
    <div className="space-y-4">
      {entries.map(([cat, questions]) => (
        <div key={cat}>
          <div className="text-xs font-semibold text-zinc-500 mb-2 flex items-center gap-1">
            <FolderTree className="w-3.5 h-3.5 text-zinc-400" />
            <span className="truncate">{cat}</span>
            <span className="text-[10px] text-zinc-400 font-normal">{questions.length}</span>
          </div>
          <div className="flex gap-1 flex-wrap">
            {questions.map((q) => {
              const s = (progress[q.id]?.status ?? "unknown") as MasteryStatus;
              const m = MASTERY_META[s];
              const isHi = q.id === highlightId;
              return (
                <button
                  key={q.id}
                  onClick={() => onPick?.(q.id)}
                  title={`${q.question.zh || q.question.en} · ${t.mastery[s]}`}
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

      <div className="flex gap-3 text-xs text-zinc-500 pt-2 border-t border-zinc-200 dark:border-zinc-800">
        {(["unknown", "gap", "learning", "mastered"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className={`w-3 h-3 rounded ${MASTERY_META[s].color}`} />
            {t.mastery[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
