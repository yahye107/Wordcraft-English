import type { Db } from '@/lib/db';
import { listLessons, type Lab } from '@/lib/lessons/queries';
import { countDue } from '@/lib/notebook/review';
import { getWeaknesses } from '@/lib/writing/stats';
import { practiceFor } from '@/lib/writing/practice';
import type { Category } from '@/lib/writing/limits';
import { getActivity, type Activity, type DayActivity } from './activity';
import { daysBetween, dayKey } from './days';
import { suggestNext, type SuggestInput, type Suggestion } from './suggest';

export type Today = { activity: Activity; week: DayActivity[]; dueCards: number; suggestions: Suggestion[] };

const LAB_PATH: Record<Lab, string> = { dialogue: 'dialogue', sentence: 'sentences' };

/** The lesson to suggest: the unfinished one touched most recently, else the first unfinished (dialogue, then sentence). */
function nextLesson(db: Db): SuggestInput['nextLesson'] {
  const lastAttempt = new Map(
    db
      .all<{ slug: string; at: string }>(
        `SELECT l.slug AS slug, MAX(a.created_at) AS at FROM exercise_attempts a
         JOIN exercises e ON e.slug = a.exercise_slug JOIN lessons l ON l.id = e.lesson_id GROUP BY l.slug`,
      )
      .map((r) => [r.slug, r.at] as const),
  );

  const open = (['dialogue', 'sentence'] as Lab[]).flatMap((lab) =>
    listLessons(db, lab)
      .filter((l) => l.exerciseCount > 0 && l.doneCount < l.exerciseCount)
      .map((l) => ({ lab, slug: l.slug, title: l.title, at: lastAttempt.get(l.slug) ?? null })),
  );
  if (open.length === 0) return null;

  const started = open.filter((l) => l.at !== null).sort((a, b) => (b.at as string).localeCompare(a.at as string));
  const pick = started[0] ?? open[0];
  return { title: pick.title, href: `/labs/${LAB_PATH[pick.lab]}/${pick.slug}`, started: pick.at !== null };
}

export function getToday(db: Db, opts: { now?: Date; tz?: number } = {}): Today {
  const now = opts.now ?? new Date();
  const activity = getActivity(db, { now, tz: opts.tz });
  const dueCards = countDue(db, now);

  const w = getWeaknesses(db, { limit: 1 })[0];
  const weakness = w ? { label: w.label, href: practiceFor(w.category as Category, w.key).links[0].href } : null;

  const last = db.get<{ t: string | null }>('SELECT MAX(created_at) AS t FROM writing_revisions')?.t;
  const lastKey = last ? dayKey(last, opts.tz) : '';
  const daysSinceWriting = lastKey ? Math.max(0, daysBetween(lastKey, dayKey(now, opts.tz))) : null;

  const passages = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM novel_analyses')?.n ?? 0;
  const hasActivity = Object.values(activity.lifetime).some((n) => n > 0);

  return {
    activity,
    week: activity.days.slice(-7),
    dueCards,
    suggestions: suggestNext({ dueCards, weakness, nextLesson: nextLesson(db), daysSinceWriting, passages, hasActivity }),
  };
}
