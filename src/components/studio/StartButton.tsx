"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { call } from "@/components/notebook/api";

/** Creates a writing session and opens it. */
export default function StartButton({
  mode,
  promptSlug,
  label,
  secondary,
}: {
  mode: string;
  promptSlug?: string;
  label: string;
  secondary?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <>
      <button
        type="button"
        className={secondary ? "btn secondary" : "btn"}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          const r = await call<{ id: number }>("POST", "/api/writing/sessions", { mode, promptSlug });
          if (r.ok) router.push(`/studio/session/${r.data.id}`);
          else {
            setBusy(false);
            setError(r.error);
          }
        }}
      >
        {busy ? "Starting…" : label}
      </button>
      <span role="status" className="wrong-text">{error}</span>
    </>
  );
}
