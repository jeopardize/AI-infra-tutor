import { MASTERY_META, type MasteryStatus } from "@/lib/knowledge";

export function MasteryBadge({
  status,
  size = "sm",
}: {
  status: MasteryStatus;
  size?: "sm" | "md";
}) {
  const meta = MASTERY_META[status];
  const dim = size === "sm" ? "w-2.5 h-2.5" : "w-3.5 h-3.5";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-300">
      <span className={`${dim} rounded-full ${meta.color}`} />
      {meta.label}
    </span>
  );
}

export function MasteryDot({ status }: { status: MasteryStatus }) {
  const meta = MASTERY_META[status];
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${meta.color}`}
      title={meta.label}
    />
  );
}
