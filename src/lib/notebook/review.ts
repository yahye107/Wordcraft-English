import type { Db } from '@/lib/db';
import { getSetting } from '@/lib/settings';
import { GRADES, schedule, type CardState, type Grade } from '@/lib/srs/schedule';

export const SESSION_LIMIT = 50;
export const DEFAULT_NEW_PER_DAY = 10;

export type DueCard = {
  entryId: number;
  text: string;
  myMeaning: string;
  myNotes: string;
  library: { slug: string; simpleMeaning: string; contextualMeaning: string; examples: string[] } | null;
  examples: string[];
  isNew: boolean;
};

type CardRow = {
  entry_id: number; text: string; my_meaning: string; my_notes: string; expression_slug: string | null;
  reps: number; last_reviewed_at: string | null;
};

function newPerDay(db: Db): number {
  const n = Number(getSetting(db, 'new_cards_per_day'));
  return Number.isInteger(n) && n >= 0 ? n : DEFAULT_NEW_PER_DAY;
}

/** How many brand-new cards were first reviewed on the same (UTC) day as `now`. */
function newCardsStartedToday(db: Db, now: Date): number {
  const today = now.toISOString().slice(0, 10);
  return (
    db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM (SELECT entry_id, MIN(id) AS mid FROM review_logs GROUP BY entry_id) f
       JOIN review_logs l ON l.id = f.mid WHERE substr(l.reviewed_at, 1, 10) = ?`,
      [today],
    )?.n ?? 0
  );
}

function dueRows(db: Db, now: Date): { reviews: CardRow[]; fresh: CardRow[] } {
  const rows = db.all<CardRow>(
    `SELECT c.entry_id, e.text, e.my_meaning, e.my_notes, e.expression_slug, c.reps, c.last_reviewed_at
     FROM srs_cards c JOIN notebook_entries e ON e.id = c.entry_id
     WHERE c.due_at <= ? ORDER BY c.due_at ASC, c.entry_id ASC`,
    [now.toISOString()],
  );
  const isNew = (r: CardRow) => r.reps === 0 && r.last_reviewed_at === null;
  return { reviews: rows.filter((r) => !isNew(r)), fresh: rows.filter(isNew) };
}

function allowedNew(db: Db, now: Date): number {
  return Math.max(0, newPerDay(db) - newCardsStartedToday(db, now));
}

export function getDueCards(db: Db, now: Date = new Date()): DueCard[] {
  const { reviews, fresh } = dueRows(db, now);
  const chosen = reviews.slice(0, SESSION_LIMIT);
  const room = SESSION_LIMIT - chosen.length;
  const picked = [...chosen.map((r) => ({ r, isNew: false })), ...fresh.slice(0, Math.min(room, allowedNew(db, now))).map((r) => ({ r, isNew: true }))];

  return picked.map(({ r, isNew }) => {
    const lib = r.expression_slug
      ? db.get<{ slug: string; simple_meaning: string; contextual_meaning: string }>(
          "SELECT slug, simple_meaning, contextual_meaning FROM expressions WHERE slug = ? AND status = 'published'",
          [r.expression_slug],
        )
      : undefined;
    return {
      entryId: r.entry_id,
      text: r.text,
      myMeaning: r.my_meaning,
      myNotes: r.my_notes,
      library: lib
        ? {
            slug: lib.slug,
            simpleMeaning: lib.simple_meaning,
            contextualMeaning: lib.contextual_meaning,
            examples: db
              .all<{ text: string }>(
                'SELECT x.text FROM examples x JOIN expressions e ON e.id = x.expression_id WHERE e.slug = ? ORDER BY x.sort LIMIT 3',
                [lib.slug],
              )
              .map((x) => x.text),
          }
        : null,
      examples: db.all<{ text: string }>('SELECT text FROM notebook_examples WHERE entry_id = ? ORDER BY id', [r.entry_id]).map((x) => x.text),
      isNew,
    };
  });
}

/** Cards due now, honouring the daily new-card allowance but not the 50-card session cap. */
export function countDue(db: Db, now: Date = new Date()): number {
  const { reviews, fresh } = dueRows(db, now);
  return reviews.length + Math.min(fresh.length, allowedNew(db, now));
}

export function nextDueAt(db: Db, now: Date = new Date()): string | null {
  return db.get<{ d: string | null }>('SELECT MIN(due_at) AS d FROM srs_cards WHERE due_at > ?', [now.toISOString()])?.d ?? null;
}

export type GradeResult = { ok: true; card: CardState } | { ok: false; status: 400 | 404 | 409; error: string };

export function gradeCard(db: Db, entryId: number, grade: Grade, now: Date = new Date()): GradeResult {
  if (!GRADES.includes(grade)) return { ok: false, status: 400, error: 'Choose again, hard, good or easy.' };
  const row = db.get<{ ease: number; interval_days: number; reps: number; lapses: number; due_at: string; last_reviewed_at: string | null }>(
    'SELECT ease, interval_days, reps, lapses, due_at, last_reviewed_at FROM srs_cards WHERE entry_id = ?',
    [entryId],
  );
  if (!row) return { ok: false, status: 404, error: 'That card does not exist.' };
  if (row.due_at > now.toISOString()) return { ok: false, status: 409, error: 'That card is not due yet.' };

  const before: CardState = {
    ease: row.ease, intervalDays: row.interval_days, reps: row.reps, lapses: row.lapses, dueAt: row.due_at, lastReviewedAt: row.last_reviewed_at,
  };
  const after = schedule(before, grade, now);
  db.transaction(() => {
    db.run('UPDATE srs_cards SET ease = ?, interval_days = ?, reps = ?, lapses = ?, due_at = ?, last_reviewed_at = ? WHERE entry_id = ?', [
      after.ease, after.intervalDays, after.reps, after.lapses, after.dueAt, after.lastReviewedAt, entryId,
    ]);
    db.run('INSERT INTO review_logs (entry_id, grade, prev_interval, new_interval, reviewed_at) VALUES (?, ?, ?, ?, ?)', [
      entryId, grade, before.intervalDays, after.intervalDays, now.toISOString(),
    ]);
  });
  return { ok: true, card: after };
}
