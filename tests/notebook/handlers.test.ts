import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { loadContent } from '@/lib/content/load';
import { seedContent } from '@/lib/content/seed';
import * as h from '@/lib/notebook/handlers';
import { makeContentDir, CATEGORIES_YAML, expressionYaml } from '../content/helpers';

function setup(): Db {
  const { bundle, errors } = loadContent(
    makeContentDir({ 'categories.yaml': CATEGORIES_YAML, 'expressions/sadness/crestfallen.yaml': expressionYaml() }),
  );
  expect(errors).toEqual([]);
  const db = openDb(':memory:');
  migrate(db);
  seedContent(db, bundle);
  return db;
}

const req = (body: unknown, method = 'POST') =>
  new Request('http://localhost/api/x', { method, body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (r: Response) => (await r.json()) as Record<string, any>;

describe('add and save', () => {
  it('saves a library expression and is idempotent', async () => {
    const db = setup();
    const a = await h.handleAdd(db, req({ slug: 'crestfallen' }));
    const b = await h.handleAdd(db, req({ slug: 'crestfallen' }));
    expect(a.status).toBe(200);
    const [ja, jb] = [await json(a), await json(b)];
    expect(ja).toMatchObject({ ok: true, created: true });
    expect(jb).toMatchObject({ ok: true, created: false });
    expect(jb.entry.id).toBe(ja.entry.id);
  });

  it('returns 404 for an unknown slug', async () => {
    expect((await h.handleAdd(setup(), req({ slug: 'nope' }))).status).toBe(404);
  });

  it('adds a custom word', async () => {
    const res = await h.handleAdd(setup(), req({ text: 'apprehensive', myMeaning: 'worried' }));
    expect(res.status).toBe(200);
    expect((await json(res)).entry.text).toBe('apprehensive');
  });

  it('rejects bad JSON, a missing body shape and an oversized body', async () => {
    const db = setup();
    expect((await h.handleAdd(db, req('not json {'))).status).toBe(400);
    expect((await h.handleAdd(db, req({ nothing: 1 }))).status).toBe(400);
    expect((await h.handleAdd(db, req({ text: 'x'.repeat(20_000) }))).status).toBe(413);
  });

  it('returns 400 for an over-long note', async () => {
    const res = await h.handleAdd(setup(), req({ text: 'word', myNotes: 'n'.repeat(2001) }));
    expect(res.status).toBe(400);
  });
});

describe('entries, examples and collections', () => {
  it('updates notes, adds and deletes an example, and deletes the entry', async () => {
    const db = setup();
    const { entry } = await json(await h.handleAdd(db, req({ slug: 'crestfallen' })));
    expect((await h.handleUpdate(db, entry.id, req({ myNotes: 'for faces' }, 'PATCH'))).status).toBe(200);
    const ex = await json(await h.handleAddExample(db, entry.id, req({ text: 'He looked crestfallen.' })));
    expect(ex.ok).toBe(true);
    expect((await h.handleDeleteExample(db, ex.id)).status).toBe(200);
    expect((await h.handleDeleteExample(db, ex.id)).status).toBe(404);
    expect((await h.handleDelete(db, entry.id)).status).toBe(200);
    expect((await h.handleDelete(db, entry.id)).status).toBe(404);
    expect((await h.handleUpdate(db, entry.id, req({ myNotes: 'x' }, 'PATCH'))).status).toBe(404);
  });

  it('creates, renames and deletes a collection and sets entry collections', async () => {
    const db = setup();
    const { entry } = await json(await h.handleAdd(db, req({ slug: 'crestfallen' })));
    const c = await json(await h.handleCreateCollection(db, req({ name: 'Sadness' })));
    expect(c.ok).toBe(true);
    expect((await h.handleCreateCollection(db, req({ name: 'sadness' }))).status).toBe(409);
    expect((await h.handleSetCollections(db, entry.id, req({ collectionIds: [c.id] }, 'PUT'))).status).toBe(200);
    expect((await h.handleSetCollections(db, entry.id, req({ collectionIds: [999] }, 'PUT'))).status).toBe(404);
    expect((await h.handleRenameCollection(db, c.id, req({ name: 'Grief' }, 'PATCH'))).status).toBe(200);
    expect((await h.handleDeleteCollection(db, c.id)).status).toBe(200);
    expect((await h.handleDeleteCollection(db, c.id)).status).toBe(404);
  });
});

describe('import and review', () => {
  it('imports pasted notes and reports counts', async () => {
    const db = setup();
    const text = '> [!PDF|note] [[B.pdf#page=1|B, p.1]]\n> > frightened\n> afraid\n';
    const res = await json(await h.handleImport(db, req({ text })));
    expect(res).toMatchObject({ ok: true, found: 1, added: 1 });
    expect(await json(await h.handleImport(db, req({ text })))).toMatchObject({ added: 0, skipped: 1 });
  });

  it('a dry run reports how many notes were found and adds nothing', async () => {
    const db = setup();
    const text = '> [!PDF|note] [[B.pdf#page=1|B, p.1]]\n> > frightened\n> afraid\n';
    const res = await json(await h.handleImport(db, req({ text, dryRun: true })));
    expect(res).toMatchObject({ ok: true, found: 1, added: 0, dryRun: true });
    expect(db.get<{ n: number }>('SELECT COUNT(*) n FROM notebook_entries')!.n).toBe(0);
  });

  it('refuses an import with no text', async () => {
    expect((await h.handleImport(setup(), req({}))).status).toBe(400);
  });

  it('grades a due card, and returns 409 for one that is not due', async () => {
    const db = setup();
    const { entry } = await json(await h.handleAdd(db, req({ slug: 'crestfallen' })));
    expect((await h.handleGrade(db, entry.id, req({ grade: 'good' }))).status).toBe(200);
    expect((await h.handleGrade(db, entry.id, req({ grade: 'good' }))).status).toBe(409);
    expect((await h.handleGrade(db, entry.id, req({ grade: 'wow' }))).status).toBe(400);
    expect((await h.handleGrade(db, 9999, req({ grade: 'good' }))).status).toBe(404);
  });
});
