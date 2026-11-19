import type { Db } from '@/lib/db';
import { addCustom, addExample, deleteEntry, deleteExample, saveFromLibrary, updateEntry } from './entries';
import { createCollection, deleteCollection, renameCollection, setEntryCollections } from './collections';
import { importFile, parseObsidianNotes } from './importer';
import { gradeCard } from './review';
import { LIMITS, type Fail } from './limits';
import type { Grade } from '@/lib/srs/schedule';

const MAX_BODY = 10_000;
const MAX_IMPORT_BODY = LIMITS.importChars * 1.1;

const err = (status: number, error: string) => Response.json({ ok: false, error }, { status });

function statusFor(f: Fail): number {
  if (f.error.includes('does not exist')) return 404;
  if (f.error.includes('already have')) return 409;
  return 400;
}
const failed = (f: Fail) => err(statusFor(f), f.error);

async function readBody(request: Request, maxBytes = MAX_BODY): Promise<Record<string, unknown> | Response> {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > maxBytes) return err(413, 'That request is too large.');
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return err(400, 'Send JSON.');
  }
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return err(400, 'Send a JSON object.');
  return body as Record<string, unknown>;
}

/** POST /api/notebook: save a library expression ({ slug }) or add a custom word ({ text, ... }). */
export async function handleAdd(db: Db, request: Request): Promise<Response> {
  const body = await readBody(request);
  if (body instanceof Response) return body;

  if (typeof body.slug === 'string') {
    const r = saveFromLibrary(db, body.slug);
    return r ? Response.json({ ok: true, ...r }) : err(404, 'That expression does not exist.');
  }
  if ('text' in body) {
    const r = addCustom(db, body);
    return r.ok ? Response.json(r) : failed(r);
  }
  return err(400, 'Send { "slug": ... } or { "text": ... }.');
}

export async function handleUpdate(db: Db, id: number, request: Request): Promise<Response> {
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const r = updateEntry(db, id, body);
  return r.ok ? Response.json(r) : failed(r);
}

export async function handleDelete(db: Db, id: number): Promise<Response> {
  const r = deleteEntry(db, id);
  return r.ok ? Response.json(r) : failed(r);
}

export async function handleAddExample(db: Db, id: number, request: Request): Promise<Response> {
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const r = addExample(db, id, body.text);
  return r.ok ? Response.json(r) : failed(r);
}

export async function handleDeleteExample(db: Db, exampleId: number): Promise<Response> {
  const r = deleteExample(db, exampleId);
  return r.ok ? Response.json(r) : failed(r);
}

export async function handleSetCollections(db: Db, id: number, request: Request): Promise<Response> {
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const r = setEntryCollections(db, id, body.collectionIds as number[]);
  return r.ok ? Response.json(r) : failed(r);
}

export async function handleCreateCollection(db: Db, request: Request): Promise<Response> {
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const r = createCollection(db, body.name);
  return r.ok ? Response.json(r) : failed(r);
}

export async function handleRenameCollection(db: Db, id: number, request: Request): Promise<Response> {
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const r = renameCollection(db, id, body.name);
  return r.ok ? Response.json(r) : failed(r);
}

export async function handleDeleteCollection(db: Db, id: number): Promise<Response> {
  const r = deleteCollection(db, id);
  return r.ok ? Response.json(r) : failed(r);
}

export async function handleImport(db: Db, request: Request): Promise<Response> {
  const body = await readBody(request, MAX_IMPORT_BODY);
  if (body instanceof Response) return body;
  if (body.dryRun === true) {
    if (typeof body.text !== 'string') return err(400, 'Send the notes as text.');
    if (body.text.length > LIMITS.importChars) return err(400, 'That file is too large (limit 1 MB).');
    return Response.json({ ok: true, dryRun: true, found: parseObsidianNotes(body.text).length, added: 0, skipped: 0, linked: 0 });
  }
  const r = importFile(db, body.text);
  return r.ok ? Response.json(r) : failed(r);
}

export async function handleGrade(db: Db, id: number, request: Request): Promise<Response> {
  const body = await readBody(request);
  if (body instanceof Response) return body;
  const r = gradeCard(db, id, body.grade as Grade);
  return r.ok ? Response.json({ ok: true, card: r.card }) : err(r.status, r.error);
}

/** Read a positive whole number from a URL segment, or null. */
export function parseId(segment: string): number | null {
  return /^[1-9][0-9]{0,9}$/.test(segment) ? Number(segment) : null;
}

export const notFound = () => Response.json({ ok: false, error: 'Not found.' }, { status: 404 });
