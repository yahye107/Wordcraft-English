"use client";

import type { CheckResponse } from "./useCheck";

/** Result of a check, announced politely to screen readers. */
export default function Feedback({ result }: { result: CheckResponse | null }) {
  if (!result) return <div role="status" aria-live="polite" className="fb" />;

  if (!result.ok) {
    return (
      <div role="status" aria-live="polite" className="fb fb-error">
        <p>{result.error}</p>
      </div>
    );
  }

  const tone = result.correct === true ? "fb-ok" : result.correct === false ? "fb-bad" : "fb-note";
  return (
    <div role="status" aria-live="polite" className={`fb ${tone}`}>
      <p>{result.feedback}</p>
      {result.correct === false && result.expected && (
        <p>
          Expected: <strong>{result.expected}</strong>
        </p>
      )}
    </div>
  );
}
