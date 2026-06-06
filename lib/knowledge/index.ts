import type { Category, Checkpoint, Topic } from "./types";
import { trainingTopics } from "./training";
import { inferenceTopics } from "./inference";
import { hardwareTopics } from "./hardware";
import { systemTopics } from "./system";

export const ALL_TOPICS: Topic[] = [
  ...trainingTopics,
  ...inferenceTopics,
  ...hardwareTopics,
  ...systemTopics,
];

export const TOPICS_BY_CATEGORY: Record<Category, Topic[]> = {
  training: trainingTopics,
  inference: inferenceTopics,
  hardware: hardwareTopics,
  system: systemTopics,
};

export function getTopic(id: string): Topic | undefined {
  return ALL_TOPICS.find((t) => t.id === id);
}

export function getCheckpoint(
  checkpointId: string,
): { topic: Topic; checkpoint: Checkpoint } | undefined {
  for (const topic of ALL_TOPICS) {
    const cp = topic.checkpoints.find((c) => c.id === checkpointId);
    if (cp) return { topic, checkpoint: cp };
  }
  return undefined;
}

export const ALL_CHECKPOINT_IDS: string[] = ALL_TOPICS.flatMap((t) =>
  t.checkpoints.map((c) => c.id),
);

/** 生成给 Claude 的紧凑知识树（用于 system prompt） */
export function compactKnowledgeTree(): string {
  const lines: string[] = [];
  for (const topic of ALL_TOPICS) {
    lines.push(`## [${topic.category}] ${topic.id} — ${topic.title}`);
    lines.push(topic.summary);
    for (const cp of topic.checkpoints) {
      lines.push(`  - checkpoint \`${cp.id}\` (${cp.name})`);
      lines.push(`    面试角度: ${cp.interviewAngles.join(" / ")}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

export * from "./types";
