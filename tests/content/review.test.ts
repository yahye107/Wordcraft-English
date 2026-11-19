import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { getReviewQueue, getNotes, nextItem, recordVerdict, type ReviewItem } from '@/lib/content/review';
import { contrastYaml, library, yamlEntry } from './review-helpers';

const base = () => ({
  'expressions/sadness/draftone.yaml': yamlEntry({ slug: 'draftone', status: 'draft' }),
  'expressions/sadness/draftwo.yaml': yamlEntry({ slug: 'draftwo', status: 'draft' }),
  'expressions/sadness/live.yaml': yamlEntry({ slug: 'live', status: 'published' }),
  'contrasts/pair.yaml': contrastYaml('pair', ['live', 'draftone']),
});

const stateOf = (items: ReviewItem[], slug: string) => items.find((i) => i.slug === slug)?.state;
const verdict = (lib: ReturnType<typeof library>, slug: string, v: 'approved' | 'needs-work', note = '', kind = 'expression') =>
  recordVerdict(lib.db, lib.dir, { kind, slug, verdict: v, note });

describe('getReviewQueue', () => {
  it('lists drafts first, then published items not yet reviewed', () => {
    const lib = library(base());
    const q = getReviewQueue(lib.db, lib.dir);
    expect(q.items.map((i) => `${i.kind}:${i.slug}:${i.state}`)).toEqual([
      'expression:draftone:draft',
      'expression:draftwo:draft',
      'expression:live:unreviewed',
      'contrast:pair:unreviewed',
    ]);
    expect(q.counts).toEqual({ draft: 2, unreviewed: 2, needsWork: 0, changed: 0, approved: 0 });
    expect(q.problems).toEqual([]);
  });

  it('shows titles, areas, levels and status from the database', () => {
    const lib = library(base());
    const item = getReviewQueue(lib.db, lib.dir).items.find((i) => i.slug === 'draftone')!;
    expect(item).toMatchObject({ kind: 'expression', title: 'draftone', area: 'Sadness', status: 'draft', level: 'intermediate', note: '' });
    expect(getReviewQueue(lib.db, lib.dir).items.find((i) => i.kind === 'contrast')).toMatchObject({ title: 'A pair', status: null });
  });

  it('applies each verdict and the order: draft, changed, needs work, unreviewed, approved', () => {
    const lib = library(base());
    verdict(lib, 'live', 'approved');
    verdict(lib, 'draftone', 'needs-work', 'second example is odd');
    fs.appendFileSync(lib.file('expressions/sadness/live.yaml'), '# edited later\n');
    verdict(lib, 'pair', 'approved', '', 'contrast');
    const q = getReviewQueue(lib.db, lib.dir);
    expect(stateOf(q.items, 'draftone')).toBe('needs-work');
    expect(stateOf(q.items, 'draftwo')).toBe('draft');
    expect(stateOf(q.items, 'live')).toBe('changed');
    expect(stateOf(q.items, 'pair')).toBe('approved');
    expect(q.items.map((i) => i.state)).toEqual(['draft', 'changed', 'needs-work', 'approved']);
    expect(q.counts).toEqual({ draft: 1, unreviewed: 0, needsWork: 1, changed: 1, approved: 1 });
    expect(q.items.find((i) => i.slug === 'draftone')?.note).toBe('second example is odd');
  });

  it('puts a changed item back in the queue and an edit-free status flip leaves a verdict alone', () => {
    const lib = library(base());
    verdict(lib, 'live', 'approved');
    const f = lib.file('expressions/sadness/live.yaml');
    fs.writeFileSync(f, lib.read('expressions/sadness/live.yaml').replace('status: published', 'status: draft'));
    expect(stateOf(getReviewQueue(lib.db, lib.dir).items, 'live')).toBe('approved');
    fs.writeFileSync(f, lib.read('expressions/sadness/live.yaml').replace('A plain meaning.', 'A different meaning.'));
    expect(stateOf(getReviewQueue(lib.db, lib.dir).items, 'live')).toBe('changed');
  });

  it('drops a deleted file and keeps same-named items of different kinds apart', () => {
    const lib = library({ ...base(), 'contrasts/live.yaml': contrastYaml('live', ['live', 'draftone']) });
    verdict(lib, 'live', 'approved', '', 'contrast');
    expect(stateOf(getReviewQueue(lib.db, lib.dir).items.filter((i) => i.kind === 'expression'), 'live')).toBe('unreviewed');
    fs.rmSync(lib.file('expressions/sadness/draftwo.yaml'));
    expect(getReviewQueue(lib.db, lib.dir).items.find((i) => i.slug === 'draftwo')).toBeUndefined();
  });

  it('reports a malformed file as a problem and still loads the rest', () => {
    const lib = library(base());
    fs.writeFileSync(lib.file('expressions/sadness/bad.yaml'), 'slug: [broken\n  - : :\n');
    const q = getReviewQueue(lib.db, lib.dir);
    expect(q.problems.map((p) => p.file)).toEqual(['expressions/sadness/bad.yaml']);
    expect(q.items).toHaveLength(4);
  });

  it('uses the slug as the title for a file that has not been seeded yet', () => {
    const lib = library(base());
    fs.writeFileSync(lib.file('expressions/sadness/fresh.yaml'), yamlEntry({ slug: 'fresh', status: 'draft' }));
    expect(getReviewQueue(lib.db, lib.dir).items.find((i) => i.slug === 'fresh')).toMatchObject({ title: 'fresh', area: null, state: 'draft' });
  });

  it('is empty for an empty or missing folder', () => {
    const lib = library({});
    expect(getReviewQueue(lib.db, lib.dir)).toEqual({ items: [], counts: { draft: 0, unreviewed: 0, needsWork: 0, changed: 0, approved: 0 }, problems: [] });
    expect(getReviewQueue(lib.db, `${lib.dir}-missing`).items).toEqual([]);
  });
});

