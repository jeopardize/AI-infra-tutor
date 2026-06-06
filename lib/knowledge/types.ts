export type Category = "training" | "inference" | "hardware" | "system";

export const CATEGORY_META: Record<
  Category,
  { label: string; color: string; emoji: string; description: string }
> = {
  training: {
    label: "训练基础设施",
    color: "bg-blue-500",
    emoji: "🏋️",
    description: "分布式训练、并行策略、通信、显存优化",
  },
  inference: {
    label: "推理基础设施",
    color: "bg-emerald-500",
    emoji: "⚡",
    description: "服务化、KV cache、批处理、量化、加速",
  },
  hardware: {
    label: "硬件与算子",
    color: "bg-purple-500",
    emoji: "🔧",
    description: "GPU 架构、CUDA、Triton、算子融合、性能分析",
  },
  system: {
    label: "系统工程",
    color: "bg-amber-500",
    emoji: "🛠️",
    description: "调度、监控、存储、服务化、成本",
  },
};

export interface Checkpoint {
  id: string;
  name: string;
  /** Markdown：该 checkpoint 必须掌握的核心要点 */
  mustKnow: string;
  /** 学习者常见的误区或偏差 */
  commonMisconceptions: string[];
  /** 面试中常见的追问角度（用于出题与模拟面试） */
  interviewAngles: string[];
}

export interface Resource {
  title: string;
  url: string;
  kind: "paper" | "blog" | "docs" | "video" | "code";
}

export interface Topic {
  id: string;
  title: string;
  category: Category;
  /** 一句话描述，用于卡片展示 */
  summary: string;
  /** 推荐先学的 topic id */
  prerequisites: string[];
  checkpoints: Checkpoint[];
  resources: Resource[];
  /** 个人笔记库中相关文档的相对路径（相对于 KNOWLEDGE_LIBRARY_PATH） */
  localDocs?: string[];
}

export type MasteryStatus = "unknown" | "learning" | "gap" | "mastered";

export const MASTERY_META: Record<
  MasteryStatus,
  { label: string; color: string; weight: number }
> = {
  unknown: { label: "未学", color: "bg-zinc-300 dark:bg-zinc-700", weight: 0 },
  gap: { label: "盲点", color: "bg-rose-500", weight: 1 },
  learning: { label: "学习中", color: "bg-amber-500", weight: 2 },
  mastered: { label: "已掌握", color: "bg-emerald-500", weight: 3 },
};
