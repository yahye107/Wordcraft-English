"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type CheckResponse =
  | { ok: true; correct: boolean | null; feedback: string; expected?: string; sample?: string }
  | { ok: false; error: string };

/** Posts an answer to the server for checking. Returns the result, a loading flag and a reset. */
export function useCheck(exerciseSlug: string) {
  const router = useRouter();
  const [result, setResult] = useState<CheckResponse | null>(null);
  const [loading, setLoading] = useState(false);

  async function check(answer: unknown) {
    setLoading(true);
    try {
      const res = await fetch(`/api/exercises/${exerciseSlug}/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });
      const data = (await res.json()) as CheckResponse;
      setResult(data);
      if (data.ok) router.refresh(); // update the progress counts
    } catch {
      setResult({ ok: false, error: "Could not reach the app. Check that it is still running, then try again." });
    } finally {
      setLoading(false);
    }
  }

  return { result, loading, check, reset: () => setResult(null) };
}
