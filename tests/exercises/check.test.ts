import { describe, it, expect } from 'vitest';
import { checkAnswer, normaliseLoose, normaliseStrict, type StoredExercise } from '@/lib/exercises/check';

const choose: StoredExercise = {
  slug: 'c', type: 'choose', explanation: 'Said is a tag; smiled is not.',
  payload: { options: ['she said', 'she smiled', 'she sighed'] }, answer: { answer: 0 },
};
const fill: StoredExercise = {
  slug: 'f', type: 'fill_blank', explanation: 'A plain tag.', payload: {}, answer: { accepted: ['said', 'asked'] },
};
const identify: StoredExercise = {
  slug: 'i', type: 'identify', explanation: 'Tags name a speaker; beats show action.',
  payload: { items: ['she said.', 'She smiled.', 'He left.'], choices: ['tag', 'beat'] },
  answer: { answers: ['tag', 'beat', 'beat'] },
};
const fix: StoredExercise = {
  slug: 'p', type: 'fix_punctuation', explanation: 'Comma inside the quote, lower-case tag.',
  payload: { broken: '“Go.” She said' }, answer: { accepted: ['“Go,” she said.'] },
};
const free: StoredExercise = {
  slug: 'w', type: 'free_write', explanation: 'Check your line against the list.',
  payload: { checklist: ['a', 'b', 'c'] }, answer: { sample: 'A sample line.' },
};

const reorder: StoredExercise = {
  slug: 'r', type: 'reorder', explanation: 'The speech comes first, then the tag.',
  payload: { fragments: ['she said', '“Go,”', 'quietly.'] }, answer: { accepted: [[1, 0, 2], [1, 2, 0]] },
};

const ok = (r: ReturnType<typeof checkAnswer>) => {
  if (!r.ok) throw new Error(`expected ok, got error: ${r.error}`);
  return r;
};

describe('choose', () => {
  it('marks the right choice correct and a wrong one incorrect with the expected option', () => {
    expect(ok(checkAnswer(choose, { choice: 0 })).correct).toBe(true);
    const wrong = ok(checkAnswer(choose, { choice: 1 }));
    expect(wrong.correct).toBe(false);
    expect(wrong.expected).toBe('she said');
    expect(wrong.feedback).toContain('smiled is not');
  });

  it('rejects an index outside the options', () => {
    expect(checkAnswer(choose, { choice: 7 }).ok).toBe(false);
    expect(checkAnswer(choose, { choice: -1 }).ok).toBe(false);
    expect(checkAnswer(choose, { choice: 1.5 }).ok).toBe(false);
  });
});

describe('fill_blank', () => {
  it('ignores case, spacing, curly quotes and trailing punctuation', () => {
    expect(ok(checkAnswer(fill, { text: '  SAID. ' })).correct).toBe(true);
    expect(normaliseLoose('  Don’t   Go! ')).toBe("don't go");
  });

  it('accepts any of several accepted answers', () => {
    expect(ok(checkAnswer(fill, { text: 'asked' })).correct).toBe(true);
  });

  it('rejects a different word and shows what was expected', () => {
    const r = ok(checkAnswer(fill, { text: 'whispered' }));
    expect(r.correct).toBe(false);
    expect(r.expected).toBe('said');
  });
});

describe('fix_punctuation', () => {
  it('requires exact punctuation and capitals', () => {
    expect(ok(checkAnswer(fix, { text: '“Go,” she said.' })).correct).toBe(true);
    expect(ok(checkAnswer(fix, { text: '“Go,” She said.' })).correct).toBe(false);
    expect(ok(checkAnswer(fix, { text: '“Go.” she said.' })).correct).toBe(false);
    expect(ok(checkAnswer(fix, { text: '“Go,” she said' })).correct).toBe(false);
  });

  it('ignores curly versus straight quotes and double spaces', () => {
    expect(ok(checkAnswer(fix, { text: '"Go,"  she said.' })).correct).toBe(true);
    expect(normaliseStrict('“Hi”  there')).toBe('"Hi" there');
  });
});

describe('identify', () => {
  it('is correct when every label matches', () => {
    expect(ok(checkAnswer(identify, { labels: ['tag', 'beat', 'beat'] })).correct).toBe(true);
  });

  it('marks the wrong items without giving the key away', () => {
    const r = ok(checkAnswer(identify, { labels: ['tag', 'tag', 'tag'] }));
    expect(r.correct).toBe(false);
    expect(r.feedback).toContain('2');
    expect(r.feedback).toContain('3');
    expect(r.feedback).not.toContain('1.');
  });

  it('rejects the wrong number of labels or a non-string label', () => {
    expect(checkAnswer(identify, { labels: ['tag'] }).ok).toBe(false);
    expect(checkAnswer(identify, { labels: ['tag', 'beat', 5] }).ok).toBe(false);
  });
});

describe('free_write', () => {
  it('returns correct null, the guidance and the sample', () => {
    const r = ok(checkAnswer(free, { text: 'My own line.' }));
    expect(r.correct).toBeNull();
    expect(r.feedback).toContain('Check your line');
    expect(r.sample).toBe('A sample line.');
  });

  it('leaves out the sample when the exercise has none', () => {
    const r = ok(checkAnswer({ ...free, answer: {} }, { text: 'Text.' }));
    expect(r.sample).toBeUndefined();
  });
});

describe('invalid input', () => {
  it('rejects empty or whitespace-only text for every text type', () => {
    for (const ex of [fill, fix, free]) {
      expect(checkAnswer(ex, { text: '' }).ok).toBe(false);
      expect(checkAnswer(ex, { text: '   ' }).ok).toBe(false);
    }
  });

  it('rejects text over 4000 characters', () => {
    expect(checkAnswer(free, { text: 'x'.repeat(4001) }).ok).toBe(false);
    expect(checkAnswer(free, { text: 'x'.repeat(4000) }).ok).toBe(true);
  });

  it('rejects a number, null or a missing field where text is expected', () => {
    expect(checkAnswer(fill, { text: 5 }).ok).toBe(false);
    expect(checkAnswer(fill, null).ok).toBe(false);
    expect(checkAnswer(fill, {}).ok).toBe(false);
    expect(checkAnswer(fill, 'said').ok).toBe(false);
  });
});

describe('reorder', () => {
  it('accepts the first correct order and any other accepted order', () => {
    expect(ok(checkAnswer(reorder, { order: [1, 0, 2] })).correct).toBe(true);
    expect(ok(checkAnswer(reorder, { order: [1, 2, 0] })).correct).toBe(true);
  });

  it('marks a wrong order incorrect and shows the expected text', () => {
    const r = ok(checkAnswer(reorder, { order: [0, 1, 2] }));
    expect(r.correct).toBe(false);
    expect(r.expected).toBe('“Go,” she said quietly.');
  });

  it('rejects repeats, missing, out-of-range, wrong length and non-integers', () => {
    for (const order of [[1, 1, 2], [0, 1], [0, 1, 5], [0, 1, 2, 3], [0, 1, 1.5], ['a', 'b', 'c']]) {
      expect(checkAnswer(reorder, { order }).ok, JSON.stringify(order)).toBe(false);
    }
    expect(checkAnswer(reorder, { order: 'abc' }).ok).toBe(false);
    expect(checkAnswer(reorder, null).ok).toBe(false);
  });
});
