"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { dicts, type Dict, type Lang } from "./dict";

type Ctx = { lang: Lang; t: Dict; setLang: (l: Lang) => void; toggleTheme: (e?: { clientX: number; clientY: number }) => void };
const I18n = createContext<Ctx>(null!);

export function Providers({ initialLang, children }: { initialLang: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  const setLang = (l: Lang) => {
    document.cookie = `lang=${l};path=/;max-age=31536000;samesite=lax${location.protocol === "https:" ? ";secure" : ""}`;
    document.documentElement.lang = l;
    document.documentElement.dir = l === "fa" ? "rtl" : "ltr";
    setLangState(l);
  };

  // Circular reveal from the click point via the native View Transitions API.
  const toggleTheme = (e?: { clientX: number; clientY: number }) => {
    const root = document.documentElement;
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    const apply = () => {
      root.dataset.theme = next;
      try { localStorage.setItem("theme", next); } catch {}
    };
    if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) return apply();
    root.style.setProperty("--vx", `${e?.clientX ?? innerWidth / 2}px`);
    root.style.setProperty("--vy", `${e?.clientY ?? 0}px`);
    document.startViewTransition(apply);
  };

  return <I18n.Provider value={{ lang, t: dicts[lang], setLang, toggleTheme }}>{children}</I18n.Provider>;
}

export const useI18n = () => useContext(I18n);

const formatters = new Map<string, Intl.NumberFormat>();
export const fmt = (lang: Lang, n: number, digits = 0) => {
  const key = `${lang}:${digits}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(lang === "fa" ? "fa-IR" : "en-US", { maximumFractionDigits: digits });
    formatters.set(key, formatter);
  }
  return formatter.format(n);
};
