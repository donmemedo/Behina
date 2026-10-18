"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Calculator from "@/components/Calculator";
import LeadForm from "@/components/LeadForm";
import { Counter, Footer, Icon, Nav, useReveal } from "@/components/ui";
import { fmt, useI18n } from "@/lib/i18n";

const BENTO_ICONS = ["flame", "chart", "users", "leaf"] as const;
const STEP_ICONS = ["home", "bolt", "shield"] as const;

export default function Home() {
  const { t, lang } = useI18n();
  useReveal();

  return (
    <>
      <Nav />
      <a className="skip-link" href="#main-content">{t.accessibility.skip}</a>
      <main id="main-content">
        <section className="hero">
          <div className="aurora" aria-hidden><i /><i /><i /></div>
          <div className="hero-copy">
            <span className="pill reveal"><span className="dot" /> {t.hero.eyebrow}</span>
            <h1 className="reveal">
              {t.hero.title1}
              <br />
              <span className="gradient-text">{t.hero.title2}</span>
            </h1>
            <p className="lead-text reveal">{t.hero.sub}</p>
            <div className="hero-cta reveal">
              <a href="#calc" className="btn btn-primary btn-lg">{t.hero.primary} <Icon name="arrow" size={18} /></a>
              <Link href="/dashboard" className="btn btn-ghost btn-lg">{t.hero.secondary}</Link>
            </div>
          </div>
          <TiltCard>
            <div className="bill-card glass">
              <div className="bill-top">
                <span className="muted">{t.hero.card}</span>
                <span className="badge"><Icon name="shield" size={14} /> −{fmt(lang, 23)}{t.pct}</span>
              </div>
              <div className="bill-compare">
                <div><small>{t.hero.before}</small><s className="num">{fmt(lang, 44)}</s></div>
                <Icon name="arrow" />
                <div><small>{t.hero.after}</small><b className="num">{fmt(lang, 36.2, 1)}</b></div>
              </div>
              <small className="muted">{t.million}</small>
              <div className="bars" aria-hidden>
                {[38, 52, 68, 74, 70, 55, 40, 34, 36, 42, 46, 44].map((h, i) => (
                  <span key={i} style={{ "--h": `${h}%`, "--d": `${i * 60}ms` } as React.CSSProperties} />
                ))}
              </div>
              <div className="bill-saved">
                <span>{t.hero.saved}</span>
                <b className="gradient-text"><Counter value={7.8} digits={1} /> {t.million}</b>
              </div>
            </div>
          </TiltCard>
        </section>

        <Stats />

        <section id="how" className="section">
          <h2 className="reveal">{t.how.title}</h2>
          <p className="section-sub reveal">{t.how.sub}</p>
          <div className="steps">
            {t.how.steps.map((s, i) => (
              <article key={i} className="step glass reveal" style={{ transitionDelay: `${i * 120}ms` }}>
                <span className="step-num">{fmt(lang, i + 1)}</span>
                <span className="step-icon"><Icon name={STEP_ICONS[i]} size={26} /></span>
                <h3>{s.t}</h3>
                <p className="muted">{s.d}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="section">
          <h2 className="reveal">{t.bento.title}</h2>
          <div className="bento">
            {t.bento.items.map((b, i) => (
              <article key={i} className={`tile glass reveal tile-${i}`} style={{ transitionDelay: `${i * 90}ms` }}>
                <span className="tile-icon"><Icon name={BENTO_ICONS[i]} size={28} /></span>
                <h3>{b.t}</h3>
                <p className="muted">{b.d}</p>
                {i === 0 && <div className="flame-orb" aria-hidden />}
              </article>
            ))}
          </div>
        </section>

        <section id="calc" className="section">
          <h2 className="reveal">{t.calc.title}</h2>
          <p className="section-sub reveal">{t.calc.sub}</p>
          <Calculator />
        </section>

        <section id="guarantee" className="section">
          <div className="guarantee reveal">
            <div className="shield-glow"><Icon name="shield" size={56} /></div>
            <h2>{t.guarantee.title}</h2>
            <p className="section-sub">{t.guarantee.sub}</p>
            <ul>
              {t.guarantee.points.map((p) => <li key={p}><Icon name="check" size={18} /> {p}</li>)}
            </ul>
          </div>
        </section>

        <div className="marquee" aria-hidden>
          <div>
            {[0, 1].map((k) => Object.values(t.cities).map((c) => <span key={k + c}>{c}</span>))}
          </div>
        </div>

        <section id="faq" className="section narrow">
          <h2 className="reveal">{t.faq.title}</h2>
          {t.faq.items.map((f) => (
            <details key={f.q} className="faq glass reveal">
              <summary>{f.q}</summary>
              <p className="muted">{f.a}</p>
            </details>
          ))}
        </section>

        <section id="lead" className="section lead-section">
          <div className="lead-copy reveal">
            <h2>{t.lead.title}</h2>
            <p className="section-sub">{t.lead.sub}</p>
          </div>
          <LeadForm />
        </section>
      </main>
      <Footer />
    </>
  );
}

function Stats() {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [go, setGo] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setGo(true), { threshold: 0.4 });
    io.observe(ref.current!);
    return () => io.disconnect();
  }, []);
  return (
    <div className="stats" ref={ref}>
      {t.stats.map((s) => (
        <div key={s.l} className="stat">
          <small className="muted">{s.l}</small>
          <b><Counter value={go ? s.v : 0} />{s.suffix}</b>
        </div>
      ))}
    </div>
  );
}

function TiltCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = ref.current!.getBoundingClientRect();
    ref.current!.style.setProperty("--rx", `${((e.clientY - r.top) / r.height - 0.5) * -14}deg`);
    ref.current!.style.setProperty("--ry", `${((e.clientX - r.left) / r.width - 0.5) * 14}deg`);
  };
  const leave = () => (ref.current!.style.setProperty("--rx", "0deg"), ref.current!.style.setProperty("--ry", "0deg"));
  return <div ref={ref} className="tilt reveal" onPointerMove={move} onPointerLeave={leave}>{children}</div>;
}
