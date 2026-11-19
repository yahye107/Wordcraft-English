import { describe, it, expect } from 'vitest';
import { highlightParts } from '@/lib/highlight';

const joined = (parts: { text: string }[]) => parts.map((p) => p.text).join('');
const hits = (parts: { text: string; hit: boolean }[]) => parts.filter((p) => p.hit).map((p) => p.text);

describe('highlightParts', () => {
  it('marks an exact match, ignoring case', () => {
    const parts = highlightParts('He Grinned at me.', 'grinned');
    expect(hits(parts)).toEqual(['Grinned']);
    expect(joined(parts)).toBe('He Grinned at me.');
  });

  it('marks an inflected form of a single word', () => {
    expect(hits(highlightParts('She whispers to him.', 'whispered'))).toEqual(['whispers']);
  });

  it('marks a phrase whose possessive changes', () => {
    expect(hits(highlightParts('Lena squared her shoulders and knocked.', 'squared his shoulders'))).toEqual([
      'squared her shoulders',
    ]);
  });

  it('returns the whole text unmarked when nothing matches', () => {
    const parts = highlightParts('Nothing here.', 'crestfallen');
    expect(parts).toEqual([{ text: 'Nothing here.', hit: false }]);
  });

  it('handles curly apostrophes and regex characters in the needle', () => {
    expect(hits(highlightParts('I couldn’t agree more.', 'I couldn’t agree more'))).toEqual(['I couldn’t agree more']);
    expect(hits(highlightParts('As quiet as snow.', 'simile with “as … as”'))).toEqual([]);
  });

  it('survives an empty needle', () => {
    expect(highlightParts('Text.', '')).toEqual([{ text: 'Text.', hit: false }]);
  });
});
