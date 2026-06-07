import type { QuestionItem } from "@/lib/storage";

export function exportAsJson(items: QuestionItem[]): void {
  const blob = new Blob([JSON.stringify(items, null, 2)], {
    type: "application/json",
  });
  downloadBlob(blob, `question-bank-${formatDate()}.json`);
}

export function exportAsMarkdown(items: QuestionItem[]): void {
  const lines: string[] = ["# Question Bank\n"];
  const grouped = groupBy(items, (q) => q.category);
  for (const [category, qs] of Object.entries(grouped)) {
    lines.push(`## ${category}\n`);
    qs.forEach((q, i) => {
      lines.push(`### ${i + 1}. ${q.question.zh || q.question.en}`);
      if (q.question.zh && q.question.en) {
        lines.push(`**Question (EN):** ${q.question.en}`);
      }
      if (q.question.zh && q.question.en) {
        lines.push(`**Question (ZH):** ${q.question.zh}`);
      }
      lines.push(`**Answer (ZH):** ${q.answer.zh}`);
      lines.push(`**Answer (EN):** ${q.answer.en}`);
      lines.push("");
    });
  }
  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  downloadBlob(blob, `question-bank-${formatDate()}.md`);
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Record<string, T[]> {
  const map: Record<string, T[]> = {};
  items.forEach((item) => {
    const key = keyFn(item);
    if (!map[key]) map[key] = [];
    map[key].push(item);
  });
  return map;
}

function formatDate(): string {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
