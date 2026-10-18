"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { fmt, useI18n } from "@/lib/i18n";

const PATHS = {
  sun: "M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z",
  menu: "M4 7h16M4 12h16M4 17h16",
  close: "M6 6l12 12M18 6 6 18",
  check: "m5 12 5 5 9-10",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  bolt: "M13 2 4 14h7l-1 8 9-12h-7l1-8Z",
  flame: "M12 22c4 0 7-3 7-7 0-4-3-6-4-10-2 2-3 4-3 6-1-1-2-2-2-4-2 2-5 5-5 8 0 4 3 7 7 7Z",
  shield: "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z",
  home: "M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-9Z",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H2",
  users: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M15 4.13a4 4 0 0 1 0 7.75M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  leaf: "M11 20A7 7 0 0 1 4 13c0-6 5-9 16-10-1 11-4 16-10 16m-6 1c2-5 5-8 9-10",
};

export function Icon({ name, size = 20 }: { name: keyof typeof PATHS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Logo() {
  const { t } = useI18n();
  return (
    <Link href="/" className="logo" aria-label={t.brand}>
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden>
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#34d399" />
            <stop offset="1" stopColor="#0ea5e9" />
          </linearGradient>
        </defs>
        <path d="M16 3 3 13v14a2 2 0 0 0 2 2h22a2 2 0 0 0 2-2V13L16 3Z" fill="url(#lg)" />
        <path d="M11 21c0-5 4-8 10-8-1 6-4 9-8 9m-2 1 5-5" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
      </svg>
      <span>{t.brand}</span>
    </Link>
  );
}

export function Controls() {
  const { lang, setLang, t, toggleTheme } = useI18n();
  return (
    <>
      <button className="icon-btn" onClick={() => setLang(lang === "fa" ? "en" : "fa")} aria-label={t.accessibility.language}>
        <span className="lang-chip">{lang === "fa" ? "EN" : "فا"}</span>
      </button>
      <button className="icon-btn" onClick={(e) => toggleTheme(e)} aria-label={t.theme.toggle}>
        <span className="show-light"><Icon name="moon" /></span>
        <span className="show-dark"><Icon name="sun" /></span>
      </button>
    </>
  );
}

export function Nav() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const links = [
    ["#how", t.nav.how],
    ["#calc", t.nav.calc],
    ["#guarantee", t.nav.guarantee],
    ["#faq", t.nav.faq],
    ["/dashboard", t.nav.dashboard],
  ];
  return (
    <header className="nav">
      <div className="nav-inner">
        <Logo />
        <nav id="primary-navigation" className={`nav-links ${open ? "open" : ""}`} onClick={() => setOpen(false)} onKeyDown={(event) => {
          if (event.key === "Escape") { setOpen(false); menuButton.current?.focus(); }
        }}>
          {links.map(([href, label]) => (
            <Link key={href} href={href.startsWith("#") ? `/${href}` : href}>{label}</Link>
          ))}
        </nav>
        <div className="nav-actions">
          <Controls />
          <Link href="/#lead" className="btn btn-primary btn-sm hide-sm">{t.nav.cta}</Link>
          <button ref={menuButton} className="icon-btn show-sm" onClick={() => setOpen(!open)} aria-label={t.accessibility.menu} aria-controls="primary-navigation" aria-expanded={open}>
            <Icon name={open ? "close" : "menu"} />
          </button>
        </div>
      </div>
    </header>
  );
}

/** Tweens to `value` with an ease-out curve; digits localized. */
export function Counter({ value, digits = 0 }: { value: number; digits?: number }) {
  const { lang } = useI18n();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = performance.now(), a = from.current, b = value;
    let raf = 0;
    const step = (now: number) => {
      const p = Math.min((now - start) / 900, 1);
      const v = a + (b - a) * (1 - Math.pow(1 - p, 4));
      from.current = v;
      setShown(v);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className="num">{fmt(lang, shown, digits)}</span>;
}

/** Adds `.in` to every `.reveal` element as it scrolls into view. */
export function useReveal(dep?: unknown) {
  useEffect(() => {
    if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && (e.target.classList.add("in"), io.unobserve(e.target))),
      { threshold: 0.12 },
    );
    document.querySelectorAll(".reveal:not(.in)").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [dep]);
}

export function Footer() {
  const { t } = useI18n();
  return (
    <footer className="footer">
      <Logo />
      <p>{t.footer}</p>
    </footer>
  );
}
