"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "@/components/notebook/api";

const MAX_WORDS = 120;
const MAX_CHARS = 800;

/** Paste a passage and choose local or tutor analysis. The server enforces the limits; the counter only warns. */
export default function PassageForm({ aiAvailable }: { aiAvailable: boolean }) {
  const router = useRouter();
  const id = useId();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState<"local" | "ai" | null>(null);
  const [error, setError] = useState("");

  const words = (text.match(/\S+/g) ?? []).length;
  const over = words > MAX_WORDS || text.length > MAX_CHARS;

  async function submit(useAi: boolean) {
    setBusy(useAi ? "ai" : "local");
    setError("");
    const r = await call<{ id: number }>("POST", "/api/novel/analyses", { excerpt: text, sourceTitle: title, useAi });
    if (!r.ok) {
      setBusy(null);
      setError(r.error);
      return;
    }
    router.push(`/novel/${r.data.id}`);
  }

  return (
    <form
      className="stack novel-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (text.trim() && !busy) void submit(false);
      }}
    >
      <div className="field">
        <label htmlFor={`${id}-p`}>Passage</label>
        <textarea
          id={`${id}-p`}
          className="writebox big"
          rows={7}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-describedby={`${id}-c`}
          aria-invalid={over}
        />
        <span id={`${id}-c`} className={over ? "counter over" : "counter"}>
          {words} of {MAX_WORDS} words · {text.length} of {MAX_CHARS} characters
        </span>
        <span role="status" className="wrong-text">
          {over ? "This is too long. Shorten it to one short scene before you analyse it." : ""}
        </span>
      </div>

      <div className="field">
        <label htmlFor={`${id}-t`}>Book title (optional)</label>
        <input id={`${id}-t`} type="text" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
      </div>

      <p className="muted privacy" data-testid="privacy-note">
        {aiAvailable
          ? "Tutor analysis sends the passage to Claude. Nothing else is sent, not even the title. Local analysis sends nothing."
          : "Tutor analysis is off because no API key is set. Local analysis works without one and sends nothing anywhere."}
      </p>

      <div className="row">
        <button type="submit" className={aiAvailable ? "btn secondary" : "btn"} disabled={busy !== null || !text.trim()}>
          {busy === "local" ? "Analysing…" : "Analyse with local tools"}
        </button>
        {aiAvailable && (
          <button type="button" className="btn" disabled={busy !== null || !text.trim()} onClick={() => void submit(true)}>
            {busy === "ai" ? "Asking the tutor…" : "Analyse with the tutor"}
          </button>
        )}
      </div>
      <p role="status" aria-live="polite" className={error ? "wrong-text" : "muted"}>
        {error || (busy === "ai" ? "The tutor can take up to half a minute." : "")}
      </p>
    </form>
  );
}
