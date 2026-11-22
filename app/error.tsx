"use client";

/** 路由级错误边界（反馈：刷新白屏——渲染异常会让整棵树卸载成空白，必须有兜底 UI） */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="max-w-xl mx-auto px-6 py-20 text-center">
      <h2 className="text-lg font-semibold mb-2">页面出错了</h2>
      <p className="text-sm text-zinc-500 mb-1">渲染时发生异常，内容已停止显示（这不是白屏，是兜底提示）。</p>
      <p className="text-xs text-zinc-400 mb-6 break-all">{error?.message ?? String(error)}</p>
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-500"
        >
          重试
        </button>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          刷新页面
        </button>
      </div>
    </div>
  );
}
