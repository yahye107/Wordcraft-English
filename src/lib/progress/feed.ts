import type { Db } from '@/lib/db';
import { dayKey } from './days';

export const FEED_TYPES = ['all', 'writing', 'lessons', 'reviews', 'passages'] as const;
export type FeedType = (typeof FEED_TYPES)[number];
export const isFeedType = (v: unknown): v is FeedType => typeof v === 'string' && (FEED_TYPES as readonly string[]).includes(v);

export type FeedItem =
  | { kind: 'writing'; sessionId: number; title: string; mode: string; versions: number; words: number; at: string }
  | { kind: 'lessons'; lessonSlug: string | null; title: string; attempts: number; correct: number; at: string }
  | { kind: 'reviews'; count: number; remembered: number; at: string }
  | { kind: 'passage'; id: number; title: string; preview: string; aiUsed: boolean; at: string }
  | { kind: 'notebook'; count: number; at: string };

export type Feed = { days: { day: string; items: FeedItem[] }[]; hasMore: boolean };

const DEFAULT_LIMIT = 60;
const MAX_LIMIT = 300;
const ROWS_PER_ITEM = 60; // raw rows read per source for each item wanted; grouped sources shrink a lot
const REMOVED = 'An exercise that is no longer in the library';

type Source = { items: FeedItem[]; truncated: boolean };

/** Group rows into per-day items. When the read was cut short, drop the oldest group: it may be incomplete. */
function groupByDay<R extends { at: string }, T extends FeedItem>(
  rows: R[],
  cutShort: boolean,
  tz: number | undefined,
  keyOf: (r: R) => string,
  make: (rows: R[]) => T,
): Source {
  const groups = new Map<string, R[]>();
  for (const r of rows) {
    const day = dayKey(r.at, tz);
    if (!day) continue;
    const key = `${day}|${keyOf(r)}`;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }
  let items = [...groups.values()].map(make);
  items.sort((a, b) => b.at.localeCompare(a.at));
  if (cutShort && items.length > 0) {
    const oldestDay = dayKey(items[items.length - 1].at, tz);
    // Rows were read newest first, so only the oldest day can be partial.
    items = items.filter((i) => dayKey(i.at, tz) !== oldestDay);
  }
  return { items, truncated: cutShort };
}

/** Everything the learner did, newest first, grouped by local day. Read-only and bounded. */
export function getFeed(db: Db, opts: { type?: FeedType; mode?: string; limit?: number; tz?: number } = {}): Feed {
  const type = opts.type && isFeedType(opts.type) ? opts.type : 'all';
  const requested = Number.isFinite(opts.limit) ? Math.floor(opts.limit as number) : DEFAULT_LIMIT;
  const limit = Math.max(1, Math.min(requested, MAX_LIMIT));
  const bound = limit * ROWS_PER_ITEM;
  const tz = opts.tz;
  const want = (t: FeedType) => type === 'all' || type === t;

  const sources: Source[] = [];

  if (want('writing')) {
    const rows = db.all<{ id: number; title: string; mode: string; created_at: string; versions: number; words: number | null }>(
      `SELECT s.id, s.title, s.mode, s.created_at,
         (SELECT COUNT(*) FROM writing_revisions r WHERE r.session_id = s.id) AS versions,
         (SELECT word_count FROM writing_revisions r WHERE r.session_id = s.id ORDER BY version DESC LIMIT 1) AS words
       FROM writing_sessions s ${opts.mode ? 'WHERE s.mode = ?' : ''}
       ORDER BY s.created_at DESC, s.id DESC LIMIT ?`,
      opts.mode ? [opts.mode, limit + 1] : [limit + 1],
    );
    sources.push({
      items: rows.slice(0, limit).map((r) => ({
        kind: 'writing' as const,
        sessionId: r.id,
        title: r.title,
        mode: r.mode,
        versions: r.versions,
        words: r.words ?? 0,
        at: r.created_at,
      })),
      truncated: rows.length > limit,
    });
  }

  if (want('lessons')) {
    const rows = db
      .all<{ slug: string | null; title: string | null; correct: number | null; created_at: string }>(
        `SELECT l.slug AS slug, l.title AS title, a.correct AS correct, a.created_at AS created_at
         FROM exercise_attempts a
         LEFT JOIN exercises e ON e.slug = a.exercise_slug
         LEFT JOIN lessons l ON l.id = e.lesson_id
         ORDER BY a.created_at DESC, a.id DESC LIMIT ?`,
        [bound],
      )
      .map((r) => ({ ...r, at: r.created_at }));
    sources.push(
      groupByDay(rows, rows.length >= bound, tz, (r) => r.slug ?? '', (g) => ({
        kind: 'lessons' as const,
        lessonSlug: g[0].slug,
        title: g[0].title ?? REMOVED,
        attempts: g.length,
        correct: g.filter((r) => r.correct === 1).length,
        at: g.reduce((m, r) => (r.at > m ? r.at : m), g[0].at),
      })),
    );
  }

  if (want('reviews')) {
    const rows = db
      .all<{ grade: string; reviewed_at: string }>('SELECT grade, reviewed_at FROM review_logs ORDER BY reviewed_at DESC, id DESC LIMIT ?', [bound])
      .map((r) => ({ ...r, at: r.reviewed_at }));
    sources.push(
      groupByDay(rows, rows.length >= bound, tz, () => '', (g) => ({
        kind: 'reviews' as const,
        count: g.length,
        remembered: g.filter((r) => r.grade === 'good' || r.grade === 'easy').length,
        at: g.reduce((m, r) => (r.at > m ? r.at : m), g[0].at),
      })),
    );
  }

  if (want('passages')) {
    const rows = db.all<{ id: number; excerpt: string; source_title: string | null; ai_used: number; created_at: string }>(
      'SELECT id, excerpt, source_title, ai_used, created_at FROM novel_analyses ORDER BY created_at DESC, id DESC LIMIT ?',
      [limit + 1],
    );
    sources.push({
      items: rows.slice(0, limit).map((r) => ({
        kind: 'passage' as const,
        id: r.id,
        title: r.source_title ?? 'Untitled passage',
        preview: r.excerpt.length > 80 ? `${r.excerpt.slice(0, 80)}…` : r.excerpt,
        aiUsed: r.ai_used === 1,
        at: r.created_at,
      })),
      truncated: rows.length > limit,
    });
  }

  if (type === 'all') {
    const rows = db
      .all<{ created_at: string }>('SELECT created_at FROM notebook_entries ORDER BY created_at DESC, id DESC LIMIT ?', [bound])
      .map((r) => ({ at: r.created_at }));
    sources.push(
      groupByDay(rows, rows.length >= bound, tz, () => '', (g) => ({
        kind: 'notebook' as const,
        count: g.length,
        at: g.reduce((m, r) => (r.at > m ? r.at : m), g[0].at),
      })),
    );
  }

  const merged = sources.flatMap((s) => s.items).filter((i) => dayKey(i.at, tz) !== '');
  merged.sort((a, b) => b.at.localeCompare(a.at));
  const shown = merged.slice(0, limit);
  const hasMore = merged.length > limit || sources.some((s) => s.truncated);

  const days: Feed['days'] = [];
  for (const item of shown) {
    const day = dayKey(item.at, tz);
    const last = days[days.length - 1];
    if (last && last.day === day) last.items.push(item);
    else days.push({ day, items: [item] });
  }
  return { days, hasMore };
}
