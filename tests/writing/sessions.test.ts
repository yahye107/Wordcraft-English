import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { createSession, getSession, listSessions, deleteSession, addRevision } from '@/lib/writing/sessions';

function setup(): Db {
  const db = openDb(':memory:');
  migrate(db);
  return db;
}
const count = (db: Db, t: string) => db.get<{ n: number }>(`SELECT COUNT(*) n FROM ${t}`)!.n;

describe('createSession', () => {
  it('creates a session with a default title from the mode', () => {
    const db = setup();
    const r = createSession(db, { mode: 'paragraph' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(getSession(db, r.id)!.title.length).toBeGreaterThan(0);
  });

  it('uses the prompt title when a prompt slug is given', () => {
    const db = setup();
    db.run(
      "INSERT INTO writing_prompts (slug, mode, kind, title, situation, constraints_json, try_json, level) VALUES ('p1','situation','scene','The late train','x','[]','[]','beginner')",
    );
    const r = createSession(db, { mode: 'situation', promptSlug: 'p1' });
    if (!r.ok) throw new Error('failed');
    expect(getSession(db, r.id)!.title).toBe('The late train');
    expect(getSession(db, r.id)!.promptSlug).toBe('p1');
  });

  it('rejects an unknown mode', () => {
    expect(createSession(setup(), { mode: 'poetry' as never }).ok).toBe(false);
  });
});

describe('addRevision', () => {
  it('stores version 1 then version 2 with word counts', () => {
    const db = setup();
    const s = createSession(db, { mode: 'paragraph' });
    if (!s.ok) throw new Error('x');
    const a = addRevision(db, s.id, 'The day was very good.');
    const b = addRevision(db, s.id, 'The day felt wonderful.');
    expect(a).toMatchObject({ ok: true, version: 1, duplicate: false });
    expect(b).toMatchObject({ ok: true, version: 2, duplicate: false });
    const loaded = getSession(db, s.id)!;
    expect(loaded.revisions.map((r) => r.version)).toEqual([1, 2]);
    expect(loaded.revisions[0].wordCount).toBe(5);
  });

  it('treats identical text as a duplicate and stores nothing', () => {
    const db = setup();
    const s = createSession(db, { mode: 'paragraph' });
    if (!s.ok) throw new Error('x');
    const a = addRevision(db, s.id, 'Same text.');
    const b = addRevision(db, s.id, 'Same text.');
    expect(b).toMatchObject({ ok: true, duplicate: true });
    if (a.ok && b.ok) expect(b.revisionId).toBe(a.revisionId);
    expect(count(db, 'writing_revisions')).toBe(1);
  });

  it('rejects empty and over-long text', () => {
    const db = setup();
    const s = createSession(db, { mode: 'paragraph' });
    if (!s.ok) throw new Error('x');
    expect(addRevision(db, s.id, '   ').ok).toBe(false);
    expect(addRevision(db, s.id, 'x'.repeat(5001)).ok).toBe(false);
    expect(addRevision(db, s.id, 'x'.repeat(5000)).ok).toBe(true);
  });

  it('rejects sentence-mode text over 500 characters', () => {
    const db = setup();
    const s = createSession(db, { mode: 'sentence' });
    if (!s.ok) throw new Error('x');
    expect(addRevision(db, s.id, 'x'.repeat(501)).ok).toBe(false);
    expect(addRevision(db, s.id, 'x'.repeat(500)).ok).toBe(true);
  });

  it('rejects more than 20 revisions', () => {
    const db = setup();
    const s = createSession(db, { mode: 'paragraph' });
    if (!s.ok) throw new Error('x');
    for (let i = 0; i < 20; i++) expect(addRevision(db, s.id, `Version ${i}.`).ok).toBe(true);
    expect(addRevision(db, s.id, 'One too many.').ok).toBe(false);
  });

  it('returns a failure for an unknown session', () => {
    const r = addRevision(setup(), 999, 'Text.');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('does not exist');
  });
});

describe('listing and deleting', () => {
  it('lists newest first with revision counts', () => {
    const db = setup();
    const a = createSession(db, { mode: 'paragraph', title: 'First' });
    const b = createSession(db, { mode: 'creative', title: 'Second' });
    if (!a.ok || !b.ok) throw new Error('x');
    addRevision(db, b.id, 'Some words here.');
    const list = listSessions(db, {});
    expect(list.map((s) => s.title)).toEqual(['Second', 'First']);
    expect(list[0]).toMatchObject({ revisionCount: 1, latestWordCount: 3 });
  });

  it('deleting a session removes revisions, feedback and model versions', () => {
    const db = setup();
    const s = createSession(db, { mode: 'paragraph' });
    if (!s.ok) throw new Error('x');
    const r = addRevision(db, s.id, 'Text here.');
    if (!r.ok) throw new Error('x');
    db.run("INSERT INTO feedback_items (revision_id, source, category, key, quote, why, hint1, hint2, hint3) VALUES (?, 'local', 'vocabulary', 'very', 'very', 'w', 'a', 'b', 'c')", [r.revisionId]);
    db.run("INSERT INTO model_versions (revision_id, text) VALUES (?, 'x')", [r.revisionId]);
    expect(deleteSession(db, s.id).ok).toBe(true);
    for (const t of ['writing_sessions', 'writing_revisions', 'feedback_items', 'model_versions']) expect(count(db, t)).toBe(0);
    expect(deleteSession(db, s.id).ok).toBe(false);
  });

  it('returns plain objects', () => {
    const db = setup();
    const s = createSession(db, { mode: 'paragraph' });
    if (!s.ok) throw new Error('x');
    addRevision(db, s.id, 'Text here.');
    const loaded = getSession(db, s.id)!;
    expect(Object.getPrototypeOf(loaded)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(loaded.revisions[0])).toBe(Object.prototype);
    expect(Object.getPrototypeOf(listSessions(db, {})[0])).toBe(Object.prototype);
  });
});
