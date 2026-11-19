"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "@/components/notebook/api";

/** Deletes an analysis and the passage stored with it. `redirect` sends the learner back to the list. */
export default function DeleteAnalysisButton({ id, label, redirect }: { id: number; label: string; redirect?: boolean }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  if (!confirming) {
    return (
      <button type="button" className="btn secondary small" onClick={() => setConfirming(true)} aria-label={`Delete ${label}`}>
        Delete…
      </button>
    );
  }
  return (
    <span className="row">
      <button
        type="button"
        className="btn small"
        onClick={async () => {
          const r = await call("DELETE", `/api/novel/analyses/${id}`);
          if (!r.ok) return setError(r.error);
          if (redirect) router.push("/novel");
          else router.refresh();
        }}
      >
        Yes, delete
      </button>
      <button type="button" className="btn secondary small" onClick={() => setConfirming(false)}>Keep</button>
      {error && <span role="status" className="wrong-text">{error}</span>}
    </span>
  );
}
