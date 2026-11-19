"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "@/components/notebook/api";

/** Adds the tutor layer to a local-only analysis. */
export default function AddAiButton({ id }: { id: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="stack">
      <div className="row">
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            const r = await call("POST", `/api/novel/analyses/${id}/ai`);
            setBusy(false);
            if (r.ok) router.refresh();
            else setError(r.error);
          }}
        >
          {busy ? "Asking the tutor…" : "Add tutor analysis"}
        </button>
      </div>
      <p role="status" aria-live="polite" className={error ? "wrong-text" : "muted"}>
        {error || (busy ? "The tutor can take up to half a minute." : "This sends the passage to Claude. Nothing else is sent.")}
      </p>
    </div>
  );
}
