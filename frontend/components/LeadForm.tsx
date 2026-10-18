"use client";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { Icon } from "./ui";
import { ApiError, requestJSON } from "@/lib/api";

const toLatin = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
  .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[\s-]/g, "");

export default function LeadForm() {
  const { t } = useI18n();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [state, setState] = useState<"idle" | "sending" | "fail">("idle");
  const [ticket, setTicket] = useState("");
  const [failure, setFailure] = useState("");
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const requestKey = useRef<{ payload: string; key: string } | null>(null);
  const successHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => controller.current?.abort(), []);
  useEffect(() => { if (ticket) successHeading.current?.focus(); }, [ticket]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (inFlight.current) return;
    const form = e.currentTarget;
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const errs: Record<string, string> = {};
    if (f.name.trim().length < 2) errs.name = t.lead.required;
    else if (f.name.trim().length > 60 || /[\u0000-\u001f\u007f-\u009f]/.test(f.name)) errs.name = t.lead.badName;
    if (!f.phone.trim()) errs.phone = t.lead.required;
    else if (!/^(\+98|0098|98|0)9\d{9}$/.test(toLatin(f.phone))) errs.phone = t.lead.badPhone;
    if (!/^[0-9]+$/.test(f.units) || Number(f.units) < 1 || Number(f.units) > 1000) errs.units = t.lead.badUnits;
    setErrors(errs);
    if (Object.keys(errs).length) {
      (form.elements.namedItem(Object.keys(errs)[0]) as HTMLElement | null)?.focus();
      return;
    }

    inFlight.current = true;
    setState("sending");
    setFailure("");
    controller.current = new AbortController();
    try {
      const body = JSON.stringify({ ...f, name: f.name.trim(), units: Number(f.units) });
      if (requestKey.current?.payload !== body) {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        requestKey.current = { payload: body, key: Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("") };
      }
      const result = await requestJSON<{ ticket: string }>("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": requestKey.current.key },
        body,
        signal: controller.current.signal,
      });
      setTicket(result.ticket);
      requestKey.current = null;
      setState("idle");
    } catch (error) {
      if (controller.current.signal.aborted) return;
      setFailure(error instanceof ApiError && error.status === 429 ? t.lead.rateLimited : t.lead.fail);
      setState("fail");
    } finally {
      inFlight.current = false;
    }
  }

  if (ticket)
    return (
      <div className="lead glass success reveal in">
        <div className="success-badge"><Icon name="check" size={36} /></div>
        <h3 ref={successHeading} tabIndex={-1}>{t.lead.done}</h3>
        <p className="muted">{t.lead.ticket}: <b className="num" dir="ltr">{ticket}</b></p>
        <button className="btn btn-ghost" onClick={() => setTicket("")}>{t.lead.again}</button>
      </div>
    );

  return (
    <form className="lead glass reveal" onSubmit={submit} noValidate aria-busy={state === "sending"}>
      <Field label={t.lead.name} error={errors.name} errorId="lead-name-error">
        <input name="name" autoComplete="name" maxLength={60} required aria-invalid={!!errors.name} aria-describedby={errors.name ? "lead-name-error" : undefined} />
      </Field>
      <Field label={t.lead.phone} error={errors.phone} errorId="lead-phone-error">
        <input name="phone" type="tel" inputMode="tel" autoComplete="tel" dir="ltr" maxLength={64} required placeholder="09xx xxx xxxx" aria-invalid={!!errors.phone} aria-describedby={errors.phone ? "lead-phone-error" : undefined} />
      </Field>
      <div className="grid-2">
        <Field label={t.calc.city}>
          <select name="city" defaultValue="tehran">
            {Object.entries(t.cities).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label={t.calc.building}>
          <select name="building" defaultValue="complex">
            {Object.entries(t.calc.buildings).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
      </div>
      <Field label={t.calc.units} error={errors.units} errorId="lead-units-error">
        <input name="units" type="number" min={1} max={1000} step={1} defaultValue={24} required inputMode="numeric" aria-invalid={!!errors.units} aria-describedby={errors.units ? "lead-units-error" : undefined} />
      </Field>
      {state === "fail" && <p className="error" role="alert">{failure}</p>}
      <button type="submit" className="btn btn-primary btn-block" disabled={state === "sending"}>
        {state === "sending" ? t.lead.sending : t.lead.submit}
      </button>
    </form>
  );
}

function Field({ label, error, errorId, children }: { label: string; error?: string; errorId?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error && <span id={errorId} className="field-error" role="alert">{error}</span>}
    </label>
  );
}
