import type { Metadata } from "next";
import "./globals.css";
import "katex/dist/katex.min.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "AI Infra Tutor",
  description: "Your AI Infrastructure learning and mock-interview companion",
};

/** 首帧前根据 localStorage / 系统偏好设置 dark class，避免主题闪烁 */
const themeInitScript = `try{(function(){var t=localStorage.getItem("ai-infra-tutor:theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light";})();}catch(_){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
