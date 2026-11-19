import { describe, it, expect } from 'vitest';
import { parseQuery } from '@/lib/search/parse';

describe('parseQuery', () => {
  it('splits "without saying X" into terms and an exclusion', () => {
    const q = parseQuery('ways to express disappointment without saying disappointed');
    expect(q.terms).toEqual(['disappointment']);
    expect(q.exclude).toEqual(['disappointed']);
    expect(q.empty).toBe(false);
  });

  it('understands "instead of X" and "other than X" as exclusions', () => {
    expect(parseQuery('words for angry instead of mad').exclude).toEqual(['mad']);
    expect(parseQuery('show happiness other than smiled').exclude).toEqual(['smiled']);
  });

  it('parses "opposite of X" as an antonym relation', () => {
    const q = parseQuery('opposite of furious');
    expect(q.relation).toEqual({ type: 'antonym', target: 'furious' });
    expect(q.empty).toBe(false);
  });

  it('parses "stronger than X" and "weaker than X"', () => {
    expect(parseQuery('stronger than annoyed').relation).toEqual({ type: 'stronger', target: 'annoyed' });
    expect(parseQuery('weaker than furious').relation).toEqual({ type: 'weaker', target: 'furious' });
  });

  it('parses "another word for X" as a synonym relation', () => {
    expect(parseQuery('another word for sad').relation).toEqual({ type: 'synonym', target: 'sad' });
  });

  it('marks empty and whitespace-only queries as empty', () => {
    expect(parseQuery('').empty).toBe(true);
    expect(parseQuery('    ').empty).toBe(true);
    expect(parseQuery('ways to the of').empty).toBe(true);
  });

  it('strips FTS special characters from terms', () => {
    const q = parseQuery('"unbalanced * - : ( a*b --- NEAR(');
    for (const t of q.terms) {
      expect(t).toMatch(/^[a-z0-9'-]+$/);
      expect(t.startsWith('-')).toBe(false);
      expect(t.endsWith('-')).toBe(false);
    }
    expect(q.terms).toContain('unbalanced');
  });

  it('keeps hyphenated words and apostrophes', () => {
    expect(parseQuery('self-assured').terms).toEqual(['self-assured']);
    expect(parseQuery('couldn’t agree').terms).toContain("couldn't");
  });

  it('truncates a 2000 character query to 500', () => {
    const q = parseQuery('a'.repeat(2000));
    expect(q.raw.length).toBeLessThanOrEqual(500);
    expect(q.terms.every((t) => t.length <= 500)).toBe(true);
  });
});
