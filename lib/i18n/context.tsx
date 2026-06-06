"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { DICT, type Dict, type Lang } from "./translations";

const STORAGE_KEY = "ai-infra-tutor:lang:v1";

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: Dict;
}

const LangContext = createContext<Ctx | null>(null);

function detectInitialLang(): Lang {
  if (typeof window === "undefined") return "zh";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "zh" || stored === "en") return stored;
  } catch {
    /* ignore */
  }
  // 默认中文（用户选项）
  return "zh";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // SSR 时永远 zh，避免 hydration mismatch
  const [lang, setLangState] = useState<Lang>("zh");

  useEffect(() => {
    setLangState(detectInitialLang());
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    // 设置 html lang 属性
    document.documentElement.setAttribute("lang", l === "en" ? "en" : "zh-CN");
  }, []);

  return (
    <LangContext.Provider value={{ lang, setLang, t: DICT[lang] }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang(): Ctx {
  const ctx = useContext(LangContext);
  if (!ctx) {
    // 非 Provider 包裹场景（例如某些静态导出），退化为 zh
    return { lang: "zh", setLang: () => {}, t: DICT.zh };
  }
  return ctx;
}

/** 直接拿翻译字典：const t = useT() → t.common.save */
export function useT(): Dict {
  return useLang().t;
}
