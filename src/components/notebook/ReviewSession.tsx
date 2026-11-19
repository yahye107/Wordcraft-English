"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { DueCard } from "@/lib/notebook/review";
import { call } from "./api";

type Grade = "again" | "hard" | "good" | "easy";
const GRADES: { key: Grade; label: string; hint: string }[] = [
  { key: "again", label: "Again", hint: "1" },
  { key: "hard", label: "Hard", hint: "2" },
  { key: "good", label: "Good", hint: "3" },
  { key: "easy", label: "Easy", hint: "4" },
];

export default function ReviewSession({ cards }: { cards: DueCard[] }) {
  const router = useRouter();
  const id = useId();
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sentence, setSentence] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [tally, setTally] = useState<Record<Grade, number>>({ again: 0, hard: 0, good: 0, easy: 0 });

  const card = cards[index];
  const finished = index >= cards.length;

  const grade = useCallback(
    async (g: Grade) => {
      if (!card || busy) return;
      setBusy(true);
      setNotice("");
      const r = await call("POST", `/api/notebook/${card.entryId}/review`, { grade: g });
      if (r.ok) {
        setTally((t) => ({ ...t, [g]: t[g] + 1 }));
        if (g !== "again" && sentence.trim()) {
          await call("POST", `/api/notebook/${card.entryId}/examples`, { text: sentence });
        }
      } else {
        setNotice(`Skipped “${card.text}”: ${r.error}`);
      }
      setBusy(false);
      setSentence("");
      setRevealed(false);
      setIndex((i) => i + 1);
    },
    [card, busy, sentence],
  );

  // Keys 1 to 4 grade the card once the answer is shown (not while typing a sentence)
  useEffect(() => {
    if (!revealed) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "TEXTAREA" || el.tagName === "INPUT")) return;
      const g = GRADES.find((x) => x.hint === e.key);
      if (g) grade(g.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, grade]);

  if (finished) {
    const total = Object.values(tally).reduce((a, b) => a + b, 0);
    return (
      <div className="panel stack" role="status" data-testid="review-done">
        <h2>Done for now</h2>
        <p>
          You reviewed {total} {total === 1 ? "card" : "cards"}: {tally.again} again, {tally.hard} hard, {tally.good} good, {tally.easy} easy.
        </p>
        {notice && <p className="muted">{notice}</p>}
        <div className="row">
          <Link href="/notebook" className="btn" onClick={() => router.refresh()}>Back to the notebook</Link>
        </div>
      </div>
    );
  }

  return (
    <section className="panel stack review" aria-labelledby={`${id}-h`}>
      <p className="muted" aria-live="polite">
        Card {index + 1} of {cards.length}
        {card.isNew ? " · new" : ""}
      </p>
      <h2 id={`${id}-h`} className="review-word">
        <span className="hl">{card.text}</span>
      </h2>

      {!revealed ? (
        <>
          <div className="field">
            <label htmlFor={`${id}-s`}>Write your own sentence with it (optional)</label>
            <textarea id={`${id}-s`} className="fixbox" rows={2} maxLength={500} value={sentence} onChange={(e) => setSentence(e.target.value)} />
          </div>
          <div className="row">
            <button className="btn" type="button" onClick={() => setRevealed(true)} autoFocus>
              Show answer
            </button>
          </div>
        </>
      ) : (
        <>
          {sentence.trim() && (
            <div className="sample">
              <p className="sample-title">Your sentence</p>
              <p className="sentence">{sentence}</p>
            </div>
          )}
          {card.myMeaning && (
            <div>
              <p className="field-label">My meaning</p>
              <p>{card.myMeaning}</p>
            </div>
          )}
          {card.myNotes && (
            <div>
              <p className="field-label">My notes</p>
              <p>{card.myNotes}</p>
            </div>
          )}
          {card.library ? (
            <div>
              <p className="field-label">In the library</p>
              <p>{card.library.simpleMeaning}</p>
              {card.library.examples.map((x, i) => (
                <p key={i} className="sentence">{x}</p>
              ))}
            </div>
          ) : (
            !card.myMeaning && !card.myNotes && <p className="muted">No meaning saved yet. Add one from the notebook after this review.</p>
          )}
          {card.examples.length > 0 && (
            <div>
              <p className="field-label">My sentences</p>
              {card.examples.map((x, i) => (
                <p key={i} className="sentence">{x}</p>
              ))}
            </div>
          )}

          <div className="grades" role="group" aria-label="How well did you remember it?">
            {GRADES.map((g) => (
              <button key={g.key} type="button" className="btn secondary grade" disabled={busy} onClick={() => grade(g.key)}>
                {g.label} <span className="muted">({g.hint})</span>
              </button>
            ))}
          </div>
        </>
      )}
      {notice && <p className="muted" role="status">{notice}</p>}
    </section>
  );
}
