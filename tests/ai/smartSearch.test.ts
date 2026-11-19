import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { setMockResponder } from '@/lib/ai/client';
import { translateQuery } from '@/lib/ai/smartSearch';
import { parseQuery } from '@/lib/search/parse';

let db: Db;
beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  vi.stubEnv('ANTHROPIC_API_KEY', '');
  vi.stubEnv('WORDCRAFT_AI_MOCK', '');
  setMockResponder(null);
});
afterEach(() => {
  vi.unstubAllEnvs();
  setMockResponder(null);
});

const reply = (obj: unknown) => async () => ({ text: JSON.stringify(obj), inputTokens: 50, outputTokens: 30 });

describe('translateQuery', () => {
  it('falls back to rule-based parsing when no key is set', async () => {
    const q = 'ways to say sad without saying sad';
    await expect(translateQuery(db, q)).resolves.toEqual(parseQuery(q));
  });

  it('falls back when the model call throws', async () => {
    vi.stubEnv('WORDCRAFT_AI_MOCK', '1');
    setMockResponder(async () => { throw new Error('boom'); });
    const q = 'something about walking';
    await expect(translateQuery(db, q)).resolves.toEqual(parseQuery(q));
  });

  it('falls back when the model returns the wrong shape', async () => {
    vi.stubEnv('WORDCRAFT_AI_MOCK', '1');
    setMockResponder(reply({ nope: true }));
    const q = 'how do I describe a tired walk';
    await expect(translateQuery(db, q)).resolves.toEqual(parseQuery(q));
  });

  it('returns the translated query, cleaned like any other input', async () => {
    vi.stubEnv('WORDCRAFT_AI_MOCK', '1');
    setMockResponder(reply({ terms: ['Weary*', '"slow"', 'walk'], exclude: ['tired'], relation: null }));
    const q = await translateQuery(db, 'my character is shattered and drags her feet');
    expect(q.terms).toEqual(['weary', 'slow', 'walk']);
    expect(q.exclude).toEqual(['tired']);
    expect(q.empty).toBe(false);
  });

  it('keeps a valid relation from the model', async () => {
    vi.stubEnv('WORDCRAFT_AI_MOCK', '1');
    setMockResponder(reply({ terms: [], exclude: [], relation: { type: 'antonym', target: 'furious' } }));
    const q = await translateQuery(db, 'what is the calm version of that word');
    expect(q.relation).toEqual({ type: 'antonym', target: 'furious' });
    expect(q.empty).toBe(false);
  });

  it('returns the second identical call from cache', async () => {
    vi.stubEnv('WORDCRAFT_AI_MOCK', '1');
    const responder = vi.fn(reply({ terms: ['grief'], exclude: [], relation: null }));
    setMockResponder(responder);
    await translateQuery(db, 'A way to show grief');
    const again = await translateQuery(db, '  a way to SHOW grief ');
    expect(again.terms).toEqual(['grief']);
    expect(responder).toHaveBeenCalledTimes(1);
  });

  it('does not call the model for an empty query', async () => {
    vi.stubEnv('WORDCRAFT_AI_MOCK', '1');
    const responder = vi.fn(reply({ terms: ['x'], exclude: [], relation: null }));
    setMockResponder(responder);
    const q = await translateQuery(db, '   ');
    expect(q.empty).toBe(true);
    expect(responder).not.toHaveBeenCalled();
  });
});
