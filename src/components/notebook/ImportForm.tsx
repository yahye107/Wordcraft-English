"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "./api";

type Counts = { found: number; added: number; skipped: number; linked: number };

export default function ImportForm() {
  const router = useRouter();
  const id = useId();
  const [text, setText] = useState("");
  const [found, setFound] = useState<number | null>(null);
  const [result, setResult] = useState<Counts | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function check(value: string) {
    setResult(null);
    setError("");
    setFound(null);
    if (!value.trim()) return;
    const r = await call<Counts>("POST", "/api/notebook/import", { text: value, dryRun: true });
    if (r.ok) setFound(r.data.found);
    else setError(r.error);
  }

  async function readFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 1_000_000) return setError("That file is too large (limit 1 MB).");
    const value = await file.text();
    setText(value);
    await check(value);
  }

  async function runImport() {
    setBusy(true);
    setError("");
    const r = await call<Counts>("POST", "/api/notebook/import", { text });
    setBusy(false);
    if (r.ok) {
      setResult(r.data);
      router.refresh();
    } else setError(r.error);
  }

  return (
    <div className="stack">
      <div className="field">
        <label htmlFor={`${id}-f`}>Choose a Markdown file</label>
        <input id={`${id}-f`} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" onChange={readFile} />
        <span className="hint">The file is read in your browser and sent only to this app.</span>
      </div>
      <div className="field">
        <label htmlFor={`${id}-t`}>Or paste the notes</label>
        <textarea
          id={`${id}-t`}
          className="writebox"
          rows={8}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setFound(null);
            setResult(null);
          }}
          onBlur={() => check(text)}
        />
      </div>

      <div className="row">
        <button className="btn secondary" type="button" onClick={() => check(text)} disabled={!text.trim()}>
          Find notes
        </button>
        <button className="btn" type="button" onClick={runImport} disabled={busy || !found}>
          {busy ? "Importing…" : found ? `Import ${found} ${found === 1 ? "note" : "notes"}` : "Import"}
        </button>
      </div>

      <div role="status" aria-live="polite">
        {found !== null && !result && <p>{found === 0 ? "No notes were found in that text." : `Found ${found} ${found === 1 ? "note" : "notes"}.`}</p>}
        {result && (
          <p className="right" data-testid="import-result">
            Added {result.added}, skipped {result.skipped} that you already had, linked {result.linked} to the library.
          </p>
        )}
        {error && <p className="wrong-text">{error}</p>}
      </div>
    </div>
  );
}
