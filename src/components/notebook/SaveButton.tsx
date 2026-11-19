"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "./api";

/** Saves a library expression to the notebook. Shows "Saved" with a link once it is there. */
export default function SaveButton({ slug, entryId }: { slug: string; entryId: number | null }) {
  const router = useRouter();
  const [id, setId] = useState<number | null>(entryId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (id !== null) {
    return (
      <Link href={`/notebook/${id}`} className="btn secondary small" aria-label="Saved. Open in your notebook">
        Saved · open
      </Link>
    );
  }

  return (
    <>
      <button
        className="btn small"
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          const r = await call<{ entry: { id: number } }>("POST", "/api/notebook", { slug });
          setBusy(false);
          if (r.ok) {
            setId(r.data.entry.id);
            router.refresh();
          } else setError(r.error);
        }}
      >
        {busy ? "Saving…" : "Save to notebook"}
      </button>
      <span role="status" className="wrong-text">{error}</span>
    </>
  );
}
