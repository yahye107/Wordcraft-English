"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "@/components/notebook/api";
import { markQuotes } from "@/lib/writing/mark";
import IssueCard, { type IssueView } from "./IssueCard";

export type RevisionView = {
  id: number;
  version: number;
  text: string;
  wordCount: number;
  aiUsed: boolean;
  aiNote: string | null;
  createdAt: string;
  issues: IssueView[];
  modelVersion: string | null;
  strengths: string[];
  overall: string | null;
  nextStep: string | null;
};

type Props = {
  sessionId: number;
  mode: string;
  maxChars: number;
  prompt: { title: string; situation: string; constraints: string[]; try: { slug: string; text: string }[] } | null;
  revisions: RevisionView[];
  aiAvailable: boolean;
  tryUsed: string[];
};

type Progress = { resolved: number; remaining: number; added: number } | null;

export default function Workspace({ sessionId, mode, maxChars, prompt, revisions, aiAvailable, tryUsed }: Props) {
  const router = useRouter();
  const id = useId();
  const latest = revisions[revisions.length - 1] ?? null;
  const [text, setText] = useState(latest?.text ?? "");
  const [busy, setBusy] = useState<"local" | "ai" | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<Progress>(null);
  const [version, setVersion] = useState<{ text?: string; error?: string; busy?: boolean }>({});

  async function check(useAi: boolean) {
    setBusy(useAi ? "ai" : "local");
    setError("");
    const r = await call<{ progress: Progress }>("POST", `/api/writing/sessions/${sessionId}/revisions`, { text, useAi });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    setProgress(r.data.progress);
    router.refresh();
  }

  async function showVersion() {
    if (!latest) return;
    setVersion({ busy: true });
    const r = await call<{ text: string }>("POST", `/api/writing/sessions/${sessionId}/revisions/${latest.id}/model-version`);
    setVersion(r.ok ? { text: r.data.text } : { error: r.error });
  }

  const marked = latest ? markQuotes(latest.text, latest.issues.filter((i) => !i.resolved).map((i) => i.quote)) : [];
  const unresolved = latest ? latest.issues.filter((i) => !i.resolved).length : 0;

  return (
    <div className="workspace">
      {prompt && (
        <section className="panel prompt-panel" aria-labelledby={`${id}-p`}>
          <h2 id={`${id}-p`}>{prompt.title}</h2>
          <p className="sentence">{prompt.situation}</p>
          {prompt.constraints.length > 0 && (
            <ul className="lesson-bullets">
              {prompt.constraints.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
          {prompt.try.length > 0 && (
            <>
              <p className="field-label">Try to use these words</p>
              <ul className="chips">
                {prompt.try.map((t) => (
                  <li key={t.slug}>
                    <Link href={`/e/${t.slug}`} className="chip">
                      {tryUsed.includes(t.slug) ? "✓ " : ""}
                      {t.text}
                      {tryUsed.includes(t.slug) && <span className="visually-hidden"> (used)</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <section className="stack" aria-label="Writing area">
        <div className="field">
          <label htmlFor={`${id}-t`}>Your writing</label>
          <textarea
            id={`${id}-t`}
            className="writebox big"
            rows={mode === "sentence" ? 3 : 10}
            maxLength={maxChars}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <span className="hint" aria-live="polite">{text.length} of {maxChars} characters</span>
        </div>

        <div className="row">
          <button
            type="button"
            className={aiAvailable ? "btn secondary" : "btn"}
            disabled={busy !== null || !text.trim()}
            onClick={() => check(false)}
          >
            {busy === "local" ? "Checking…" : revisions.length > 0 ? "Check my revision (local tools)" : "Check with local tools"}
          </button>
          {aiAvailable && (
            <button type="button" className="btn" disabled={busy !== null || !text.trim()} onClick={() => check(true)}>
              {busy === "ai" ? "Asking the tutor…" : revisions.length > 0 ? "Get feedback on my revision" : "Get tutor feedback"}
            </button>
          )}
        </div>
        <p className="muted privacy" data-testid="privacy-note">
          {aiAvailable
            ? "Tutor feedback sends your writing to Claude. Nothing else is sent. Local checks send nothing."
            : "Tutor feedback is off because no API key is set. Local checks work without one and send nothing anywhere."}
        </p>
        <p role="status" aria-live="polite" className="wrong-text">{error}</p>
      </section>

      {latest && (
        <section className="stack" aria-labelledby={`${id}-f`} data-testid="feedback">
          <h2 id={`${id}-f`}>Feedback on version {latest.version}</h2>
          {latest.aiNote && <p className="muted" data-testid="ai-note">{latest.aiNote}</p>}
          {progress && (
            <p className="right" data-testid="progress">
              {progress.resolved} fixed, {progress.remaining} left, {progress.added} new.
            </p>
          )}
          {latest.strengths.length > 0 && (
            <div className="panel">
              <p className="field-label">What is working</p>
              <ul className="lesson-bullets">
                {latest.strengths.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {latest.overall && <p>{latest.overall}</p>}

          <p className="sentence marked-text" aria-label="Your text with marked words">
            {marked.map((p, i) => (p.marked ? <mark key={i} className="hl">{p.text}</mark> : <span key={i}>{p.text}</span>))}
          </p>

          {latest.issues.length === 0 ? (
            <p className="panel">The local checks found nothing to fix. Read your writing aloud once more, and ask whether every sentence says exactly what you mean.</p>
          ) : (
            <>
              <p className="muted">{unresolved} {unresolved === 1 ? "thing" : "things"} to look at. Try to fix each one yourself, then check your revision.</p>
              <ul className="issues">
                {latest.issues.map((i) => (
                  <IssueCard key={`${latest.id}-${i.id}`} issue={i} />
                ))}
              </ul>
            </>
          )}
          {latest.nextStep && <p><strong>Next step:</strong> {latest.nextStep}</p>}

          {latest.version >= 2 && aiAvailable && (
            <div className="panel stack">
              <h3>Want to compare?</h3>
              {version.text || latest.modelVersion ? (
                <div className="sample">
                  <p className="sample-title">One possible version</p>
                  <p className="sentence">{version.text ?? latest.modelVersion}</p>
                  <p className="muted">Compare it with yours. Do not copy it.</p>
                </div>
              ) : (
                <div className="row">
                  <button type="button" className="btn secondary" disabled={version.busy} onClick={showVersion}>
                    {version.busy ? "Writing…" : "Show one possible version"}
                  </button>
                </div>
              )}
              {version.error && <p role="status" className="wrong-text">{version.error}</p>}
            </div>
          )}
        </section>
      )}

      {revisions.length > 1 && (
        <details className="panel">
          <summary>Your versions ({revisions.length})</summary>
          <ol className="history">
            {revisions.map((r) => (
              <li key={r.id}>
                <strong>Version {r.version}</strong> · {r.wordCount} words · {r.issues.length} to look at
                <p className="sentence">{r.text}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