describe('recordVerdict', () => {
  it('saves a verdict with the current fingerprint and a second verdict replaces the first', () => {
    const lib = library(base());
    expect(verdict(lib, 'live', 'needs-work', 'too vague')).toEqual({ ok: true });
    expect(verdict(lib, 'live', 'approved')).toEqual({ ok: true });
    const rows = lib.db.all<{ verdict: string; note: string }>("SELECT verdict, note FROM content_reviews WHERE slug = 'live'");
    expect(rows).toEqual([{ verdict: 'approved', note: '' }]);
  });

  it('rejects bad input without storing anything', () => {
    const lib = library(base());
    const bad = [
      { kind: 'poem', slug: 'live', verdict: 'approved' },
      { kind: 'expression', slug: 'missing', verdict: 'approved' },
      { kind: 'expression', slug: 'live', verdict: 'maybe' },
      { kind: 'expression', slug: 'live', verdict: 'needs-work' },
      { kind: 'expression', slug: 'live', verdict: 'needs-work', note: '   ' },
      { kind: 'expression', slug: 'live', verdict: 'needs-work', note: 'x'.repeat(1001) },
      { kind: 'expression', slug: '../live', verdict: 'approved' },
      { kind: 5, slug: 5, verdict: 5 },
    ];
    for (const input of bad) expect(recordVerdict(lib.db, lib.dir, input).ok, JSON.stringify(input).slice(0, 50)).toBe(false);
    expect(lib.db.get<{ n: number }>('SELECT COUNT(*) n FROM content_reviews')!.n).toBe(0);
  });

  it('answers 404 for an unknown item and 400 for a bad shape', () => {
    const lib = library(base());
    expect(recordVerdict(lib.db, lib.dir, { kind: 'expression', slug: 'missing', verdict: 'approved' })).toMatchObject({ ok: false, status: 404 });
    expect(recordVerdict(lib.db, lib.dir, { kind: 'expression', slug: 'live', verdict: 'maybe' })).toMatchObject({ ok: false, status: 400 });
  });

  it('accepts a note of exactly 1,000 characters', () => {
    const lib = library(base());
    expect(verdict(lib, 'live', 'needs-work', 'x'.repeat(1000))).toEqual({ ok: true });
  });
});

describe('nextItem', () => {
  const items = ['a', 'b', 'c', 'd'].map((slug, i) => ({ kind: 'expression', slug, title: slug, area: null, status: 'draft', state: i === 1 ? 'approved' : 'draft', note: '', level: null }) as ReviewItem);

  it('returns the item after the current one, skipping finished items when asked', () => {
    expect(nextItem(items, { kind: 'expression', slug: 'a' }, false)?.slug).toBe('b');
    expect(nextItem(items, { kind: 'expression', slug: 'a' }, true)?.slug).toBe('c');
  });

  it('returns undefined at the end or for an item that is not in the list', () => {
    expect(nextItem(items, { kind: 'expression', slug: 'd' }, false)).toBeUndefined();
    expect(nextItem(items, { kind: 'expression', slug: 'zzz' }, false)).toBeUndefined();
  });
});

describe('getNotes', () => {
  it('lists needs-work and changed items with their file and note', () => {
    const lib = library(base());
    verdict(lib, 'draftone', 'needs-work', 'rewrite example 2');
    verdict(lib, 'live', 'needs-work', 'meaning too long');
    fs.appendFileSync(lib.file('expressions/sadness/live.yaml'), '# edit\n');
    verdict(lib, 'draftwo', 'approved');
    const notes = getNotes(lib.db, lib.dir);
    expect(notes.map((n) => [n.kind, n.slug, n.file, n.state, n.note])).toEqual(
      expect.arrayContaining([
        ['expression', 'draftone', 'expressions/sadness/draftone.yaml', 'needs-work', 'rewrite example 2'],
        ['expression', 'live', 'expressions/sadness/live.yaml', 'changed', 'meaning too long'],
      ]),
    );
    expect(notes.find((n) => n.slug === 'draftwo')).toBeUndefined();
  });
});
