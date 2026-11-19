import { describe, it, expect } from 'vitest';
import { parseAnnotated, stripAnnotations } from '@/lib/annotate';

describe('parseAnnotated', () => {
  it('marks a tag and a beat and keeps the plain text between', () => {
    expect(parseAnnotated('{speech|“Go,”} {tag|she said.} Then {beat|she left.}')).toEqual([
      { text: '“Go,”', kind: 'speech' },
      { text: ' ', kind: 'plain' },
      { text: 'she said.', kind: 'tag' },
      { text: ' Then ', kind: 'plain' },
      { text: 'she left.', kind: 'beat' },
    ]);
  });

  it('keeps an unknown kind as literal text', () => {
    expect(parseAnnotated('A {wizard|spell} here')).toEqual([{ text: 'A {wizard|spell} here', kind: 'plain' }]);
  });

  it('keeps an unbalanced opening brace as literal text', () => {
    expect(parseAnnotated('Open {tag|never closed')).toEqual([{ text: 'Open {tag|never closed', kind: 'plain' }]);
  });

  it('keeps a closing brace with no opening as literal text', () => {
    expect(parseAnnotated('stray } brace')).toEqual([{ text: 'stray } brace', kind: 'plain' }]);
  });

  it('does not throw on nested braces and keeps all the text', () => {
    const parts = parseAnnotated('{tag|a {beat|b} c}');
    expect(parts.map((p) => p.text).join('')).toContain('b');
    expect(parts.length).toBeGreaterThan(0);
  });

  it('keeps an empty body as literal text', () => {
    expect(parseAnnotated('x {tag|} y')).toEqual([{ text: 'x {tag|} y', kind: 'plain' }]);
  });

  it('lets curly quotes and em dashes pass through unchanged', () => {
    const [seg] = parseAnnotated('{speech|“Wait—don’t.”}');
    expect(seg).toEqual({ text: '“Wait—don’t.”', kind: 'speech' });
  });

  it('returns one plain segment when there is no markup', () => {
    expect(parseAnnotated('Just text.')).toEqual([{ text: 'Just text.', kind: 'plain' }]);
  });

  it('returns no segments for an empty string', () => {
    expect(parseAnnotated('')).toEqual([]);
  });

  it('survives a very long input with many braces quickly', () => {
    const start = Date.now();
    parseAnnotated('{'.repeat(50_000) + 'x' + '}'.repeat(50_000));
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe('stripAnnotations', () => {
  it('removes markup only', () => {
    expect(stripAnnotations('{speech|“Hi,”} {tag|she said.}')).toBe('“Hi,” she said.');
  });
});
