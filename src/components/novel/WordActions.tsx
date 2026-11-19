"use client";

import { useState } from "react";
import { call } from "@/components/notebook/api";

/** Save a library expression ({ slug }) or a word to look up ({ text, meaning }) to the notebook. */
export default function WordActions({ slug, text, meaning, label }: { slug?: string; text?: string; meaning?: string; label: string }) {
  const [state, setState] = useState<"idle" | "busy" | "saved">("idle");
  const [error, setError] = useState("");

  async function save() {
    setState("busy");
    setError("");
    const body = slug ? { slug } : { text, myMeaning: meaning ?? "" };
    const r = await call("POST", "/api/notebook", body);
    if (r.ok) setState("saved");
    else {
      setState("idle");
      setError(r.error);
    }
  }

  return (
    <span className="word-action">
      <button type="button" className="btn secondary small" disabled={state !== "idle"} onClick={() => void save()} aria-label={`${label}: ${slug ?? text}`}>
        {state === "saved" ? "Saved ✓" : state === "busy" ? "Saving…" : label}
      </button>
      <span role="status" aria-live="polite" className="wrong-text">{error}</span>
    </span>
  );
}
