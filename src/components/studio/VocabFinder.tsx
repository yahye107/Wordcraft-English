"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { call } from "@/components/notebook/api";

type Item = { slug: string; text: string; simpleMeaning: string; register: string; intensity: number | null; note?: string };
type Result = {
  word: string;
  groups: { slug: string; title: string; explanation: string; items: Item[] }[];
  loose: Item[];
};

export default function VocabFinder() {
  const id = useId();
  const [word, setWord] = useState("");
  const [sentence, setSentence] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function find(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const r = await call<Result>("POST", "/api/writing/vocabulary", { word, sentence });
    setBusy(false);
    if (r.ok) setResult(r.data);
    else setError(r.error);
  }

  const none = result && result.groups.length === 0 && result.loose.length === 0;

  return (
    <div className="stack">
      <form className="panel stack" onSubmit={find}>
        <div className="field">
          <label htmlFor={`${id}-w`}>A word you use too often</label>
          <input id={`${id}-w`} value={word} maxLength={40} onChange={(e) => setWord(e.target.value)} autoComplete="off" />
        </div>
        <div className="field">
          <label htmlFor={`${id}-s`}>The sentence it is in (optional)</label>
          <input id={`${id}-s`} value={sentence} maxLength={300} onChange={(e) => setSentence(e.target.value)} autoComplete="off" />
        </div>
        <div className="row">
          <button className="btn" type="submit" disabled={busy || !word.trim()}>
            {busy ? "Looking…" : "Find better words"}
          </button>
        </div>
        <p role="status" className="wrong-text">{error}</p>
      </form>

      {none && (
        <p className="panel" role="status">
          No words found for “{result.word}”. Try a simpler word, or <Link href="/search">search by meaning</Link>.
        </p>
      )}

      {result?.groups.map((g) => (
        <section key={g.slug} className="contrast" aria-label={g.title}>
          <h3>{g.title}</h3>
          <p>{g.explanation}</p>
          <ul className="contrast-list">
            {g.items.map((i) => (
              <li key={i.slug}>
                <div className="contrast-word"><Link href={`/e/${i.slug}`}>{i.text}</Link></div>
                <p className="contrast-note">{i.note ?? i.simpleMeaning}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {result && result.loose.length > 0 && (
        <section aria-label="More words">
          <h3>More words</h3>
          <ul className="contrast-list">
            {result.loose.map((i) => (
              <li key={i.slug}>
                <div className="contrast-word"><Link href={`/e/${i.slug}`}>{i.text}</Link></div>
                <p className="contrast-note">{i.simpleMeaning}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
