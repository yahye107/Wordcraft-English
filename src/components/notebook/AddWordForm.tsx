"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "./api";

export default function AddWordForm() {
  const router = useRouter();
  const id = useId();
  const [text, setText] = useState("");
  const [meaning, setMeaning] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await call("POST", "/api/notebook", { text, myMeaning: meaning });
    setBusy(false);
    if (r.ok) {
      setText("");
      setMeaning("");
      router.refresh();
    } else setError(r.error);
  }

  return (
    <form className="panel stack" onSubmit={submit} aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Add a word</h2>
      <div className="field">
        <label htmlFor={`${id}-w`}>Word or expression</label>
        <input id={`${id}-w`} value={text} maxLength={100} onChange={(e) => setText(e.target.value)} autoComplete="off" />
      </div>
      <div className="field">
        <label htmlFor={`${id}-m`}>What it means to you (optional)</label>
        <input id={`${id}-m`} value={meaning} maxLength={500} onChange={(e) => setMeaning(e.target.value)} autoComplete="off" />
      </div>
      <div className="row">
        <button className="btn" type="submit" disabled={busy || !text.trim()}>
          {busy ? "Adding…" : "Add to notebook"}
        </button>
      </div>
      <p role="status" className="wrong-text">{error}</p>
    </form>
  );
}
