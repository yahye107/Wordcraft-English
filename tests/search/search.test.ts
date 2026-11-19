import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { loadContent } from '@/lib/content/load';
import { seedContent } from '@/lib/content/seed';
import { parseQuery } from '@/lib/search/parse';
import { searchExpressions } from '@/lib/search/search';
import { makeContentDir, CATEGORIES_YAML, expressionYaml } from '../content/helpers';

const x = (slug: string, over: Record<string, unknown> = {}) =>
  expressionYaml({
    slug, text: slug, tags: [], searchPhrases: [], relations: [], mistakes: [],
    simpleMeaning: `Meaning of ${slug}.`, ...over,
  });

function seeded(): Db {
  const dir = makeContentDir({
    'categories.yaml': CATEGORIES_YAML,
    'expressions/s/crestfallen.yaml': x('crestfallen', {
      simpleMeaning: 'Sad and disappointed after a hope fails.',
      searchPhrases: ['let down', 'face fell'],
      tags: ['emotion:disappointment'],
      relations: [{ to: 'deflated', type: 'synonym' }],
    }),
    'expressions/s/deflated.yaml': x('deflated', {
      searchPhrases: ['lost his spark'],
      tags: ['emotion:disappointment'],
    }),
    'expressions/s/disappointed.yaml': x('disappointed', { tags: ['emotion:disappointment'] }),
    'expressions/s/disappointing.yaml': x('disappointing', { tags: ['emotion:disappointment'] }),
    'expressions/s/furious.yaml': x('furious', { tags: ['emotion:anger'], relations: [{ to: 'serene', type: 'antonym' }] }),
    'expressions/s/serene.yaml': x('serene', { simpleMeaning: 'At peace.', tags: ['emotion:calm'] }),
    'expressions/s/annoyed.yaml': x('annoyed', { relations: [{ to: 'exasperated', type: 'stronger' }] }),
    'expressions/s/exasperated.yaml': x('exasperated', { relations: [{ to: 'annoyed', type: 'weaker' }] }),
    'expressions/s/whispered.yaml': x('whispered', { searchPhrases: ['spoke quietly'] }),
    'expressions/s/ghostly.yaml': x('ghostly', { status: 'draft', examples: [], tags: ['emotion:disappointment'] }),
    'contrasts/pair.yaml': JSON.stringify({
      slug: 'pair', title: 'Pair', explanation: 'x',
      members: [
        { expression: 'crestfallen', note: 'a', example: 'b' },
        { expression: 'deflated', note: 'c', example: 'd' },
      ],
    }),
  });
  const { bundle, errors } = loadContent(dir);
  expect(errors).toEqual([]);
  const db = openDb(':memory:');
  migrate(db);
  seedContent(db, bundle);
  return db;
}

const run = (db: Db, q: string) => searchExpressions(db, parseQuery(q));
const slugs = (r: { slug: string }[]) => r.map((x) => x.slug);

describe('searchExpressions', () => {
  it('finds crestfallen for the disappointment query and excludes disappointed forms', () => {
    const r = run(seeded(), 'ways to express disappointment without saying disappointed');
    expect(slugs(r)).toContain('crestfallen');
    expect(slugs(r)).toContain('deflated');
    expect(slugs(r)).not.toContain('disappointed');
    expect(slugs(r)).not.toContain('disappointing');
  });

  it('matches via a search phrase', () => {
    const r = run(seeded(), 'let down');
    const hit = r.find((x) => x.slug === 'crestfallen');
    expect(hit?.matchedVia).toBe('phrase');
  });

  it('matches via a tag when the word is not in the text or meaning', () => {
    const r = run(seeded(), 'calm');
    expect(r.find((x) => x.slug === 'serene')?.matchedVia).toBe('tag');
  });

  it('returns antonyms for "opposite of furious"', () => {
    const r = run(seeded(), 'opposite of furious');
    expect(slugs(r)).toContain('serene');
    expect(slugs(r)).not.toContain('furious');
  });

  it('returns stronger words for "stronger than annoyed"', () => {
    const r = run(seeded(), 'stronger than annoyed');
    expect(slugs(r)).toEqual(['exasperated']);
  });

  it('never throws on odd input', () => {
    const db = seeded();
    for (const q of ['"unbalanced', 'a*b', '---', '(', ':', 'NEAR(', 'OR', 'AND', "' OR 1=1 --", '"', '*']) {
      expect(() => run(db, q)).not.toThrow();
    }
  });

  it('returns an empty array when nothing matches', () => {
    expect(run(seeded(), 'xylophone')).toEqual([]);
  });

  it('returns an empty array for an empty query', () => {
    expect(run(seeded(), '   ')).toEqual([]);
  });

  it('never returns drafts', () => {
    const r = run(seeded(), 'disappointment');
    expect(slugs(r)).not.toContain('ghostly');
  });

  it('gives results from one contrast group the same contrastGroupSlug', () => {
    const r = run(seeded(), 'disappointment without saying disappointed');
    const a = r.find((x) => x.slug === 'crestfallen')!;
    const b = r.find((x) => x.slug === 'deflated')!;
    expect(a.contrastGroupSlug).toBe('pair');
    expect(b.contrastGroupSlug).toBe('pair');
  });

  it('finds expressions through their category and parent category names', () => {
    const r = run(seeded(), 'sadness');
    expect(slugs(r)).toContain('crestfallen');
  });

  it('matches word beginnings, so "quiet" finds a phrase "spoke quietly"', () => {
    const r = run(seeded(), 'quiet');
    expect(slugs(r)).toContain('whispered');
  });

  it('puts an exact word match first', () => {
    const r = run(seeded(), 'furious');
    expect(r[0].slug).toBe('furious');
  });

  it('ignores generic filler words such as "person" and "who"', () => {
    const q = parseQuery('a person who is furious');
    expect(q.terms).toEqual(['furious']);
  });

  it('respects the limit option', () => {
    const r = searchExpressions(seeded(), parseQuery('disappointment'), { limit: 1 });
    expect(r).toHaveLength(1);
  });
});
