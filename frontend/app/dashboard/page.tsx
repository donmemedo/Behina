"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Ring } from "@/components/Calculator";
import { Controls, Counter, Icon, Logo, useReveal } from "@/components/ui";
import { fmt, useI18n } from "@/lib/i18n";
import { requestJSON } from "@/lib/api";

type Point = { month: number; baseline: number; actual: number };
type Data = {
  series: Point[];
  bill: { month: number; baseline: number; energy: number; our_share: number; total: number; saved: number };
  guarantee: { min: number; achieved: number };
  total_saved: number;
  measures: { key: string; status: "done" | "in_progress" | "planned"; pct: number }[];
};

export default function Dashboard() {
  const { t, lang } = useI18n();
  const [d, setD] = useState<Data | null>(null);
  const [error, setError] = useState(false);
  useReveal(d);

  useEffect(() => {
    const controller = new AbortController();
    requestJSON<Data>("/api/dashboard", { signal: controller.signal }).then(setD, () => {
      if (!controller.signal.aborted) setError(true);
    });
    return () => controller.abort();
  }, []);

  const m = (n: number) => fmt(lang, n, 1);

  return (
    <>
      <a className="skip-link" href="#main-content">{t.accessibility.skip}</a>
      <header className="nav">
        <div className="nav-inner">
          <Logo />
          <div className="nav-actions">
            <Controls />
            <Link href="/" className="btn btn-ghost btn-sm">{t.dash.back}</Link>
          </div>
        </div>
      </header>
      <main id="main-content" className="dash">
        <div className="aurora dim" aria-hidden><i /><i /><i /></div>
        <div className="dash-head">
          <div>
            <p className="muted">{t.dash.title} <span className="badge">{t.dash.demo}</span></p>
            <h1>{t.dash.hello}</h1>
            <p className="muted">{t.dash.meta}</p>
          </div>
        </div>

        {error && <p className="error" role="alert">{t.calc.error}</p>}
        {!d && !error && <div className="skeleton-grid" role="status" aria-label={t.dash.loading}>{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton glass" />)}</div>}

        {d && (
          <div className="dash-grid">
            <section className="card glass reveal card-bill">
              <p className="muted">{t.dash.bill} · {t.months[d.bill.month - 1]}</p>
              <p className="muted small">{t.dash.total}</p>
              <p className="big"><Counter value={d.bill.total} digits={1} /> <small>{t.million}</small></p>
              <dl className="rows">
                <div><dt>{t.dash.baseline}</dt><dd><s>{m(d.bill.baseline)}</s></dd></div>
                <div><dt>{t.dash.energy}</dt><dd>{m(d.bill.energy)}</dd></div>
                <div><dt>{t.dash.ours}</dt><dd>{m(d.bill.our_share)}</dd></div>
                <div><dt>{t.dash.saved}</dt><dd className="accent">+{m(d.bill.saved)}</dd></div>
              </dl>
            </section>

            <section className="card glass reveal card-guarantee">
              <p className="muted">{t.dash.guarantee}</p>
              <div className="ring-wrap">
                <Ring size={150} parts={[
                  { v: d.guarantee.achieved, c: "var(--ring-you)" },
                  { v: Math.max(0.3 - d.guarantee.achieved, 0), c: "var(--track)" },
                ]} />
                <div className="ring-center">
                  <b>{fmt(lang, d.guarantee.achieved * 100, 1)}{t.pct}</b>
                  <small>{t.dash.achieved}</small>
                </div>
              </div>
              <p className="muted small"><Icon name="shield" size={14} /> {t.dash.min}: {fmt(lang, d.guarantee.min * 100)}{t.pct}</p>
            </section>

            <section className="card glass reveal card-total">
              <p className="muted">{t.dash.totalSaved}</p>
              <p className="big gradient-text"><Counter value={d.total_saved} digits={1} /></p>
              <p className="muted">{t.million}</p>
              <Icon name="leaf" size={64} />
            </section>

            <section className="card glass reveal card-chart">
              <div className="card-row">
                <p className="muted">{t.dash.trend}</p>
                <div className="legend">
                  <span><i className="dash-line" />{t.dash.predicted}</span>
                  <span><i style={{ background: "var(--ring-you)" }} />{t.dash.actual}</span>
                </div>
              </div>
              <Chart title={t.dash.trend} series={d.series} rtl={lang === "fa"} label={(p) => `${t.months[p.month - 1]}: ${m(p.actual)} / ${m(p.baseline)}`} months={t.months} />
              <details className="chart-data">
                <summary>{t.dash.dataTable}</summary>
                <table><caption>{t.dash.trend} · {t.million}</caption><thead><tr><th scope="col">{t.dash.month}</th><th scope="col">{t.dash.predicted}</th><th scope="col">{t.dash.actual}</th></tr></thead>
                  <tbody>{d.series.map((p) => <tr key={p.month}><th scope="row">{t.months[p.month - 1]}</th><td>{m(p.baseline)}</td><td>{m(p.actual)}</td></tr>)}</tbody>
                </table>
              </details>
            </section>

            <section className="card glass reveal card-measures">
              <p className="muted">{t.dash.measures}</p>
              <ul className="measures">
                {d.measures.map((x) => (
                  <li key={x.key}>
                    <span className={`status ${x.status}`}>{t.dash.status[x.status]}</span>
                    <span className="grow">{t.measures[x.key as keyof typeof t.measures]}</span>
                    <span className="meter"><i style={{ width: `${x.pct * 10}%` }} /></span>
                    <b className="num">{fmt(lang, x.pct)}{t.pct}</b>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </main>
    </>
  );
}

function Chart({ title, series, rtl, label, months }: { title: string; series: Point[]; rtl: boolean; label: (p: Point) => string; months: string[] }) {
  const W = 640, H = 240, P = 28;
  const max = Math.max(...series.map((s) => s.baseline)) * 1.1;
  const x = (i: number) => { const v = P + (i * (W - 2 * P)) / (series.length - 1); return rtl ? W - v : v; };
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const line = (k: "baseline" | "actual") => series.map((s, i) => `${i ? "L" : "M"}${x(i)},${y(s[k])}`).join("");
  const area = `${line("actual")}L${x(series.length - 1)},${H - P}L${x(0)},${H - P}Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={title}>
      <defs>
        <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--ring-you)" stopOpacity=".45" />
          <stop offset="1" stopColor="var(--ring-you)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={P} x2={W - P} y1={y(max * f)} y2={y(max * f)} className="grid" />)}
      <path d={area} fill="url(#area)" className="area" />
      <path d={line("baseline")} className="line-base" />
      <path d={line("actual")} className="line-actual" pathLength={1} />
      {series.map((s, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(s.actual)} r="4" className="pt"><title>{label(s)}</title></circle>
          {i % 2 === 0 && <text x={x(i)} y={H - 6} textAnchor="middle" className="axis">{months[s.month - 1]}</text>}
        </g>
      ))}
    </svg>
  );
}
