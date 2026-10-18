"use client";
import { useEffect, useState } from "react";
import { fmt, useI18n } from "@/lib/i18n";
import { Counter, Icon } from "./ui";
import { requestJSON } from "@/lib/api";

type Building = "complex" | "tower" | "office" | "villa";
type City = "tehran" | "karaj" | "mashhad" | "isfahan" | "tabriz" | "rasht" | "ahvaz";
type Estimate = {
  baseline: number; savings: number; net: number; our_share: number; new_bill: number; guaranteed: number;
  yearly: number; per_unit: number; pct_low: number; pct_high: number; measures: string[];
};

const M = 1_000_000;
const PRESETS: Record<Building, { units: number; gas: number; electricity: number; max: number }> = {
  complex: { units: 48, gas: 30 * M, electricity: 15 * M, max: 300 * M },
  tower: { units: 120, gas: 80 * M, electricity: 40 * M, max: 300 * M },
  office: { units: 12, gas: 20 * M, electricity: 35 * M, max: 300 * M },
  villa: { units: 1, gas: 6 * M, electricity: 4 * M, max: 30 * M },
};

export function Ring({ parts, size = 180 }: { parts: { v: number; c: string }[]; size?: number }) {
  const r = 52, C = 2 * Math.PI * r, total = parts.reduce((s, p) => s + p.v, 0) || 1;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className="ring" aria-hidden>
      <circle cx="60" cy="60" r={r} className="ring-track" />
      {parts.map((p, i) => {
        const len = (p.v / total) * C;
        const el = <circle key={i} cx="60" cy="60" r={r} stroke={p.c} strokeDasharray={`${Math.max(len - 1.5, 0)} ${C}`} strokeDashoffset={-off} />;
        off += len;
        return el;
      })}
    </svg>
  );
}

export default function Calculator() {
  const { t, lang } = useI18n();
  const [building, setBuilding] = useState<Building>("complex");
  const [city, setCity] = useState<City>("tehran");
  const [v, setV] = useState(PRESETS.complex);
  const [res, setRes] = useState<Estimate | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    const id = setTimeout(async () => {
      try {
        const result = await requestJSON<Estimate>("/api/estimate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ building, city, units: v.units, gas: v.gas, electricity: v.electricity }),
          signal: ctl.signal,
        });
        setRes(result);
        setError(false);
      } catch {
        if (!ctl.signal.aborted) setError(true);
      }
    }, 200);
    return () => (clearTimeout(id), ctl.abort());
  }, [building, city, v]);

  const pickBuilding = (b: Building) => (setBuilding(b), setV(PRESETS[b]));
  const money = (n: number) => `${fmt(lang, n)} ${t.toman}`;
  const pct = (n: number) => fmt(lang, n * 100);

  return (
    <div className="calc glass reveal">
      <div className="calc-inputs">
        <p id="building-label" className="field-label">{t.calc.building}</p>
        <div className="segmented" role="group" aria-labelledby="building-label">
          {(Object.keys(PRESETS) as Building[]).map((b) => (
            <button key={b} aria-pressed={building === b} className={building === b ? "on" : ""} onClick={() => pickBuilding(b)}>
              {t.calc.buildings[b]}
            </button>
          ))}
        </div>

        <p id="city-label" className="field-label">{t.calc.city}</p>
        <div className="chips" role="group" aria-labelledby="city-label">
          {(Object.keys(t.cities) as City[]).map((c) => (
            <button key={c} className={`chip ${city === c ? "on" : ""}`} onClick={() => setCity(c)} aria-pressed={city === c}>
              {t.cities[c]}
            </button>
          ))}
        </div>

        {building !== "villa" && (
          <Slider label={t.calc.units} value={v.units} min={1} max={300} step={1} display={fmt(lang, v.units)} onChange={(units) => setV({ ...v, units })} />
        )}
        <Slider icon="flame" label={t.calc.gas} value={v.gas} min={0} max={v.max} step={v.max / 300} display={money(v.gas)} onChange={(gas) => setV({ ...v, gas })} />
        <Slider icon="bolt" label={t.calc.electricity} value={v.electricity} min={0} max={v.max} step={v.max / 300} display={money(v.electricity)} onChange={(electricity) => setV({ ...v, electricity })} />
      </div>

      <div className="calc-result" aria-live="polite">
        {error && <p className="error" role="alert">{t.calc.error}</p>}
        {res && (
          <>
            <div className="result-hero">
              <div className="ring-wrap">
                <Ring parts={[
                  { v: res.baseline - res.savings, c: "var(--ring-energy)" },
                  { v: res.our_share, c: "var(--ring-ours)" },
                  { v: res.net, c: "var(--ring-you)" },
                ]} />
                <div className="ring-center">
                  <small>{t.calc.range}</small>
                  <b>{pct(res.pct_low)}–{pct(res.pct_high)}{t.pct}</b>
                </div>
              </div>
              <div>
                <p className="muted">{t.calc.net}</p>
                <p className="big gradient-text"><Counter value={res.net} /></p>
                <p className="muted">{t.toman}</p>
              </div>
            </div>
            <div className="legend">
              <span><i style={{ background: "var(--ring-energy)" }} />{t.calc.energy}</span>
              <span><i style={{ background: "var(--ring-ours)" }} />{t.calc.ours}</span>
              <span><i style={{ background: "var(--ring-you)" }} />{t.calc.net}</span>
            </div>
            <dl className="rows">
              <div><dt>{t.calc.newBill}</dt><dd>{money(res.new_bill)}</dd></div>
              <div><dt>{t.calc.ours}</dt><dd>{money(res.our_share)}</dd></div>
              <div><dt><Icon name="shield" size={16} /> {t.calc.guaranteed}</dt><dd>{money(res.guaranteed)}</dd></div>
              <div><dt>{t.calc.yearly}</dt><dd className="accent">{money(res.yearly)}</dd></div>
              {building !== "villa" && <div><dt>{t.calc.perUnit}</dt><dd>{money(res.per_unit)}</dd></div>}
            </dl>
            <p className="field-label">{t.calc.measures}</p>
            <div className="chips">
              {res.measures.map((m) => (
                <span key={m} className="chip static"><Icon name="check" size={14} /> {t.measures[m as keyof typeof t.measures]}</span>
              ))}
            </div>
            <a href="#lead" className="btn btn-primary btn-block">{t.calc.book} <Icon name="arrow" size={18} /></a>
          </>
        )}
      </div>
    </div>
  );
}

function Slider(p: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (n: number) => void; icon?: "flame" | "bolt" }) {
  const fill = ((p.value - p.min) / (p.max - p.min)) * 100;
  return (
    <label className="slider">
      <span className="slider-head">
        <span>{p.icon && <Icon name={p.icon} size={16} />} {p.label}</span>
        <b className="num">{p.display}</b>
      </span>
      <input type="range" min={p.min} max={p.max} step={p.step} value={p.value} style={{ "--fill": `${fill}%` } as React.CSSProperties}
        aria-label={p.label} aria-valuetext={p.display}
        onChange={(e) => p.onChange(Number(e.target.value))} />
    </label>
  );
}
