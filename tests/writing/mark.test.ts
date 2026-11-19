import { describe, it, expect } from 'vitest';
import { markQuotes } from '@/lib/writing/mark';

const joined = (parts: { text: string }[]) => parts.map((p) => p.text).join('');

describe('markQuotes', () => {
  it('marks the first occurrence of each quote and keeps all the text', () => {
    const text = 'She felt very sad. It was a very good day.';
    const parts = markQuotes(text, ['very sad', 'very good']);
    expect(joined(parts)).toBe(text);
    expect(parts.filter((p) => p.marked).map((p) => p.text)).toEqual(['very sad', 'very good']);
  });

  it('skips a quote that is not in the text and an empty quote', () => {
    const parts = markQuotes('Hello there.', ['', 'nothing', 'there']);
    expect(parts.filter((p) => p.marked).map((p) => p.text)).toEqual(['there']);
  });

  it('does not mark overlapping quotes twice', () => {
    const parts = markQuotes('a very sad day', ['very sad', 'sad day']);
    expect(joined(parts)).toBe('a very sad day');
    expect(parts.filter((p) => p.marked)).toHaveLength(1);
  });

  it('keeps html, markdown and unicode as plain text', () => {
    const text = '<b>bold</b> **x** 😀 مرحبا';
    expect(joined(markQuotes(text, ['**x**']))).toBe(text);
  });

  it('returns one unmarked part for no quotes and nothing for empty text', () => {
    expect(markQuotes('Text.', [])).toEqual([{ text: 'Text.', marked: false }]);
    expect(markQuotes('', ['x'])).toEqual([]);
  });
});
