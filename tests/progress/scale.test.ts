import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { ensureSeeded } from '@/lib/content/bootstrap';
import { getActivity } from '@/lib/progress/activity';
import { getStudyStats } from '@/lib/progress/study';
import { getExpressionUse, getWritingTrends } from '@/lib/progress/writing';
import { getFeed } from '@/lib/progress/feed';
import { getToday } from '@/lib/progress/today';
import { shiftDay } from '@/lib/progress/days';

const NOW = new Date('2026-11-23T12:00:00Z');
const opts = { now: NOW, tz: 0 };
const LIMIT_MS = 1000;

const at = (daysAgo: number, minute = 0) => {
  const d = new Date(NOW.getTime() - daysAgo * 86_400_000);
  d.setUTCMinutes(minute);
  return d.toISOString();
};

function bigDb(): Db {
  const db = openDb(':memory:');
  migrate(db);
  ensureSeeded(db, path.resolve(__dirname, '../../content'));
  db.transaction(() => {
    for (let i = 0; i < 50; i++) {
      db.run("INSERT INTO notebook_entries (id, kind, text, created_at) VALUES (?, 'custom', ?, ?)", [i + 1, `word${i}`, at(i * 5)]);
      db.run('INSERT INTO srs_cards (entry_id, ease, interval_days, reps, lapses, due_at) VALUES (?, 2.5, ?, ?, 0, ?)', [i + 1, i, i % 3, at(-(i % 10))]);
    }
    for (let i = 0; i < 5000; i++) {
      db.run("INSERT INTO exercise_attempts (exercise_slug, answer_json, correct, created_at) VALUES (?, '{}', ?, ?)", [
        `l1-${(i % 4) + 1}-x`,
        i % 3 === 0 ? 0 : 1,
        at(i % 400, i % 60),
      ]);
      db.run("INSERT INTO review_logs (entry_id, grade, prev_interval, new_interval, reviewed_at) VALUES (?, ?, 0, 1, ?)", [
        (i % 50) + 1,
        ['again', 'hard', 'good', 'easy'][i % 4],
        at(i % 400, (i * 7) % 60),
      ]);
    }
    for (let s = 0; s < 300; s++) {
      const id = db.run('INSERT INTO writing_sessions (mode, title, created_at) VALUES (?, ?, ?)', ['paragraph', `Piece ${s}`, at(s % 400, s % 60)]).lastInsertRowid;
      for (let v = 1; v <= 2; v++) {
        const rid = db.run(
          'INSERT INTO writing_revisions (session_id, version, text, text_hash, word_count, created_at) VALUES (?, ?, ?, ?, 80, ?)',
          [id, v, 'She whispered that the weathered pier was very quiet and the harbour was furious.', `h${s}-${v}`, at(s % 400, s % 60)],
        ).lastInsertRowid;
        for (let k = 0; k < 4 - v; k++) {
          db.run(
            "INSERT INTO feedback_items (revision_id, source, category, key, quote, why, hint1, hint2, hint3) VALUES (?, 'local', 'vocabulary', ?, 'q', 'w', 'a', 'b', 'c')",
            [rid, `vocabulary:word${k}`],
          );
        }
      }
    }
    for (let p = 0; p < 40; p++) {
      db.run("INSERT INTO novel_analyses (excerpt, excerpt_hash, result_json, created_at) VALUES ('p', ?, '{}', ?)", [`h${p}`, at(p)]);
    }
  });
  return db;
}

function timed<T>(label: string, fn: () => T): T {
  const t0 = performance.now();
  const out = fn();
  const ms = performance.now() - t0;
  expect(ms, `${label} took ${Math.round(ms)}ms`).toBeLessThan(LIMIT_MS);
  return out;
}

describe('a large history', () => {
  const db = bigDb();

  it('answers every progress query well inside a second', () => {
    const a = timed('getActivity', () => getActivity(db, opts));
    const s = timed('getStudyStats', () => getStudyStats(db, opts));
    const w = timed('getWritingTrends', () => getWritingTrends(db, opts));
    timed('getExpressionUse', () => getExpressionUse(db));
    const f = timed('getFeed', () => getFeed(db, { tz: 0 }));
    timed('getToday', () => getToday(db, opts));

    expect(a.lifetime.lesson).toBe(5000);
    expect(a.lifetime.review).toBe(5000);
    expect(a.days).toHaveLength(84);
    expect(a.currentStreak).toBeGreaterThan(0);
    expect(s.notebook.cards).toBe(50);
    expect(s.reviews.last30).toBeGreaterThan(0);
    expect(w.totals.sessions).toBe(300);
    expect(w.sessions).toHaveLength(20);
    expect(f.hasMore).toBe(true);
    expect(f.days.flatMap((d) => d.items).length).toBeLessThanOrEqual(60);
  });

  it('pages the feed and never undercounts a day when it cuts', () => {
    const small = getFeed(db, { tz: 0, limit: 5 });
    expect(small.days.flatMap((d) => d.items)).toHaveLength(5);
    const reviewDay = getFeed(db, { tz: 0, type: 'reviews', limit: 1 });
    const item = reviewDay.days[0].items[0];
    expect(item.kind).toBe('reviews');
    // Reviews on the newest day: i % 400 === 0 gives 13 rows (0, 400, ... 4800), so the count must be 13.
    if (item.kind === 'reviews') expect(item.count).toBe(13);
  });

  it('has no NaN or Infinity anywhere in the numbers', () => {
    const all = [getActivity(db, opts), getStudyStats(db, opts), getWritingTrends(db, opts)];
    const bad = (v: unknown): boolean =>
      typeof v === 'number' ? !Number.isFinite(v) : Array.isArray(v) ? v.some(bad) : v && typeof v === 'object' ? Object.values(v).some(bad) : false;
    expect(all.some(bad)).toBe(false);
  });
});

describe('after a content reseed removed lessons, exercises and expressions', () => {
  it('still answers without throwing', () => {
    const db = openDb(':memory:');
    migrate(db); // no content at all
    db.run("INSERT INTO exercise_attempts (exercise_slug, answer_json, correct, created_at) VALUES ('gone', '{}', 1, ?)", [at(1)]);
    db.run("INSERT INTO notebook_entries (id, kind, expression_slug, text, created_at) VALUES (1, 'library', 'removed-word', 'removed', ?)", [at(1)]);
    db.run("INSERT INTO writing_sessions (id, mode, prompt_slug, title, created_at) VALUES (1, 'situation', 'removed-prompt', 'Old', ?)", [at(1)]);
    db.run("INSERT INTO writing_revisions (session_id, version, text, text_hash, word_count, created_at) VALUES (1, 1, 'She whispered.', 'h', 2, ?)", [at(1)]);

    expect(() => getToday(db, opts)).not.toThrow();
    expect(() => getStudyStats(db, opts)).not.toThrow();
    expect(() => getWritingTrends(db, opts)).not.toThrow();
    expect(getExpressionUse(db).libraryWords).toEqual([]);
    const items = getFeed(db, { tz: 0 }).days.flatMap((d) => d.items);
    expect(items.map((i) => i.kind).sort()).toEqual(['lessons', 'notebook', 'writing']);
    expect(shiftDay('2026-11-23', -1)).toBe('2026-11-22');
  });
});
