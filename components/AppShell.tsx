"use client";

import Link from "next/link";
import { Languages } from "lucide-react";
import { LanguageProvider, useLang } from "@/lib/i18n/context";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <LanguageProvider>
      <Shell>{children}</Shell>
    </LanguageProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { lang, setLang, t } = useLang();
  return (
    <>
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center gap-6">
          <Link href="/" className="font-semibold tracking-tight">
            <span className="text-blue-600">AI Infra</span>
            <span className="text-zinc-400 mx-1">·</span>
            <span>{t.nav.brandSub}</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-300 flex-1">
            <Link href="/" className="hover:text-zinc-900 dark:hover:text-white">
              {t.nav.dashboard}
            </Link>
            <Link href="/quiz" className="hover:text-zinc-900 dark:hover:text-white">
              {t.nav.quiz}
            </Link>
            <Link
              href="/interview"
              className="hover:text-zinc-900 dark:hover:text-white"
            >
              {t.nav.interview}
            </Link>
            <Link
              href="/library"
              className="hover:text-zinc-900 dark:hover:text-white"
            >
              {t.nav.library}
            </Link>
          </nav>
          <button
            onClick={() => setLang(lang === "zh" ? "en" : "zh")}
            title="切换语言 / Switch language"
            className="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <Languages className="w-3.5 h-3.5" />
            <span className="font-semibold">{lang === "zh" ? "中" : "EN"}</span>
            <span className="text-zinc-400">/</span>
            <span className="text-zinc-400">{lang === "zh" ? "EN" : "中"}</span>
          </button>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </>
  );
}
