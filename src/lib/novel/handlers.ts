import type { Db } from '@/lib/db';
import type { Fail } from '@/lib/notebook/limits';
import { addAiLayer, analysePassage } from './analyse';
import { deleteAnalysis } from './store';

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

export async function handleAnalyse(db: Db, request: Request): Promise<Response> {
  const body = await readBody(request);
  if (body instanceof Response) return body;
  if (typeof body.excerpt !== 'string') return err(400, 'Send the passage as { "excerpt": "..." }.');
  const r = await analysePassage(db, { excerpt: body.excerpt, sourceTitle: body.sourceTitle, useAi: body.useAi === true });
  return r.ok ? Response.json(r) : failed(r);
}

export async function handleDelete(db: Db, id: number): Promise<Response> {
  const r = deleteAnalysis(db, id);
  return r.ok ? Response.json(r) : failed(r);
}

export async function handleAddAi(db: Db, id: number): Promise<Response> {
  const r = await addAiLayer(db, id);
  if (r.ok) return Response.json(r);
  return 'unavailable' in r && r.unavailable ? err(503, r.error) : failed(r);
}
