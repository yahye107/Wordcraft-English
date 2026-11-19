import type { Db } from '@/lib/db';
import { dayKey, shiftDay, startOfDay } from './days';

export type ActivityKind = 'lesson' | 'review' | 'writing' | 'passage' | 'notebook';
export const ACTIVITY_KINDS: readonly ActivityKind[] = ['lesson', 'review', 'writing', 'passage', 'notebook'];

export type DayActivity = { day: string; total: number; byKind: Record<ActivityKind, number> };

export type Activity = {
  /** Oldest to newest, one entry per day, ending today. */
  days: DayActivity[];
  today: number;
  currentStreak: number;
  longestStreak: number;
  activeDays7: number;
  activeDays30: number;
  /** Everything ever recorded, not just the window. */
  lifetime: Record<ActivityKind, number>;
  firstDay: string | null;
};

const STREAK_LOOKBACK = 400;
const DEFAULT_WINDOW = 84;

const SOURCES: { kind: ActivityKind; table: string; column: string }[] = [
  { kind: 'lesson', table: 'exercise_attempts', column: 'created_at' },
  { kind: 'review', table: 'review_logs', column: 'reviewed_at' },
  { kind: 'writing', table: 'writing_revisions', column: 'created_at' },
  { kind: 'passage', table: 'novel_analyses', column: 'created_at' },
  { kind: 'notebook', table: 'notebook_entries', column: 'created_at' },
];

const emptyKinds = (): Record<ActivityKind, number> => ({ lesson: 0, review: 0, writing: 0, passage: 0, notebook: 0 });

/**
 * Activity per local day, streaks and lifetime counts. Only reads timestamps; rows dated after today are ignored.
 * A streak is consecutive active days ending today, or ending yesterday while today is still empty.
 */
export function getActivity(db: Db, opts: { now?: Date; tz?: number; days?: number } = {}): Activity {
  const now = opts.now ?? new Date();
  const tz = opts.tz;
  const today = dayKey(now, tz);
  const windowDays = Math.max(1, Math.min(opts.days ?? DEFAULT_WINDOW, STREAK_LOOKBACK));
  const lookbackStart = shiftDay(today, -(STREAK_LOOKBACK - 1));
  const since = startOfDay(shiftDay(lookbackStart, -1), tz); // a day of slack; exact filtering happens by day key

  const perDay = new Map<string, Record<ActivityKind, number>>();
  const lifetime = emptyKinds();
  let firstDay: string | null = null;

  for (const s of SOURCES) {
    lifetime[s.kind] = db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${s.table}`)?.n ?? 0;

    const first = db.get<{ t: string | null }>(`SELECT MIN(${s.column}) AS t FROM ${s.table}`)?.t;
    const firstKey = first ? dayKey(first, tz) : '';
    if (firstKey && (firstDay === null || firstKey < firstDay)) firstDay = firstKey;

    const rows = db.all<{ t: string }>(`SELECT ${s.column} AS t FROM ${s.table} WHERE ${s.column} >= ?`, [since]);
    for (const r of rows) {
      const key = dayKey(r.t, tz);
      if (!key || key > today || key < lookbackStart) continue;
      let day = perDay.get(key);
      if (!day) perDay.set(key, (day = emptyKinds()));
      day[s.kind]++;
    }
  }

  const total = (k: string) => {
    const d = perDay.get(k);
    return d ? ACTIVITY_KINDS.reduce((sum, kind) => sum + d[kind], 0) : 0;
  };

  const days: DayActivity[] = [];
  for (let i = windowDays - 1; i >= 0; i--) {
    const key = shiftDay(today, -i);
    days.push({ day: key, total: total(key), byKind: { ...(perDay.get(key) ?? emptyKinds()) } });
  }

  // Current streak: back from today, or from yesterday when today is still empty.
  let current = 0;
  let cursor = total(today) > 0 ? today : shiftDay(today, -1);
  while (cursor >= lookbackStart && total(cursor) > 0) {
    current++;
    cursor = shiftDay(cursor, -1);
  }

  // Longest run inside the lookback.
  let longest = 0;
  let run = 0;
  for (let key = lookbackStart; key <= today; key = shiftDay(key, 1)) {
    run = total(key) > 0 ? run + 1 : 0;
    if (run > longest) longest = run;
  }

  const activeIn = (n: number) => days.slice(-n).filter((d) => d.total > 0).length;
  const activeBack = (n: number) => {
    let c = 0;
    for (let i = 0; i < n; i++) if (total(shiftDay(today, -i)) > 0) c++;
    return c;
  };

  return {
    days,
    today: total(today),
    currentStreak: current,
    longestStreak: longest,
    activeDays7: windowDays >= 7 ? activeIn(7) : activeBack(7),
    activeDays30: windowDays >= 30 ? activeIn(30) : activeBack(30),
    lifetime,
    firstDay,
  };
}
