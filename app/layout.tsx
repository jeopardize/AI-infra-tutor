import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Infra Tutor",
  description: "你的 AI Infrastructure 学习与模拟面试助手",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
            <Link href="/" className="font-semibold tracking-tight">
              <span className="text-blue-600">AI Infra</span>
              <span className="text-zinc-400 mx-1">·</span>
              <span>Tutor</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-300">
              <Link href="/" className="hover:text-zinc-900 dark:hover:text-white">
                总览
              </Link>
              <Link href="/quiz" className="hover:text-zinc-900 dark:hover:text-white">
                查漏补缺
              </Link>
              <Link
                href="/interview"
                className="hover:text-zinc-900 dark:hover:text-white"
              >
                模拟面试
              </Link>
              <Link
                href="/library"
                className="hover:text-zinc-900 dark:hover:text-white"
              >
                笔记库
              </Link>
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
