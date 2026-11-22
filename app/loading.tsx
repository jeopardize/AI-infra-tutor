/** 全局路由级骨架屏（反馈：刷新时白屏，体验差）——SSR 流式阶段先发出骨架，不再整页空白 */
export default function Loading() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 animate-pulse">
      <div className="h-7 w-56 rounded bg-zinc-200 dark:bg-zinc-800 mb-3" />
      <div className="h-4 w-96 max-w-full rounded bg-zinc-100 dark:bg-zinc-900 mb-8" />
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6 items-start">
        <div className="space-y-4">
          <div className="h-40 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800" />
          <div className="h-40 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800" />
          <div className="h-40 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800" />
        </div>
        <div className="h-96 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800" />
      </div>
    </div>
  );
}
