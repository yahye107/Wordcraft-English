import type { Db } from '@/lib/db';
import type { Fail } from '@/lib/notebook/limits';
import { createSession, deleteSession } from './sessions';
import { markResolved, setHintLevel, submitForFeedback } from './feedback';
import { getModelVersion } from './model-version';
import { findAlternatives } from './vocab';

const MAX_BODY = 20_000;

const err = (status: number, error: string) => Response.json({ ok: false, error }, { status });
const failed = (f: Fail) => err(f.error.includes('does not exist') ? 404 : 400, f.error);

async function readBody(request: Request): Promise<Record<string, unknown> | Response> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY) return err(413, 'That request is too large.');
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return err(400, 'Send JSON.');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return err(400, 'Send a JSON object.');
  return body as Record<string, unknown>;
}

export async function handleCreateSession(db: Db, request: Request): Promise<Response> {
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const r = createSession(db, {
    mode: body.mode,
    promptSlug: typeof body.promptSlug === 'string' ? body.promptSlug : null,
    title: body.title,
  });
  return r.ok ? Response.json(r) : failed(r);
}

export async function handleDeleteSession(db: Db, id: number): Promise<Response> {
  const r = deleteSession(db, id);
  return r.ok ? Response.json(r) : failed(r);
}

export async function handleSubmit(db: Db, sessionId: number, request: Request): Promise<Response> {
  const body = await readBody(request);
  if (body instanceof Response) return body;
  if (typeof body.text !== 'string') return err(400, 'Send your writing as { "text": "..." }.');
  const r = await submitForFeedback(db, sessionId, body.text, { useAi: body.useAi === true });
  return r.ok ? Response.json(r) : failed(r);
}

export async function handleFeedbackPatch(db: Db, feedbackId: number, request: Request): Promise<Response> {
  const body = await readBody(request);
  if (body instanceof Response) return body;
  if (body.hintLevel !== undefined) {
    const r = setHintLevel(db, feedbackId, Number(body.hintLevel));
    return r.ok ? Response.json(r) : failed(r);
  }
  if (body.resolved === true) {
    const r = markResolved(db, feedbackId);
    return r.ok ? Response.json(r) : failed(r);
  }
  return err(400, 'Send { "hintLevel": 1 to 3 } or { "resolved": true }.');
}

export async function handleModelVersion(db: Db, sessionId: number, revisionId: number): Promise<Response> {
  const r = await getModelVersion(db, sessionId, revisionId);
  return r.ok ? Response.json(r) : err(r.status, r.error);
}

export async function handleVocabulary(db: Db, request: Request): Promise<Response> {
  const body = await readBody(request);
  if (body instanceof Response) return body;
  if (typeof body.word !== 'string') return err(400, 'Send the word as { "word": "..." }.');
  const sentence = typeof body.sentence === 'string' ? body.sentence : undefined;
  return Response.json({ ok: true, ...findAlternatives(db, body.word, sentence) });
}
