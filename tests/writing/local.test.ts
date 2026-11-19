import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { loadContent } from '@/lib/content/load';
import { seedContent } from '@/lib/content/seed';
import { analyseLocal } from '@/lib/writing/local';
import { findAlternatives } from '@/lib/writing/vocab';
import { makeContentDir, CATEGORIES_YAML, expressionYaml } from '../content/helpers';

const word = (slug: string, over: Record<string, unknown> = {}) =>
  expressionYaml({ slug, text: slug, tags: [], searchPhrases: [], relations: [], mistakes: [], simpleMeaning: `Meaning of ${slug}.`, ...over });

function setup(): Db {
  const { bundle, errors } = loadContent(
    makeContentDir({
      'categories.yaml': CATEGORIES_YAML,
      'expressions/s/heartbroken.yaml': word('heartbroken', { simpleMeaning: 'Extremely sad after a loss.', searchPhrases: ['very sad'], intensity: 5 }),
      'expressions/s/crestfallen.yaml': word('crestfallen', { simpleMeaning: 'Sad and disappointed after a hope fails.', searchPhrases: ['very sad'], intensity: 3 }),
      'expressions/s/despondent.yaml': word('despondent', { simpleMeaning: 'Very sad and without hope.', searchPhrases: ['very sad'], intensity: 4 }),
      'contrasts/sad-family.yaml': JSON.stringify({
        slug: 'sad-family', title: 'Heartbroken, crestfallen, despondent', explanation: 'Different kinds of sadness.',
        members: [
          { expression: 'heartbroken', note: 'deep personal loss', example: 'x' },
          { expression: 'crestfallen', note: 'a visible letdown', example: 'y' },
          { expression: 'despondent', note: 'hopeless', example: 'z' },
        ],
      }),
    }),
  );
  expect(errors).toEqual([]);
  const db = openDb(':memory:');
  migrate(db);
  seedContent(db, bundle);
  return db;
}

const db = setup();
const keys = (text: string) => analyseLocal(db, text).map((i) => i.key);

describe('analyseLocal', () => {
  it('flags "very sad" and offers a stronger word from the library', () => {
    const issues = analyseLocal(db, 'She felt very sad after the news.');
    const i = issues.find((x) => x.key === 'vocabulary:very')!;
    expect(i.quote).toBe('very sad');
    expect(i.category).toBe('vocabulary');
    expect(i.alternatives.length).toBeGreaterThan(0);
    expect(i.alternatives.length).toBeLessThanOrEqual(3);
    expect(i.alternatives[0].slug).toBeTruthy();
  });

  it('every quote is an exact substring of the text', () => {
    const text = 'It was a good day. The good thing was the food. the the end. Then we went. Then we left. Then we slept. Then we woke.';
    for (const i of analyseLocal(db, text)) expect(text.includes(i.quote)).toBe(true);
  });

  it('flags a repeated word within 30 words', () => {
    expect(keys('The garden was quiet and the garden smelled of rain after the storm had passed.')).toContain('naturalness:repeat:garden');
  });

  it('flags three sentences starting with the same word', () => {
    expect(keys('Then we ate. Then we sang. Then we left. After that we slept.')).toContain('structure:same-start:then');
  });

  it('flags a 45-word sentence', () => {
    const long = Array.from({ length: 45 }, (_, i) => `word${i}`).join(' ') + '.';
    expect(keys(long)).toContain('structure:long-sentence');
  });

  it('flags a lower-case sentence start', () => {
    expect(keys('It rained. we stayed inside.')).toContain('punctuation:capital');
  });

  it('flags a doubled word', () => {
    const i = analyseLocal(db, 'We went to the the market.').find((x) => x.key === 'grammar:doubled-word')!;
    expect(i.quote).toBe('the the');
  });

  it('flags sentences that are all the same length', () => {
    expect(keys('We ate lunch. We drank tea. We read books. We went home.')).toContain('structure:same-length');
  });

  it('returns at most 8 issues', () => {
    const text = 'very good. very bad. very nice. very big. really good. really bad. really nice. really big. a good thing. the the end.';
    expect(analyseLocal(db, text).length).toBeLessThanOrEqual(8);
  });

  it('is deterministic', () => {
    const text = 'It was very good and very nice. Then we ate. Then we left. Then we slept.';
    expect(analyseLocal(db, text)).toEqual(analyseLocal(db, text));
  });

  it('never crashes on empty, one-word, very long or non-Latin text', () => {
    for (const t of ['', 'Hello', 'x'.repeat(5000), 'a '.repeat(2500), 'مرحبا بالعالم. هذا اختبار.', '日本語のテキストです。', '😀 😀 😀', '{}[]<script>alert(1)</script>']) {
      expect(() => analyseLocal(db, t)).not.toThrow();
      expect(Array.isArray(analyseLocal(db, t))).toBe(true);
    }
  });

  it('keeps every hint under 240 characters and gives three of them', () => {
    for (const i of analyseLocal(db, 'It was very good. The thing was really nice. Then we left. Then we ran. Then we slept.')) {
      expect(i.hints).toHaveLength(3);
      for (const h of i.hints) expect(h.length).toBeLessThanOrEqual(240);
      expect(i.hints[2]).not.toMatch(/^"/);
    }
  });

  it('returns nothing for clean text', () => {
    expect(analyseLocal(db, 'The lighthouse keeper climbed slowly, counting each iron step as the wind pushed against the glass.')).toEqual([]);
  });
});

describe('findAlternatives', () => {
  it('groups near-synonyms by contrast group with their differences', () => {
    const r = findAlternatives(db, 'sad');
    expect(r.word).toBe('sad');
    expect(r.groups[0].title).toBe('Heartbroken, crestfallen, despondent');
    expect(r.groups[0].items.map((i) => i.slug).sort()).toEqual(['crestfallen', 'despondent', 'heartbroken']);
    expect(r.groups[0].items[0]).toHaveProperty('simpleMeaning');
  });

  it('returns empty groups for an unknown word without throwing', () => {
    const r = findAlternatives(db, 'xylophone');
    expect(r.groups).toEqual([]);
    expect(r.loose).toEqual([]);
  });

  it('handles empty and very long input', () => {
    expect(() => findAlternatives(db, '')).not.toThrow();
    expect(() => findAlternatives(db, 'x'.repeat(5000), 'y'.repeat(5000))).not.toThrow();
  });
});
