import type { Db } from '@/lib/db';
import { submitAnswer } from './submit';

const MAX_BODY_BYTES = 10_000;

/** The logic behind POST /api/exercises/{slug}/check, kept apart from Next.js so it can be tested. */
export async function handleCheck(db: Db, exerciseSlug: string, request: Request): Promise<Response> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: 'That answer is too large to send.' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: 'Send JSON like { "answer": ... }.' }, { status: 400 });
  }
  if (typeof body !== 'object' || body === null || !('answer' in body)) {
    return Response.json({ ok: false, error: 'Send JSON like { "answer": ... }.' }, { status: 400 });
  }

  const result = submitAnswer(db, exerciseSlug, (body as { answer: unknown }).answer);
  return Response.json(result.body, { status: result.status });
}
