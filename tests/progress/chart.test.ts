import { describe, it, expect } from 'vitest';
import { scalePoints, niceMax, describeSeries, formatNumber } from '@/lib/progress/chart';

const box = { width: 200, height: 100, pad: 10 };
const finite = (ps: { x: number; y: number }[]) => ps.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y));

describe('scalePoints', () => {
  it('returns no points for no values', () => {
    expect(scalePoints([], box)).toEqual([]);
  });

  it('centres a single value horizontally and vertically', () => {
    expect(scalePoints([7], box)).toEqual([{ x: 100, y: 50 }]);
  });

  it('puts equal values on the middle line', () => {
    const p = scalePoints([4, 4, 4], box);
    expect(p.map((q) => q.y)).toEqual([50, 50, 50]);
    expect(p.map((q) => q.x)).toEqual([10, 100, 190]);
  });

  it('runs from the bottom to the top inside the padding', () => {
    expect(scalePoints([0, 10], box)).toEqual([
      { x: 10, y: 90 },
      { x: 190, y: 10 },
    ]);
  });

  it('honours a fixed min and max', () => {
    const p = scalePoints([5], { ...box, min: 0, max: 10 });
    expect(p[0].y).toBe(50);
    expect(scalePoints([0, 5], { ...box, min: 0, max: 10 })[0].y).toBe(90);
  });

  it('never returns NaN or Infinity', () => {
    for (const values of [[Number.NaN, 3], [Number.POSITIVE_INFINITY, 1, 2], [-Infinity, Infinity], [1e308, -1e308], [Number.NaN]]) {
      expect(finite(scalePoints(values, box)), String(values)).toBe(true);
    }
    expect(finite(scalePoints([1, 2, 3], { width: 0, height: 0, pad: 0 }))).toBe(true);
    expect(finite(scalePoints([1, 2, 3], { ...box, min: 5, max: 5 }))).toBe(true);
  });
});

describe('niceMax', () => {
  it('rounds up to 1, 2, 5 or 10 times a power of ten', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(-3)).toBe(1);
    expect(niceMax(Number.NaN)).toBe(1);
    expect(niceMax(1)).toBe(1);
    expect(niceMax(7)).toBe(10);
    expect(niceMax(11)).toBe(20);
    expect(niceMax(430)).toBe(500);
    expect(niceMax(0.3)).toBe(0.5);
    expect(niceMax(2)).toBe(2);
  });
});

describe('formatNumber', () => {
  it('drops a trailing .0 and keeps one decimal otherwise', () => {
    expect(formatNumber(6)).toBe('6');
    expect(formatNumber(6.04)).toBe('6');
    expect(formatNumber(1.7)).toBe('1.7');
    expect(formatNumber(Number.NaN)).toBe('0');
  });
});

describe('describeSeries', () => {
  it('says there is no data for an empty series', () => {
    expect(describeSeries('First drafts', [], 'problems per 100 words')).toBe('First drafts: no data yet.');
  });

  it('describes a single value', () => {
    expect(describeSeries('First drafts', [6], 'problems per 100 words')).toBe('First drafts: one value, 6 problems per 100 words.');
  });

  it('describes the first, last, lowest and highest values', () => {
    expect(describeSeries('Final drafts', [6, 2.5, 9, 4], 'problems per 100 words')).toBe(
      'Final drafts: starts at 6 problems per 100 words, ends at 4 problems per 100 words; lowest 2.5, highest 9.',
    );
  });
});
