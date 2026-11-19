import type { Db } from '@/lib/db';
import { findExpressionsIn } from '@/lib/text/match';
import { labelFor } from '@/lib/writing/stats';
import { dayKey, shiftDay, startOfDay } from './days';

export type SessionPoint = {
  sessionId: number;
  title: string;
  mode: string;
  date: string;
  words: number;
  versions: number;
  firstDraftPer100: number;
  finalPer100: number;
};

export type TrendState = 'not-enough' | 'better' | 'same' | 'worse';

export type WritingTrends = {
  /** Oldest first. */
  sessions: SessionPoint[];
  totals: { sessions: number; words: number; wordsLast30: number };
  trend: { state: TrendState; note: string };
  repeatErrors: { key: string; label: string; recent: number; earlier: number }[];
};

const DEFAULT_LIMIT = 20;
const SAME_BAND = 0.1; // a change smaller than 10 percent is "about the same"
const REPEAT_WINDOW = 5;
const REPEAT_TOP = 5;

const per100 = (issues: number, words: number): number => (words > 0 ? Math.round((issues / words) * 1000) / 10 : 0);
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const NOTES: Record<TrendState, string> = {
  'not-enough': 'Not enough writing yet. After four pieces, this compares your latest three with the ones before.',
  better: 'Your first drafts have fewer problems per 100 words than before.',
  same: 'Your first drafts have about the same number of problems per 100 words as before.',
  worse: 'Your first drafts have more problems per 100 words than before. That can happen when you try harder things.',
};

function trendOf(points: SessionPoint[]): { state: TrendState; note: string } {
  if (points.length < 4) return { state: 'not-enough', note: NOTES['not-enough'] };
  const latest = mean(points.slice(-3).map((p) => p.firstDraftPer100));
  const earlier = mean(points.slice(-6, -3).map((p) => p.firstDraftPer100));
  let state: TrendState;
  if (earlier === 0) state = latest === 0 ? 'same' : 'worse';
  else if (Math.abs(latest - earlier) < SAME_BAND * earlier) state = 'same';
  else state = latest < earlier ? 'better' : 'worse';
  return { state, note: NOTES[state] };
}

type SessionRow = {
  id: number; title: string; mode: string; created_at: string; versions: number;
  first_id: number; first_words: number; first_issues: number; last_words: number; last_issues: number;
};

const SESSION_SQL = `
  SELECT s.id, s.title, s.mode, s.created_at,
    (SELECT COUNT(*) FROM writing_revisions r WHERE r.session_id = s.id) AS versions,
    f.id AS first_id, f.word_count AS first_words,
    (SELECT COUNT(*) FROM feedback_items x WHERE x.revision_id = f.id) AS first_issues,
    l.word_count AS last_words,
    (SELECT COUNT(*) FROM feedback_items y WHERE y.revision_id = l.id) AS last_issues
  FROM writing_sessions s
  JOIN writing_revisions f ON f.session_id = s.id AND f.version = (SELECT MIN(version) FROM writing_revisions WHERE session_id = s.id)
  JOIN writing_revisions l ON l.session_id = s.id AND l.version = (SELECT MAX(version) FROM writing_revisions WHERE session_id = s.id)
`;

/** Problems per 100 words in first and final drafts, a careful trend, repeated problems and word totals. */
export function getWritingTrends(db: Db, opts: { limit?: number; now?: Date; tz?: number } = {}): WritingTrends {
  const now = opts.now ?? new Date();
  const limit = Math.max(1, Math.min(opts.limit ?? DEFAULT_LIMIT, 200));
  const newest = db.all<SessionRow>(`${SESSION_SQL} ORDER BY s.created_at DESC, s.id DESC LIMIT ?`, [Math.max(limit, REPEAT_WINDOW * 2)]);

  const sessions: SessionPoint[] = newest
    .slice(0, limit)
    .reverse()
    .map((r) => ({
      sessionId: r.id,
      title: r.title,
      mode: r.mode,
      date: r.created_at,
      words: r.last_words,
      versions: r.versions,
      firstDraftPer100: per100(r.first_issues, r.first_words),
      finalPer100: per100(r.last_issues, r.last_words),
    }));

  const since30 = startOfDay(shiftDay(dayKey(now, opts.tz), -29), opts.tz);
  const totalRow = db.get<{ sessions: number; words: number | null }>(
    `SELECT COUNT(*) AS sessions, SUM(l.word_count) AS words FROM writing_sessions s
     JOIN writing_revisions l ON l.session_id = s.id AND l.version = (SELECT MAX(version) FROM writing_revisions WHERE session_id = s.id)`,
  );
  const recentRow = db.get<{ words: number | null }>(
    `SELECT SUM(l.word_count) AS words FROM writing_sessions s
     JOIN writing_revisions l ON l.session_id = s.id AND l.version = (SELECT MAX(version) FROM writing_revisions WHERE session_id = s.id)
     WHERE s.created_at >= ?`,
    [since30],
  );

  // Repeated problems: first drafts of the latest 5 sessions against the 5 before.
  const countKeys = (rows: SessionRow[]) => {
    const out = new Map<string, { category: string; n: number }>();
    for (const r of rows) {
      for (const f of db.all<{ category: string; key: string }>('SELECT category, key FROM feedback_items WHERE revision_id = ?', [r.first_id])) {
        const cur = out.get(f.key);
        if (cur) cur.n++;
        else out.set(f.key, { category: f.category, n: 1 });
      }
    }
    return out;
  };
  const recent = countKeys(newest.slice(0, REPEAT_WINDOW));
  const earlier = countKeys(newest.slice(REPEAT_WINDOW, REPEAT_WINDOW * 2));
  const repeatErrors = [...recent.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
    .slice(0, REPEAT_TOP)
    .map(([key, v]) => ({ key, label: labelFor(v.category, key), recent: v.n, earlier: earlier.get(key)?.n ?? 0 }));

  return {
    sessions,
    totals: { sessions: totalRow?.sessions ?? 0, words: totalRow?.words ?? 0, wordsLast30: recentRow?.words ?? 0 },
    trend: trendOf(sessions),
    repeatErrors,
  };
}

export type ExpressionUse = {
  libraryWords: { slug: string; text: string }[];
  notebookWords: { slug: string; text: string }[];
  notebookLibraryTotal: number;
};

const MAX_USED = 30;

/** Library expressions that appear in the latest version of recent writing, and which of them are saved words. */
export function getExpressionUse(db: Db, opts: { sessions?: number } = {}): ExpressionUse {
  const texts = db.all<{ text: string }>(
    `SELECT l.text FROM writing_sessions s
     JOIN writing_revisions l ON l.session_id = s.id AND l.version = (SELECT MAX(version) FROM writing_revisions WHERE session_id = s.id)
     ORDER BY s.created_at DESC, s.id DESC LIMIT ?`,
    [Math.max(1, Math.min(opts.sessions ?? 20, 100))],
  );

  const seen = new Map<string, { slug: string; text: string }>();
  for (const t of texts) {
    for (const m of findExpressionsIn(db, t.text)) if (!seen.has(m.slug) && seen.size < MAX_USED) seen.set(m.slug, { slug: m.slug, text: m.text });
  }

  const saved = new Set(
    db.all<{ slug: string }>('SELECT DISTINCT expression_slug AS slug FROM notebook_entries WHERE expression_slug IS NOT NULL').map((r) => r.slug),
  );
  const libraryWords = [...seen.values()];
  return {
    libraryWords,
    notebookWords: libraryWords.filter((w) => saved.has(w.slug)),
    notebookLibraryTotal: saved.size,
  };
}
