import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { loadContent } from '@/lib/content/load';
import { seedContent } from '@/lib/content/seed';
import { handleCheck } from '@/lib/lessons/handleCheck';
import { makeContentDir, CATEGORIES_YAML, expressionYaml } from '../content/helpers';
import { lessonYaml, exerciseYaml } from '../content/lesson-helpers';

function seeded(): Db {
  const { bundle, errors } = loadContent(
    makeContentDir({
      'categories.yaml': CATEGORIES_YAML,
      'expressions/sadness/crestfallen.yaml': expressionYaml(),
      'lessons/dialogue/what-tags-do.yaml': lessonYaml(),
      'exercises/dialogue/ex-choose.yaml': exerciseYaml('choose'),
    }),
  );
  expect(errors).toEqual([]);
  const db = openDb(':memory:');
  migrate(db);
  seedContent(db, bundle);
  return db;
}

const post = (body: string) =>
  new Request('http://localhost/api/exercises/ex-choose/check', { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });

describe('handleCheck', () => {
  it('returns 200 with correct true for a valid choose answer', async () => {
    const res = await handleCheck(seeded(), 'ex-choose', post(JSON.stringify({ answer: { choice: 0 } })));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, correct: true });
  });

  it('returns 400 when the body is not JSON', async () => {
    const res = await handleCheck(seeded(), 'ex-choose', post('not json {'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when the answer is missing', async () => {
    const res = await handleCheck(seeded(), 'ex-choose', post(JSON.stringify({ nothing: 1 })));
    expect(res.status).toBe(400);
  });

  it('returns 400 for an answer of the wrong shape and stores nothing', async () => {
    const db = seeded();
    const res = await handleCheck(db, 'ex-choose', post(JSON.stringify({ answer: 'zero' })));
    expect(res.status).toBe(400);
    expect(db.get<{ n: number }>('SELECT COUNT(*) n FROM exercise_attempts')!.n).toBe(0);
  });

  it('returns 404 for an unknown exercise', async () => {
    const res = await handleCheck(seeded(), 'ghost', post(JSON.stringify({ answer: { choice: 0 } })));
    expect(res.status).toBe(404);
  });

  it('returns 413 for an oversized body', async () => {
    const res = await handleCheck(seeded(), 'ex-choose', post(JSON.stringify({ answer: { text: 'x'.repeat(20_000) } })));
    expect(res.status).toBe(413);
  });
});
