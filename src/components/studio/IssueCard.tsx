"use client";

import Link from "next/link";
import { useState } from "react";
import { call } from "@/components/notebook/api";

export type IssueView = {
  id: number;
  category: string;
  source: "local" | "ai";
  quote: string;
  why: string;
  hints: [string, string, string];
  alternatives: { slug: string; text: string; why: string }[];
  hintLevelShown: number;
  resolved: boolean;
};

/** One piece of feedback. Hints are revealed one level at a time. */
export default function IssueCard({ issue }: { issue: IssueView }) {
  const [level, setLevel] = useState(issue.hintLevelShown);
  const [resolved, setResolved] = useState(issue.resolved);
  const [error, setError] = useState("");

  async function reveal(next: number) {
    setLevel(next);
    const r = await call("PATCH", `/api/writing/feedback/${issue.id}`, { hintLevel: next });
    if (!r.ok) setError(r.error);
  }

  async function fix() {
    setResolved(true);
    const r = await call("PATCH", `/api/writing/feedback/${issue.id}`, { resolved: true });
    if (!r.ok) {
      setResolved(false);
      setError(r.error);
    }
  }

  return (
    <li className={resolved ? "issue issue-done" : "issue"}>
      <div className="badges">
        <span className="badge">{issue.category}</span>
        {issue.source === "ai" && <span className="badge">Tutor</span>}
        {resolved && <span className="badge done">Fixed</span>}
      </div>
      <p className="issue-quote">
        <span className="visually-hidden">Your words: </span>
        <mark className="hl">{issue.quote}</mark>
      </p>
      <p className="issue-hint">{issue.hints[0]}</p>
      {level >= 2 && <p className="issue-hint">{issue.hints[1]}</p>}
      {level >= 3 && (
        <>
          <p className="issue-hint">{issue.hints[2]}</p>
          {issue.alternatives.length > 0 && (
            <ul className="alts" aria-label="Words you could try">
              {issue.alternatives.map((a, i) => (
                <li key={i}>
                  {a.slug ? <Link href={`/e/${a.slug}`}>{a.text}</Link> : <strong>{a.text}</strong>}
                  <span className="muted"> — {a.why}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      <div className="row">
        {level < 2 && (
          <button type="button" className="btn secondary small" onClick={() => reveal(2)}>
            Why?
          </button>
        )}
        {level === 2 && (
          <button type="button" className="btn secondary small" onClick={() => reveal(3)}>
            Show directions
          </button>
        )}
        {!resolved && (
          <button type="button" className="btn secondary small" onClick={fix}>
            Mark as fixed
          </button>
        )}
      </div>
      {error && <p role="status" className="wrong-text">{error}</p>}
    </li>
  );
}
