"use client";

import { useState } from "react";

type Initial = { model_main: string; model_cheap: string; monthly_cap_usd: number };

export default function SettingsForm({ initial, spend, keySet }: { initial: Initial; spend: number; keySet: boolean }) {
  const [values, setValues] = useState(initial);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, monthly_cap_usd: Number(values.monthly_cap_usd) }),
    });
    const data = await res.json();
    setStatus({ ok: res.ok, text: res.ok ? "Saved." : data.message });
  }

  async function test() {
    setTesting(true);
    setStatus(null);
    try {
      const res = await fetch("/api/settings/test", { method: "POST" });
      const data = await res.json();
      setStatus({ ok: data.ok, text: data.message });
    } finally {
      setTesting(false);
    }
  }

  return (
    <form className="panel stack" onSubmit={save} aria-labelledby="ai-h">
      <h2 id="ai-h">AI models and spending</h2>

      <div className="field">
        <label htmlFor="model_main">Main model</label>
        <input id="model_main" value={values.model_main} onChange={(e) => setValues({ ...values, model_main: e.target.value })} />
        <span className="hint">Used for the writing tutor and sentence analysis.</span>
      </div>

      <div className="field">
        <label htmlFor="model_cheap">Quick model</label>
        <input id="model_cheap" value={values.model_cheap} onChange={(e) => setValues({ ...values, model_cheap: e.target.value })} />
        <span className="hint">Used for small jobs such as smart search.</span>
      </div>

      <div className="field">
        <label htmlFor="cap">Monthly spend limit (USD)</label>
        <input
          id="cap"
          type="number"
          min="0.5"
          step="0.5"
          value={values.monthly_cap_usd}
          onChange={(e) => setValues({ ...values, monthly_cap_usd: Number(e.target.value) })}
        />
        <span className="hint">This month so far: about ${spend.toFixed(2)}. AI features stop at the limit.</span>
      </div>

      <div className="row">
        <button className="btn" type="submit">Save settings</button>
        <button className="btn secondary" type="button" onClick={test} disabled={!keySet || testing}>
          {testing ? "Testing…" : "Test connection"}
        </button>
      </div>

      <p role="status" aria-live="polite" className={status ? (status.ok ? "right" : "wrong-text") : "muted"}>
        {status?.text ?? ""}
      </p>
    </form>
  );
}
