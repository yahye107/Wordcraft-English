/**
 * Local-day helpers. A "day key" is 'YYYY-MM-DD' in the learner's local calendar. The app runs on the learner's
 * own computer, so "local" is the machine's time zone; tests pass `tz` (minutes east of UTC) to be exact.
 */

const KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

const pad = (n: number) => String(n).padStart(2, '0');

function parts(key: string): { y: number; m: number; d: number } | null {
  const m = KEY_RE.exec(key);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d ? { y, m: mo, d } : null;
}

export const isDayKey = (s: string): boolean => parts(s) !== null;

/** The local day an instant falls on, or '' when the input is not a valid date. */
export function dayKey(at: string | Date, tz?: number): string {
  const date = at instanceof Date ? at : new Date(at);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return '';
  if (tz === undefined) return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const shifted = new Date(ms + tz * 60_000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

const utcOf = (key: string): number => {
  const p = parts(key);
  return p ? Date.UTC(p.y, p.m - 1, p.d) : NaN;
};

export function shiftDay(key: string, n: number): string {
  const t = utcOf(key);
  if (!Number.isFinite(t)) return '';
  const d = new Date(t + n * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((utcOf(b) - utcOf(a)) / DAY_MS);
}

/** The instant (ISO, UTC) at which a local day starts. */
export function startOfDay(key: string, tz?: number): string {
  const p = parts(key);
  if (!p) return '';
  if (tz === undefined) return new Date(p.y, p.m - 1, p.d).toISOString();
  return new Date(Date.UTC(p.y, p.m - 1, p.d) - tz * 60_000).toISOString();
}

/** 0 = Monday ... 6 = Sunday. */
export function weekday(key: string): number {
  const t = utcOf(key);
  return Number.isFinite(t) ? (new Date(t).getUTCDay() + 6) % 7 : 0;
}
