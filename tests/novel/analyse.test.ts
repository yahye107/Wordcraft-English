import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { setMockResponder } from '@/lib/ai/client';
import { analysePassage, addAiLayer } from '@/lib/novel/analyse';
import { getAnalysis } from '@/lib/novel/store';
import { NOVEL_LIMITS } from '@/lib/novel/limits';

let db: Db;
let calls = 0;
const GOOD_REPLY = {
  vocabulary: [{ quote: 'whispered', meaning: 'Spoke very quietly.' }],
  structure: 'Speech, then a tag.',
  grammar: [],
  dialogue: 'The tag shows how she spoke.',
  descriptive: null,
  emotion: null,
  whyNatural: 'The verb carries the manner.',
  technique: { name: 'A precise tag', how: 'Use one exact verb.' },
  example: { situation: 'A market.', text: 'The trader leaned over his crates and grumbled about the prices.' },
  tryIt: 'Write a line of speech with a precise tag.',
};
let reply: unknown = GOOD_REPLY;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  calls = 0;
  reply = GOOD_REPLY;
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('WORDCRAFT_AI_MOCK', '1');
  setMockResponder(async () => {
    calls++;
    return { text: JSON.stringify(reply), inputTokens: 10, outputTokens: 10 };
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  setMockResponder(null);
});

const PASSAGE = '“Come here,” she whispered. Mara slammed the door.';
const count = () => db.get<{ n: number }>('SELECT COUNT(*) n FROM novel_analyses')!.n;

describe('analysePassage', () => {
  it('stores the local layer only and never calls the AI when useAi is false', async () => {
    const r = await analysePassage(db, { excerpt: PASSAGE, useAi: false });
    if (!r.ok) throw new Error(r.error);
    expect(r).toMatchObject({ existing: false, aiUsed: false });
    expect(r.aiNote).toMatch(/Nothing was sent/);
    const a = getAnalysis(db, r.id)!;
    expect(a.result.ai).toBeNull();
    expect(a.result.local.markup).toContain('{speech|“Come here,”}');
    expect(calls).toBe(0);
  });

  it('with no key stores the local analysis and explains why', async () => {
    setMockResponder(null);
    const r = await analysePassage(db, { excerpt: PASSAGE, useAi: true });
    if (!r.ok) throw new Error(r.error);
    expect(r.aiUsed).toBe(false);
    expect(r.aiNote).toMatch(/ANTHROPIC_API_KEY/);
    expect(getAnalysis(db, r.id)!.result.local.sentences.length).toBeGreaterThan(0);
  });

  it('adds the tutor layer when it works', async () => {
    const r = await analysePassage(db, { excerpt: PASSAGE, sourceTitle: 'My book', useAi: true });
    if (!r.ok) throw new Error(r.error);
    expect(r).toMatchObject({ aiUsed: true, aiNote: null });
    const a = getAnalysis(db, r.id)!;
    expect(a.sourceTitle).toBe('My book');
    expect(a.result.ai?.example.text).toContain('trader');
    expect(calls).toBe(1);
  });

  it('returns the existing analysis for the same passage with no second AI call', async () => {
    const a = await analysePassage(db, { excerpt: PASSAGE, useAi: true });
    const b = await analysePassage(db, { excerpt: `  ${PASSAGE}\r\n`, useAi: true });
    if (!a.ok || !b.ok) throw new Error('x');
    expect(b).toMatchObject({ id: a.id, existing: true, aiUsed: true });
    expect(count()).toBe(1);
    expect(calls).toBe(1);
  });

  it('asking for the tutor on a stored local-only analysis updates the same row', async () => {
    const a = await analysePassage(db, { excerpt: PASSAGE, useAi: false });
    const b = await analysePassage(db, { excerpt: PASSAGE, useAi: true });
    if (!a.ok || !b.ok) throw new Error('x');
    expect(b).toMatchObject({ id: a.id, existing: true, aiUsed: true });
    expect(getAnalysis(db, a.id)!.result.ai).not.toBeNull();
    expect(count()).toBe(1);
  });

  it('an unusable tutor reply keeps the local analysis and says why', async () => {
    reply = { ...GOOD_REPLY, example: { situation: 'x', text: 'Come here, she whispered. Mara slammed the door.' } };
    const r = await analysePassage(db, { excerpt: PASSAGE, useAi: true });
    if (!r.ok) throw new Error(r.error);
    expect(r.aiUsed).toBe(false);
    expect(r.aiNote).toMatch(/copied the passage/);
    expect(getAnalysis(db, r.id)!.result.ai).toBeNull();
  });

  it('notes when some tutor notes were dropped', async () => {
    reply = { ...GOOD_REPLY, vocabulary: [{ quote: 'invented words', meaning: 'x' }] };
    const r = await analysePassage(db, { excerpt: PASSAGE, useAi: true });
    if (!r.ok) throw new Error(r.error);
    expect(r.aiUsed).toBe(true);
    expect(r.aiNote).toMatch(/left out/);
  });

  it('rejects invalid passages and stores nothing', async () => {
    for (const excerpt of ['', '   ', 'x'.repeat(801), Array(121).fill('a').join(' '), 5, null, undefined]) {
      const r = await analysePassage(db, { excerpt, useAi: true });
      expect(r.ok, String(excerpt).slice(0, 10)).toBe(false);
    }
    expect(count()).toBe(0);
    expect(calls).toBe(0);
  });

  it('rejects a title over 100 characters before calling the AI', async () => {
    const r = await analysePassage(db, { excerpt: PASSAGE, sourceTitle: 'x'.repeat(101), useAi: true });
    expect(r.ok).toBe(false);
    expect(calls).toBe(0);
    expect(count()).toBe(0);
  });

  it('refuses a new analysis at the stored limit without calling the AI', async () => {
    for (let i = 0; i < NOVEL_LIMITS.stored; i++) {
      db.run("INSERT INTO novel_analyses (excerpt, excerpt_hash, result_json) VALUES (?, ?, '{}')", [`p${i}`, `h${i}`]);
    }
    const r = await analysePassage(db, { excerpt: PASSAGE, useAi: true });
    expect(r.ok).toBe(false);
    expect(calls).toBe(0);
  });
});

describe('addAiLayer', () => {
  it('fails on an unknown id', async () => {
    const r = await addAiLayer(db, 999);
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.error).toMatch(/does not exist/);
  });

  it('adds the tutor layer to a local-only analysis', async () => {
    const a = await analysePassage(db, { excerpt: PASSAGE, useAi: false });
    if (!a.ok) throw new Error('x');
    const r = await addAiLayer(db, a.id);
    expect(r.ok).toBe(true);
    expect(getAnalysis(db, a.id)).toMatchObject({ aiUsed: true, aiNote: null });
    expect(calls).toBe(1);
    // A second call does nothing more.
    expect((await addAiLayer(db, a.id)).ok).toBe(true);
    expect(calls).toBe(1);
  });

  it('reports unavailable when there is no key and leaves the row alone', async () => {
    const a = await analysePassage(db, { excerpt: PASSAGE, useAi: false });
    if (!a.ok) throw new Error('x');
    setMockResponder(null);
    const r = await addAiLayer(db, a.id);
    expect(r).toMatchObject({ ok: false, unavailable: true });
    expect(getAnalysis(db, a.id)!.aiUsed).toBe(false);
  });
});
