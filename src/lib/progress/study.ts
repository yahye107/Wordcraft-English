import type { Db } from '@/lib/db';
import { listLessons, type Lab } from '@/lib/lessons/queries';
import { daysBetween, dayKey, shiftDay, startOfDay } from './days';

export type LabProgress = {
  lab: Lab;
  label: string;
  lessons: number;
  lessonsDone: number;
  exercises: number;
  exercisesDone: number;
};

export type StudyStats = {
  notebook: {
    entries: number;
    cards: number;
    fresh: number;
    learning: number;
    mature: number;
    dueNow: number;
    /** Today and the next six local days; overdue cards are counted in today. */
    dueNext7: number[];
  };
  reviews: { last30: number; remembered: number; rate: number | null; perDay: number[] };
  labs: LabProgress[];
  accuracy: { attempts30: number; correct30: number; rate: number | null };
  passages: number;
};

const MATURE_DAYS = 21;
const LABS: { lab: Lab; label: string }[] = [
  { lab: 'dialogue', label: 'Dialogue and narration' },
  { lab: 'sentence', label: 'Sentence construction' },
];

const ratio = (part: number, whole: number): number | null => (whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null);
const count = (db: Db, sql: string, params: (string | number)[] = []): number => db.get<{ n: number }>(sql, params)?.n ?? 0;

/** Plain numbers about notebook review, lab progress and exercise accuracy. Read-only. */
export function getStudyStats(db: Db, opts: { now?: Date; tz?: number } = {}): StudyStats {
  const now = opts.now ?? new Date();
  const tz = opts.tz;
  const today = dayKey(now, tz);
  const since30 = startOfDay(shiftDay(today, -29), tz);

  // Notebook cards
  const dueNext7 = [0, 0, 0, 0, 0, 0, 0];
  const dueRows = db.all<{ due_at: string }>('SELECT due_at FROM srs_cards');
  for (const r of dueRows) {
    const key = dayKey(r.due_at, tz);
    if (!key) continue;
    const idx = daysBetween(today, key);
    if (idx <= 0) dueNext7[0]++;
    else if (idx < 7) dueNext7[idx]++;
  }
  const cards = dueRows.length;
  const fresh = count(db, 'SELECT COUNT(*) AS n FROM srs_cards WHERE reps = 0');
  const mature = count(db, 'SELECT COUNT(*) AS n FROM srs_cards WHERE reps > 0 AND interval_days >= ?', [MATURE_DAYS]);

  // Reviews in the last 30 local days
  const perDay = new Array<number>(30).fill(0);
  let last30 = 0;
  let remembered = 0;
  for (const r of db.all<{ grade: string; reviewed_at: string }>('SELECT grade, reviewed_at FROM review_logs WHERE reviewed_at >= ?', [since30])) {
    const idx = 29 - daysBetween(dayKey(r.reviewed_at, tz), today);
    if (!Number.isFinite(idx) || idx < 0 || idx > 29) continue;
    perDay[idx]++;
    last30++;
    if (r.grade === 'good' || r.grade === 'easy') remembered++;
  }

  // Exercise accuracy (free-write attempts have no right answer, so they are left out)
  let attempts30 = 0;
  let correct30 = 0;
  for (const r of db.all<{ correct: number; created_at: string }>(
    'SELECT correct, created_at FROM exercise_attempts WHERE correct IS NOT NULL AND created_at >= ?',
    [since30],
  )) {
    const age = daysBetween(dayKey(r.created_at, tz), today);
    if (!Number.isFinite(age) || age < 0) continue;
    attempts30++;
    if (r.correct === 1) correct30++;
  }

  const labs: LabProgress[] = LABS.map(({ lab, label }) => {
    const lessons = listLessons(db, lab);
    return {
      lab,
      label,
      lessons: lessons.length,
      lessonsDone: lessons.filter((l) => l.exerciseCount > 0 && l.doneCount >= l.exerciseCount).length,
      exercises: lessons.reduce((s, l) => s + l.exerciseCount, 0),
      exercisesDone: lessons.reduce((s, l) => s + l.doneCount, 0),
    };
  });

  return {
    notebook: {
      entries: count(db, 'SELECT COUNT(*) AS n FROM notebook_entries'),
      cards,
      fresh,
      learning: Math.max(0, cards - fresh - mature),
      mature,
      dueNow: count(db, 'SELECT COUNT(*) AS n FROM srs_cards WHERE due_at <= ?', [now.toISOString()]),
      dueNext7,
    },
    reviews: { last30, remembered, rate: ratio(remembered, last30), perDay },
    labs,
    accuracy: { attempts30, correct30, rate: ratio(correct30, attempts30) },
    passages: count(db, 'SELECT COUNT(*) AS n FROM novel_analyses'),
  };
}
