/** Pure helpers for the small SVG charts. Nothing here returns NaN or Infinity, whatever it is given. */

export type Box = { width: number; height: number; pad: number; min?: number; max?: number };
export type XY = { x: number; y: number };

const finiteOr = (n: number, fallback: number) => (Number.isFinite(n) ? n : fallback);

/** One decimal at most, no trailing .0, and 0 for anything that is not a number. */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * Chart coordinates for a list of values, oldest first. A single value sits in the middle; equal values sit on
 * the middle line; otherwise the lowest value is at the bottom edge of the padded area and the highest at the top
 * (or the given min and max are used, so several series can share one scale).
 */
export function scalePoints(values: number[], box: Box): XY[] {
  if (values.length === 0) return [];
  const vals = values.map((v) => finiteOr(v, 0));
  const min = finiteOr(box.min ?? Math.min(...vals), 0);
  const max = finiteOr(box.max ?? Math.max(...vals), 0);
  const range = max - min;

  const left = box.pad;
  const spanX = Math.max(0, box.width - box.pad * 2);
  const top = box.pad;
  const bottom = Math.max(top, box.height - box.pad);

  return vals.map((v, i) => {
    const x = vals.length === 1 ? box.width / 2 : left + (i * spanX) / (vals.length - 1);
    const t = range > 0 && Number.isFinite(range) ? Math.min(1, Math.max(0, (v - min) / range)) : 0.5;
    const y = range > 0 && Number.isFinite(range) ? bottom - t * (bottom - top) : box.height / 2;
    return { x: finiteOr(x, 0), y: finiteOr(y, 0) };
  });
}

/** The next round top for an axis: 1, 2, 5 or 10 times a power of ten. 0, negatives and non-numbers give 1. */
export function niceMax(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(n));
  const m = n / pow;
  const step = m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10;
  return Math.round(step * pow * 1e9) / 1e9;
}

/** One plain sentence that says what a series shows, for the chart's accessible name. */
export function describeSeries(name: string, values: number[], unit: string): string {
  const v = values.filter((x) => Number.isFinite(x));
  if (v.length === 0) return `${name}: no data yet.`;
  if (v.length === 1) return `${name}: one value, ${formatNumber(v[0])} ${unit}.`;
  return `${name}: starts at ${formatNumber(v[0])} ${unit}, ends at ${formatNumber(v[v.length - 1])} ${unit}; lowest ${formatNumber(
    Math.min(...v),
  )}, highest ${formatNumber(Math.max(...v))}.`;
}
