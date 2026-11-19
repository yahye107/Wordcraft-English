"use client";

export type ApiResult<T = Record<string, unknown>> = { ok: true; data: T } | { ok: false; error: string };

/** Small fetch wrapper for the notebook API. Always resolves; errors come back as { ok: false, error }. */
export async function call<T = Record<string, unknown>>(method: string, url: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) return { ok: false, error: data.error ?? "Something went wrong." };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Could not reach the app. Check that it is still running, then try again." };
  }
}
