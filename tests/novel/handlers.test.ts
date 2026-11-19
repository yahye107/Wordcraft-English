import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { setMockResponder } from '@/lib/ai/client';
import * as h from '@/lib/novel/handlers';

let db: Db;
beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('WORDCRAFT_AI_MOCK', '1');
  setMockResponder(async () => ({
    text: JSON.stringify({
      vocabulary: [],
      structure: 'x',
      grammar: [],
      dialogue: null,
      descriptive: null,
      emotion: null,
      whyNatural: 'x',
      technique: { name: 'n', how: 'h' },
      example: { situation: 's', text: 'The trader leaned over his crates.' },
      tryIt: 't',
    }),
    inputTokens: 1,
    outputTokens: 1,
  }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  setMockResponder(null);
});

const req = (body: unknown) =>
  new Request('http://localhost/api/x', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (r: Response) => (await r.json()) as Record<string, any>;

describe('POST analyses', () => {
  it('analyses a passage', async () => {
    const r = await h.handleAnalyse(db, req({ excerpt: 'The rain fell on the quiet street.', useAi: false }));
    expect(r.status).toBe(200);
    const b = await json(r);
    expect(b).toMatchObject({ ok: true, existing: false, aiUsed: false });
    expect(b.id).toBeGreaterThan(0);
  });

  it('rejects bad JSON, non-objects, a missing excerpt, over-long passages and big bodies', async () => {
    expect((await h.handleAnalyse(db, req('not json {'))).status).toBe(400);
    expect((await h.handleAnalyse(db, req('[1,2]'))).status).toBe(400);
    expect((await h.handleAnalyse(db, req({ useAi: false }))).status).toBe(400);
    expect((await h.handleAnalyse(db, req({ excerpt: 'x'.repeat(801) }))).status).toBe(400);
    expect((await h.handleAnalyse(db, req({ excerpt: 'x'.repeat(30_000) }))).status).toBe(413);
  });

  it('treats a missing useAi as local only', async () => {
    const b = await json(await h.handleAnalyse(db, req({ excerpt: 'The rain fell on the quiet street.' })));
    expect(b.aiUsed).toBe(false);
  });
});

describe('DELETE and add-ai', () => {
  it('deletes once, then 404', async () => {
    const { id } = await json(await h.handleAnalyse(db, req({ excerpt: 'The rain fell.', useAi: false })));
    expect((await h.handleDelete(db, id)).status).toBe(200);
    expect((await h.handleDelete(db, id)).status).toBe(404);
  });

  it('adds the tutor layer, 404 on unknown id, 503 when unavailable', async () => {
    const { id } = await json(await h.handleAnalyse(db, req({ excerpt: 'The rain fell.', useAi: false })));
    expect((await h.handleAddAi(db, 999)).status).toBe(404);
    const ok = await h.handleAddAi(db, id);
    expect(ok.status).toBe(200);
    expect((await json(ok)).aiUsed).toBe(true);

    const other = (await json(await h.handleAnalyse(db, req({ excerpt: 'Snow fell all night.', useAi: false })))).id;
    setMockResponder(null);
    const off = await h.handleAddAi(db, other);
    expect(off.status).toBe(503);
    expect((await json(off)).error).toMatch(/ANTHROPIC_API_KEY/);
  });
});
