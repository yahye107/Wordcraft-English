import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { setMockResponder } from '@/lib/ai/client';
import * as h from '@/lib/writing/handlers';

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
    return { text: '{"text":"x"}', inputTokens: 1, outputTokens: 1 };
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  setMockResponder(null);
});

const req = (body: unknown, method = 'POST') =>
  new Request('http://localhost/api/x', { method, body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (r: Response) => (await r.json()) as Record<string, any>;

async function newSession(mode = 'paragraph') {
  return (await json(await h.handleCreateSession(db, req({ mode })))).id as number;
}

describe('sessions', () => {
  it('creates a session and rejects an unknown mode', async () => {
    const ok = await h.handleCreateSession(db, req({ mode: 'paragraph' }));
    expect(ok.status).toBe(200);
    expect((await json(ok)).id).toBeGreaterThan(0);
    expect((await h.handleCreateSession(db, req({ mode: 'poetry' }))).status).toBe(400);
    expect((await h.handleCreateSession(db, req('not json {'))).status).toBe(400);
    expect((await h.handleCreateSession(db, req({ mode: 'paragraph', title: 'x'.repeat(30_000) }))).status).toBe(413);
  });

  it('deletes a session and returns 404 the second time', async () => {
    const id = await newSession();
    expect((await h.handleDeleteSession(db, id)).status).toBe(200);
    expect((await h.handleDeleteSession(db, id)).status).toBe(404);
  });
});

describe('submitting text', () => {
  it('returns local issues with local checks only, and never calls the AI', async () => {
    const id = await newSession();
    const res = await h.handleSubmit(db, id, req({ text: 'It was very good.', useAi: false }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.issues.length).toBeGreaterThan(0);
    expect(body.aiUsed).toBe(false);
    expect(calls).toBe(0);
  });

  it('rejects empty, over-long and wrongly shaped input', async () => {
    const id = await newSession();
    expect((await h.handleSubmit(db, id, req({ text: '   ', useAi: false }))).status).toBe(400);
    expect((await h.handleSubmit(db, id, req({ text: 'x'.repeat(5001), useAi: false }))).status).toBe(400);
    expect((await h.handleSubmit(db, id, req({ text: 5, useAi: false }))).status).toBe(400);
    expect((await h.handleSubmit(db, id, req({ useAi: false }))).status).toBe(400);
    expect((await h.handleSubmit(db, id, req({ text: 'a'.repeat(25_000) }))).status).toBe(413);
  });

  it('returns 404 for an unknown session', async () => {
    expect((await h.handleSubmit(db, 999, req({ text: 'Hello there.', useAi: false }))).status).toBe(404);
  });
});

describe('feedback items and model version', () => {
  it('patches the hint level and resolved flag', async () => {
    const id = await newSession();
    const body = await json(await h.handleSubmit(db, id, req({ text: 'It was very good.', useAi: false })));
    const fid = body.issues[0].id;
    expect((await h.handleFeedbackPatch(db, fid, req({ hintLevel: 3 }, 'PATCH'))).status).toBe(200);
    expect((await h.handleFeedbackPatch(db, fid, req({ resolved: true }, 'PATCH'))).status).toBe(200);
    expect((await h.handleFeedbackPatch(db, fid, req({ hintLevel: 9 }, 'PATCH'))).status).toBe(400);
    expect((await h.handleFeedbackPatch(db, 99999, req({ hintLevel: 2 }, 'PATCH'))).status).toBe(404);
    expect((await h.handleFeedbackPatch(db, fid, req({}, 'PATCH'))).status).toBe(400);
  });

  it('refuses a model version on the first revision (409)', async () => {
    const id = await newSession();
    const body = await json(await h.handleSubmit(db, id, req({ text: 'It was very good.', useAi: false })));
    const res = await h.handleModelVersion(db, id, body.revisionId);
    expect(res.status).toBe(409);
    expect(calls).toBe(0);
  });
});

describe('vocabulary', () => {
  it('returns groups for a word and rejects a missing word', async () => {
    const res = await h.handleVocabulary(db, req({ word: 'sad' }));
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ ok: true, word: 'sad' });
    expect((await h.handleVocabulary(db, req({}))).status).toBe(400);
    expect((await h.handleVocabulary(db, req({ word: 5 }))).status).toBe(400);
  });
});
