import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { setMockResponder } from '@/lib/ai/client';
import { createSession, addRevision } from '@/lib/writing/sessions';
import { getModelVersion } from '@/lib/writing/model-version';

let db: Db;
let calls = 0;
beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  calls = 0;
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('WORDCRAFT_AI_MOCK', '1');
  setMockResponder(async () => {
    calls++;
    return { text: JSON.stringify({ text: 'She felt heartbroken when the train left.' }), inputTokens: 10, outputTokens: 10 };
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  setMockResponder(null);
});

function twoRevisions() {
  const s = createSession(db, { mode: 'paragraph' });
  if (!s.ok) throw new Error('x');
  const a = addRevision(db, s.id, 'She was very sad when the train left.');
  const b = addRevision(db, s.id, 'She was sad when the train left without her.');
  if (!a.ok || !b.ok) throw new Error('x');
  return { sessionId: s.id, first: a.revisionId, second: b.revisionId };
}

describe('getModelVersion', () => {
  it('returns 409 for version 1', async () => {
    const { sessionId, first } = twoRevisions();
    expect(await getModelVersion(db, sessionId, first)).toMatchObject({ ok: false, status: 409 });
    expect(calls).toBe(0);
  });

  it('returns 409 when the session has only one revision', async () => {
    const s = createSession(db, { mode: 'paragraph' });
    if (!s.ok) throw new Error('x');
    const a = addRevision(db, s.id, 'Only one version.');
    if (!a.ok) throw new Error('x');
    expect(await getModelVersion(db, s.id, a.revisionId)).toMatchObject({ ok: false, status: 409 });
  });

  it('is allowed for version 2, labelled, and stored', async () => {
    const { sessionId, second } = twoRevisions();
    const r = await getModelVersion(db, sessionId, second);
    expect(r).toEqual({ ok: true, text: 'She felt heartbroken when the train left.', label: 'One possible version' });
    expect(db.get<{ text: string }>('SELECT text FROM model_versions WHERE revision_id = ?', [second])!.text).toContain('heartbroken');
  });

  it('returns the stored text on a second request without calling the model', async () => {
    const { sessionId, second } = twoRevisions();
    await getModelVersion(db, sessionId, second);
    const again = await getModelVersion(db, sessionId, second);
    expect(again.ok).toBe(true);
    expect(calls).toBe(1);
  });

  it('returns 404 for unknown ids and for a revision of another session', async () => {
    const { sessionId, second } = twoRevisions();
    expect(await getModelVersion(db, 999, second)).toMatchObject({ ok: false, status: 404 });
    expect(await getModelVersion(db, sessionId, 999)).toMatchObject({ ok: false, status: 404 });
    const other = createSession(db, { mode: 'paragraph' });
    if (!other.ok) throw new Error('x');
    expect(await getModelVersion(db, other.id, second)).toMatchObject({ ok: false, status: 404 });
  });

  it('returns 503 when there is no key', async () => {
    vi.stubEnv('WORDCRAFT_AI_MOCK', '');
    const { sessionId, second } = twoRevisions();
    const r = await getModelVersion(db, sessionId, second);
    expect(r).toMatchObject({ ok: false, status: 503 });
  });

  it('rejects an over-long reply as unusable (503) and stores nothing', async () => {
    setMockResponder(async () => ({ text: JSON.stringify({ text: 'word '.repeat(300) }), inputTokens: 1, outputTokens: 1 }));
    const { sessionId, second } = twoRevisions();
    expect(await getModelVersion(db, sessionId, second)).toMatchObject({ ok: false, status: 503 });
    expect(db.get<{ n: number }>('SELECT COUNT(*) n FROM model_versions')!.n).toBe(0);
  });

  it('rejects an empty reply', async () => {
    setMockResponder(async () => ({ text: JSON.stringify({ text: '   ' }), inputTokens: 1, outputTokens: 1 }));
    const { sessionId, second } = twoRevisions();
    expect(await getModelVersion(db, sessionId, second)).toMatchObject({ ok: false, status: 503 });
  });
});
