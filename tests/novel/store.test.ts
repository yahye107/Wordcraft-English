import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { checkExcerpt, NOVEL_LIMITS } from '@/lib/novel/limits';
import { saveAnalysis, findByExcerpt, getAnalysis, listAnalyses, updateAiLayer, deleteAnalysis } from '@/lib/novel/store';
import type { AnalysisResult } from '@/lib/novel/types';

function setup(): Db {
  const db = openDb(':memory:');
  migrate(db);
  return db;
}

const result = (markup = 'x'): AnalysisResult => ({
  local: {
    markup,
    sentences: [],
    stats: { sentences: 0, averageWords: 0, longest: 0, shortest: 0 },
    vocabulary: [],
    unfamiliar: [],
    techniques: [],
  },
  ai: null,
});

describe('checkExcerpt', () => {
  it('accepts a normal passage and counts words', () => {
    const r = checkExcerpt('  The rain fell on the quiet street.  ');
    expect(r).toEqual({ ok: true, text: 'The rain fell on the quiet street.', words: 7 });
  });

  it('rejects empty, whitespace-only, too long and non-strings', () => {
    for (const bad of ['', '   \n  ', 'x'.repeat(801), Array(121).fill('a').join(' '), 5, null, undefined, {}]) {
      expect(checkExcerpt(bad).ok, String(bad).slice(0, 20)).toBe(false);
    }
  });

  it('accepts exactly 800 characters and exactly 120 words', () => {
    expect(checkExcerpt('x'.repeat(NOVEL_LIMITS.chars)).ok).toBe(true);
    expect(checkExcerpt(Array(120).fill('a').join(' ')).ok).toBe(true);
  });

  it('normalises CRLF and runs of blank lines', () => {
    const r = checkExcerpt('One.\r\n\r\n\r\n\r\nTwo.');
    expect(r.ok && r.text).toBe('One.\n\nTwo.');
  });
});

describe('store', () => {
  it('stores and returns an id', () => {
    const db = setup();
    const r = saveAnalysis(db, { excerpt: 'The rain fell.', result: result(), aiUsed: false, aiNote: 'Local only.' });
    expect(r).toMatchObject({ ok: true, existing: false });
    if (r.ok) {
      const a = getAnalysis(db, r.id)!;
      expect(a.excerpt).toBe('The rain fell.');
      expect(a.aiUsed).toBe(false);
      expect(a.aiNote).toBe('Local only.');
      expect(a.sourceTitle).toBeNull();
    }
  });

  it('returns the existing analysis for the same excerpt', () => {
    const db = setup();
    const a = saveAnalysis(db, { excerpt: 'The rain fell.', result: result(), aiUsed: false, aiNote: null });
    const b = saveAnalysis(db, { excerpt: 'The rain fell.', result: result(), aiUsed: false, aiNote: null });
    if (!a.ok || !b.ok) throw new Error('x');
    expect(b.existing).toBe(true);
    expect(b.id).toBe(a.id);
    expect(db.get<{ n: number }>('SELECT COUNT(*) n FROM novel_analyses')!.n).toBe(1);
    expect(findByExcerpt(db, 'The rain fell.')!.id).toBe(a.id);
    expect(findByExcerpt(db, 'Other.')).toBeUndefined();
  });

  it('updateAiLayer changes the same row', () => {
    const db = setup();
    const a = saveAnalysis(db, { excerpt: 'The rain fell.', result: result(), aiUsed: false, aiNote: null });
    if (!a.ok) throw new Error('x');
    const r = updateAiLayer(db, a.id, result('y'), true, null);
    expect(r.ok).toBe(true);
    const got = getAnalysis(db, a.id)!;
    expect(got.aiUsed).toBe(true);
    expect(got.result.local.markup).toBe('y');
    expect(updateAiLayer(db, 999, result(), true, null).ok).toBe(false);
  });

  it('deleteAnalysis removes the row once', () => {
    const db = setup();
    const a = saveAnalysis(db, { excerpt: 'The rain fell.', sourceTitle: 'Book', result: result(), aiUsed: false, aiNote: null });
    if (!a.ok) throw new Error('x');
    expect(deleteAnalysis(db, a.id).ok).toBe(true);
    expect(getAnalysis(db, a.id)).toBeUndefined();
    expect(deleteAnalysis(db, a.id).ok).toBe(false);
  });

  it('lists newest first with a preview', () => {
    const db = setup();
    saveAnalysis(db, { excerpt: 'First passage. ' + 'a'.repeat(120), result: result(), aiUsed: false, aiNote: null });
    saveAnalysis(db, { excerpt: 'Second passage.', sourceTitle: 'My book', result: result(), aiUsed: true, aiNote: null });
    const list = listAnalyses(db);
    expect(list.map((x) => x.excerptPreview.slice(0, 6))).toEqual(['Second', 'First ']);
    expect(list[1].excerptPreview.length).toBeLessThanOrEqual(81);
    expect(list[0]).toMatchObject({ sourceTitle: 'My book', aiUsed: true });
  });

  it('refuses the 201st analysis', () => {
    const db = setup();
    for (let i = 0; i < NOVEL_LIMITS.stored; i++) {
      expect(saveAnalysis(db, { excerpt: `Passage number ${i}.`, result: result(), aiUsed: false, aiNote: null }).ok).toBe(true);
    }
    const r = saveAnalysis(db, { excerpt: 'One too many.', result: result(), aiUsed: false, aiNote: null });
    expect(r.ok).toBe(false);
  });

  it('rejects a title over 100 characters', () => {
    const db = setup();
    const r = saveAnalysis(db, { excerpt: 'Hi there.', sourceTitle: 'x'.repeat(101), result: result(), aiUsed: false, aiNote: null });
    expect(r.ok).toBe(false);
  });

  it('returns plain objects', () => {
    const db = setup();
    const a = saveAnalysis(db, { excerpt: 'The rain fell.', result: result(), aiUsed: false, aiNote: null });
    if (!a.ok) throw new Error('x');
    for (const o of [getAnalysis(db, a.id)!, listAnalyses(db)[0]]) {
      expect(Object.getPrototypeOf(o)).toBe(Object.prototype);
    }
  });
});
