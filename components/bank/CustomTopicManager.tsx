"use client";

import { useState, useEffect } from "react";
import {
  loadCustomTopics,
  loadCustomCheckpoints,
  addCustomTopic,
  addCustomCheckpoint,
  deleteCustomTopic,
  deleteCustomCheckpoint,
  type CustomTopic,
  type CustomCheckpoint,
} from "@/lib/storage";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  onSelect?: (checkpointId: string, topicTitle: string, checkpointName: string) => void;
}

export function CustomTopicManager({ onSelect }: Props) {
  const [topics, setTopics] = useState<CustomTopic[]>([]);
  const [checkpoints, setCheckpoints] = useState<CustomCheckpoint[]>([]);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());

  // 创建主题表单
  const [showTopicForm, setShowTopicForm] = useState(false);
  const [newTopicTitle, setNewTopicTitle] = useState("");
  const [newTopicSummary, setNewTopicSummary] = useState("");
  const [newTopicCategory, setNewTopicCategory] = useState("");

  // 创建知识点表单
  const [showCheckpointForm, setShowCheckpointForm] = useState<string | null>(null);
  const [newCheckpointName, setNewCheckpointName] = useState("");
  const [newCheckpointMustKnow, setNewCheckpointMustKnow] = useState("");

  useEffect(() => {
    setTopics(loadCustomTopics());
    setCheckpoints(loadCustomCheckpoints());
  }, []);

  function handleAddTopic() {
    if (!newTopicTitle.trim()) return;
    const topic = addCustomTopic({
      title: newTopicTitle,
      summary: newTopicSummary || `${newTopicTitle}相关知识`,
      category: newTopicCategory || "自定义",
    });
    setTopics([topic, ...topics]);
    setNewTopicTitle("");
    setNewTopicSummary("");
    setNewTopicCategory("");
    setShowTopicForm(false);
    setExpandedTopics(new Set([...expandedTopics, topic.id]));
  }

  function handleDeleteTopic(id: string) {
    if (!confirm("删除主题会同时删除其下所有知识点，确定吗？")) return;
    deleteCustomTopic(id);
    setTopics(topics.filter((t) => t.id !== id));
    setCheckpoints(checkpoints.filter((cp) => cp.topicId !== id));
  }

  function handleAddCheckpoint(topicId: string) {
    if (!newCheckpointName.trim()) return;
    const checkpoint = addCustomCheckpoint({
      topicId,
      name: newCheckpointName,
      mustKnow: newCheckpointMustKnow || `${newCheckpointName}的相关内容`,
      commonMisconceptions: [],
      interviewAngles: [],
    });
    setCheckpoints([checkpoint, ...checkpoints]);
    setNewCheckpointName("");
    setNewCheckpointMustKnow("");
    setShowCheckpointForm(null);
  }

  function handleDeleteCheckpoint(id: string) {
    if (!confirm("确定删除此知识点吗？")) return;
    deleteCustomCheckpoint(id);
    setCheckpoints(checkpoints.filter((cp) => cp.id !== id));
  }

  function toggleTopic(id: string) {
    const next = new Set(expandedTopics);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpandedTopics(next);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">自定义知识库</h3>
        <button
          onClick={() => setShowTopicForm(!showTopicForm)}
          className="flex items-center gap-1 px-2.5 py-1 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700"
        >
          <Plus className="w-3 h-3" />
          新增主题
        </button>
      </div>

      {showTopicForm && (
        <div className="p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 space-y-2">
          <input
            className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            placeholder="主题名称（必填）"
            value={newTopicTitle}
            onChange={(e) => setNewTopicTitle(e.target.value)}
          />
          <input
            className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            placeholder="分类标签（选填，如：自定义、工具链等）"
            value={newTopicCategory}
            onChange={(e) => setNewTopicCategory(e.target.value)}
          />
          <textarea
            className="w-full px-3 py-2 text-sm rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
            placeholder="主题简介（选填）"
            rows={2}
            value={newTopicSummary}
            onChange={(e) => setNewTopicSummary(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              onClick={handleAddTopic}
              disabled={!newTopicTitle.trim()}
              className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
            >
              创建主题
            </button>
            <button
              onClick={() => setShowTopicForm(false)}
              className="px-3 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {topics.length === 0 && !showTopicForm && (
        <div className="text-center py-8 text-zinc-400 text-sm">
          暂无自定义主题，点击"新增主题"创建第一个
        </div>
      )}

      <div className="space-y-2">
        {topics.map((topic) => {
          const topicCheckpoints = checkpoints.filter((cp) => cp.topicId === topic.id);
          const expanded = expandedTopics.has(topic.id);

          return (
            <div key={topic.id} className="border border-zinc-200 dark:border-zinc-800 rounded-lg bg-white dark:bg-zinc-900">
              <div className="flex items-center gap-2 px-3 py-2">
                <button onClick={() => toggleTopic(topic.id)} className="shrink-0">
                  {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{topic.title}</div>
                  <div className="text-xs text-zinc-500">{topic.category} · {topicCheckpoints.length} 个知识点</div>
                </div>
                <button
                  onClick={() => handleDeleteTopic(topic.id)}
                  className="shrink-0 p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {expanded && (
                <div className="border-t border-zinc-200 dark:border-zinc-800 px-3 py-2 space-y-2">
                  <button
                    onClick={() => setShowCheckpointForm(topic.id)}
                    className="w-full text-left px-2.5 py-1.5 text-xs rounded-md border border-dashed border-zinc-300 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    添加知识点
                  </button>

                  {showCheckpointForm === topic.id && (
                    <div className="p-2 rounded-md bg-zinc-50 dark:bg-zinc-800/50 space-y-2">
                      <input
                        className="w-full px-2.5 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                        placeholder="知识点名称（必填）"
                        value={newCheckpointName}
                        onChange={(e) => setNewCheckpointName(e.target.value)}
                      />
                      <textarea
                        className="w-full px-2.5 py-1.5 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                        placeholder="核心内容（选填）"
                        rows={2}
                        value={newCheckpointMustKnow}
                        onChange={(e) => setNewCheckpointMustKnow(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAddCheckpoint(topic.id)}
                          disabled={!newCheckpointName.trim()}
                          className="px-2.5 py-1 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40"
                        >
                          创建知识点
                        </button>
                        <button
                          onClick={() => setShowCheckpointForm(null)}
                          className="px-2.5 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}

                  {topicCheckpoints.map((cp) => (
                    <div
                      key={cp.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 group"
                    >
                      <span className="flex-1 text-sm truncate min-w-0">{cp.name}</span>
                      {onSelect && (
                        <button
                          onClick={() => onSelect(cp.id, topic.title, cp.name)}
                          className="shrink-0 px-2 py-0.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 opacity-0 group-hover:opacity-100"
                        >
                          选择
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteCheckpoint(cp.id)}
                        className="shrink-0 p-1 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded opacity-0 group-hover:opacity-100"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
