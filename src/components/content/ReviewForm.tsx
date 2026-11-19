"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "@/components/notebook/api";

type Props = {
  kind: string;
  slug: string;
  /** An expression that is a draft: approving also publishes it. */
  isDraft: boolean;
  /** A published expression: it can be moved back to draft. */
  canUnpublish: boolean;
  existingNote: string;
  nextHref: string;
};

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
};

/** Approve, mark "needs work" with a note, or move back to draft. Keys: A approves, N goes to the note. */
export default function ReviewForm({ kind, slug, isDraft, canUnpublish, existingNote, nextHref }: Props) {
  const router = useRouter();
  const id = useId();
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const [note, setNote] = useState(existingNote);
  const [askNote, setAskNote] = useState(existingNote.length > 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function approve() {
    if (busy) return;
    setBusy(true);
    setError("");
    const r = isDraft
      ? await call("POST", "/api/content/status", { slug, status: "published" })
      : await call("POST", "/api/content/verdict", { kind, slug, verdict: "approved" });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setMessage(isDraft ? "Approved and published. Opening the next item." : "Approved. Opening the next item.");
    router.push(nextHref);
  }

  async function needsWork() {
    if (busy) return;
    if (!askNote || !note.trim()) {
      setAskNote(true);
      setError(askNote ? "Say what needs work, so it can be fixed." : "");
      requestAnimationFrame(() => noteRef.current?.focus());
      return;
    }
    setBusy(true);
    setError("");
    const r = await call("POST", "/api/content/verdict", { kind, slug, verdict: "needs-work", note });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setMessage("Saved your note. Opening the next item.");
    router.push(nextHref);
  }

  async function unpublish() {
    if (busy) return;
    setBusy(true);
    setError("");
    const r = await call("POST", "/api/content/status", { slug, status: "draft" });
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setMessage("Moved back to draft. Learners cannot see it now.");
    router.refresh();
  }

  // Keep the latest handlers reachable from one key listener.
  const latest = useRef({ approve, needsWork });
  useEffect(() => {
    latest.current = { approve, needsWork };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        void latest.current.approve();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setAskNote(true);
        requestAnimationFrame(() => noteRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section className="review-form" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>Your review</h2>
      <div className="row">
        <button type="button" className="btn" disabled={busy} onClick={() => void approve()}>
          {isDraft ? "Approve and publish" : "Approve"} <kbd className="key" aria-hidden="true">A</kbd>
        </button>
        <button type="button" className="btn secondary" disabled={busy} onClick={() => void needsWork()}>
          Needs work <kbd className="key" aria-hidden="true">N</kbd>
        </button>
        {canUnpublish && (
          <button type="button" className="btn secondary" disabled={busy} onClick={() => void unpublish()}>
            Move back to draft
          </button>
        )}
      </div>
      {askNote && (
        <div className="field">
          <label htmlFor={`${id}-n`}>What needs work?</label>
          <textarea
            id={`${id}-n`}
            ref={noteRef}
            className="writebox"
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-describedby={`${id}-nh`}
          />
          <span id={`${id}-nh`} className="hint">
            Name the sentence or field and what is wrong. Then choose Needs work again to save it.
          </span>
        </div>
      )}
      <p role="status" aria-live="polite" className={error ? "wrong-text" : "muted"} data-testid="review-status">
        {error || message}
      </p>
    </section>
  );
}
