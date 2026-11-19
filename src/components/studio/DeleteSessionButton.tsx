"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "@/components/notebook/api";

export default function DeleteSessionButton({ id, title }: { id: number; title: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");

  if (!confirming) {
    return (
      <button type="button" className="btn secondary small" onClick={() => setConfirming(true)} aria-label={`Delete ${title}`}>
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
          const r = await call("DELETE", `/api/writing/sessions/${id}`);
          if (r.ok) router.refresh();
          else setError(r.error);
        }}
      >
        Yes, delete
      </button>
      <button type="button" className="btn secondary small" onClick={() => setConfirming(false)}>Keep</button>
      {error && <span role="status" className="wrong-text">{error}</span>}
    </span>
  );
}
