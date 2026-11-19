import type { Db } from '@/lib/db';
import { sameOrigin } from './origin';
import { recordVerdict } from './review';
import { setExpressionStatus } from './status';

const MAX_BODY = 20_000;

const err = (status: number, error: string) => Response.json({ ok: false, error }, { status });

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

const FORBIDDEN = () => err(403, 'That request came from another site, so it was refused.');

export async function handleVerdict(db: Db, dir: string, request: Request): Promise<Response> {
  if (!sameOrigin(request)) return FORBIDDEN();
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const r = recordVerdict(db, dir, { kind: body.kind, slug: body.slug, verdict: body.verdict, note: body.note });
  return r.ok ? Response.json({ ok: true }) : err(r.status, r.error);
}

export async function handleStatus(db: Db, dir: string, request: Request): Promise<Response> {
  if (!sameOrigin(request)) return FORBIDDEN();
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const r = await setExpressionStatus(db, dir, body.slug, body.status);
  return r.ok ? Response.json({ ok: true, status: r.status }) : err(r.status, r.error);
}
