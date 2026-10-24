"use client";

import Link from "next/link";
import { useState } from "react";
import { Languages, Menu, Moon, Sun, X } from "lucide-react";
import { LanguageProvider, useLang } from "@/lib/i18n/context";
import { ThemeProvider, useTheme } from "@/lib/theme";

const NAV_LINKS = [
  { href: "/", key: "dashboard" },
  { href: "/quiz", key: "quiz" },
  { href: "/interview", key: "interview" },
  { href: "/library", key: "library" },
  { href: "/bank", key: "bank" },
  { href: "/resume", key: "resume" },
  { href: "/feedback", key: "feedback" },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <Shell>{children}</Shell>
      </LanguageProvider>
    </ThemeProvider>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { lang, setLang, t } = useLang();
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <>
      <header className="border-b border-[#dadce0] dark:border-[#3c4043] bg-white dark:bg-[#292a2d] sticky top-0 z-10 shadow-sm">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-14 flex items-center gap-2 sm:gap-6">
          {/* 移动端：汉堡菜单 */}
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
            className="md:hidden p-1.5 rounded-md text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 shrink-0"
          >
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <Link href="/" className="font-semibold tracking-tight shrink-0">
            <span style={{ color: "#1a73e8" }}>AI Infra</span>
            <span className="text-zinc-400 mx-1">·</span>
            <span className="hidden sm:inline">{t.nav.brandSub}</span>
          </Link>
          {/* 桌面端导航 */}
          <nav className="hidden md:flex items-center gap-4 text-sm text-zinc-600 dark:text-zinc-300 flex-1">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="hover:text-zinc-900 dark:hover:text-white whitespace-nowrap"
              >
                {t.nav[l.key]}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
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
            <ThemeToggle />
          </div>
        </div>
        {/* 移动端下拉菜单 */}
        {menuOpen && (
          <nav className="md:hidden border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#292a2d] grid grid-cols-2 gap-1 p-2">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="px-3 py-2.5 text-sm rounded-md text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              >
                {t.nav[l.key]}
              </Link>
            ))}
          </nav>
        )}
      </header>
      <main className="flex-1">{children}</main>
    </>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      title={dark ? "切换为浅色模式" : "切换为深色模式"}
      className="p-1.5 text-xs rounded-md border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center"
    >
      {dark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
    </button>
  );
}
