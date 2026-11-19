import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { getFeed, isFeedType, type FeedItem } from '@/lib/progress/feed';

function setup(): Db {
  const db = openDb(':memory:');
  migrate(db);
  return db;
}

const tz = 0;
let n = 0;
const session = (db: Db, ts: string, title = `Session ${++n}`, mode = 'paragraph', words: number[] = []) => {
  const id = db.run('INSERT INTO writing_sessions (mode, title, created_at) VALUES (?, ?, ?)', [mode, title, ts]).lastInsertRowid;
  words.forEach((w, i) =>
    db.run('INSERT INTO writing_revisions (session_id, version, text, text_hash, word_count, created_at) VALUES (?, ?, ?, ?, ?, ?)', [id, i + 1, 'x', `h${++n}`, w, ts]),
  );
  return id;
};
const attempt = (db: Db, slug: string, correct: number | null, ts: string) =>
  db.run("INSERT INTO exercise_attempts (exercise_slug, answer_json, correct, created_at) VALUES (?, '{}', ?, ?)", [slug, correct, ts]);
const entry = (db: Db) => {
  n++;
  db.run("INSERT INTO notebook_entries (id, kind, text, created_at) VALUES (?, 'custom', ?, '2000-01-01T00:00:00.000Z')", [5000 + n, `w${n}`]);
  return 5000 + n;
};
const review = (db: Db, e: number, grade: string, ts: string) =>
  db.run('INSERT INTO review_logs (entry_id, grade, prev_interval, new_interval, reviewed_at) VALUES (?, ?, 0, 1, ?)', [e, grade, ts]);
const passage = (db: Db, ts: string, title: string | null, excerpt = 'The rain fell on the quiet street.') => {
  n++;
  db.run('INSERT INTO novel_analyses (excerpt, excerpt_hash, source_title, result_json, ai_used, created_at) VALUES (?, ?, ?, ?, 1, ?)', [excerpt, `h${n}`, title, '{}', ts]);
};
function lesson(db: Db, slug: string, title: string, exercises: string[]) {
  const id = db.run("INSERT INTO lessons (slug, lab, title, summary, level, sort, body_json) VALUES (?, 'dialogue', ?, 's', 'beginner', 1, '{}')", [slug, title]).lastInsertRowid;
  exercises.forEach((e, i) =>
    db.run("INSERT INTO exercises (slug, lesson_id, type, level, prompt, payload_json, answer_json, explanation, sort) VALUES (?, ?, 'choose', 'beginner', 'p', '{}', '{}', 'e', ?)", [e, id, i]),
  );
}
const flat = (f: ReturnType<typeof getFeed>): FeedItem[] => f.days.flatMap((d) => d.items);
// The review helper adds an old notebook entry, which is itself feed activity; tests that are not about it drop it.
const withoutNotebook = (f: ReturnType<typeof getFeed>) =>
  f.days.map((d) => ({ ...d, items: d.items.filter((i) => i.kind !== 'notebook') })).filter((d) => d.items.length > 0);

describe('isFeedType', () => {
  it('accepts the five types only', () => {
    for (const t of ['all', 'writing', 'lessons', 'reviews', 'passages']) expect(isFeedType(t)).toBe(true);
    for (const t of ['', 'notebook', 5, null, undefined]) expect(isFeedType(t)).toBe(false);
  });
});

describe('getFeed', () => {
  it('is empty on an empty database', () => {
    expect(getFeed(setup(), { tz })).toEqual({ days: [], hasMore: false });
  });

  it('merges every source newest first and groups by local day', () => {
    const db = setup();
    lesson(db, 'tags', 'Tags and beats', ['t1']);
    session(db, '2026-11-23T09:00:00.000Z', 'Morning piece', 'paragraph', [40]);
    attempt(db, 't1', 1, '2026-11-23T08:00:00.000Z');
    passage(db, '2026-11-22T20:00:00.000Z', 'A book');
    review(db, entry(db), 'good', '2026-11-22T10:00:00.000Z');
    const days = withoutNotebook(getFeed(db, { tz }));
    expect(days.map((d) => d.day)).toEqual(['2026-11-23', '2026-11-22']);
    expect(days[0].items.map((i) => i.kind)).toEqual(['writing', 'lessons']);
    expect(days[1].items.map((i) => i.kind)).toEqual(['passage', 'reviews']);
  });

  it('shows saved notebook words once per day', () => {
    const db = setup();
    for (let i = 0; i < 3; i++) db.run("INSERT INTO notebook_entries (kind, text, created_at) VALUES ('custom', ?, '2026-11-23T10:00:00.000Z')", [`n${i}`]);
    const items = flat(getFeed(db, { tz }));
    expect(items).toEqual([{ kind: 'notebook', count: 3, at: '2026-11-23T10:00:00.000Z' }]);
  });

  it('groups lesson attempts per lesson per day', () => {
    const db = setup();
    lesson(db, 'tags', 'Tags and beats', ['t1', 't2', 't3']);
    attempt(db, 't1', 1, '2026-11-23T08:00:00.000Z');
    attempt(db, 't2', 0, '2026-11-23T08:05:00.000Z');
    attempt(db, 't3', 1, '2026-11-23T08:10:00.000Z');
    attempt(db, 't1', 1, '2026-11-22T08:00:00.000Z');
    const items = flat(getFeed(db, { tz })).filter((i) => i.kind === 'lessons');
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ lessonSlug: 'tags', title: 'Tags and beats', attempts: 3, correct: 2, at: '2026-11-23T08:10:00.000Z' });
    expect(items[1]).toMatchObject({ attempts: 1, correct: 1 });
  });

  it('counts remembered reviews and makes one item per day', () => {
    const db = setup();
    const e = entry(db);
    review(db, e, 'good', '2026-11-23T08:00:00.000Z');
    review(db, e, 'again', '2026-11-23T08:01:00.000Z');
    review(db, e, 'easy', '2026-11-22T08:00:00.000Z');
    const items = flat(getFeed(db, { tz })).filter((i) => i.kind === 'reviews');
    expect(items).toEqual([
      { kind: 'reviews', count: 2, remembered: 1, at: '2026-11-23T08:01:00.000Z' },
      { kind: 'reviews', count: 1, remembered: 1, at: '2026-11-22T08:00:00.000Z' },
    ]);
  });

  it('uses the local day for grouping', () => {
    const db = setup();
    session(db, '2026-11-22T23:30:00.000Z', 'Late');
    expect(getFeed(db, { tz: 60 }).days[0].day).toBe('2026-11-23');
    expect(getFeed(db, { tz: 0 }).days[0].day).toBe('2026-11-22');
  });

  it('filters by type', () => {
    const db = setup();
    session(db, '2026-11-23T09:00:00.000Z');
    attempt(db, 'x', 1, '2026-11-23T08:00:00.000Z');
    passage(db, '2026-11-23T07:00:00.000Z', null);
    review(db, entry(db), 'good', '2026-11-23T06:00:00.000Z');
    for (const [type, kind] of [['writing', 'writing'], ['lessons', 'lessons'], ['reviews', 'reviews'], ['passages', 'passage']] as const) {
      expect(flat(getFeed(db, { tz, type })).map((i) => i.kind), type).toEqual([kind]);
    }
    expect(flat(getFeed(db, { tz, type: 'all' })).length).toBe(5); // plus the notebook entry the review helper created
  });

  it('filters writing by mode and leaves other sources alone', () => {
    const db = setup();
    session(db, '2026-11-23T09:00:00.000Z', 'A', 'creative');
    session(db, '2026-11-23T08:00:00.000Z', 'B', 'paragraph');
    const w = flat(getFeed(db, { tz, type: 'writing', mode: 'creative' }));
    expect(w.map((i) => (i.kind === 'writing' ? i.title : ''))).toEqual(['A']);
  });

  it('lists a writing session that has no versions yet', () => {
    const db = setup();
    session(db, '2026-11-23T09:00:00.000Z', 'Just started');
    expect(flat(getFeed(db, { tz }))[0]).toMatchObject({ kind: 'writing', title: 'Just started', versions: 0, words: 0 });
  });

  it('cuts the list at the limit and says there is more', () => {
    const db = setup();
    for (let i = 1; i <= 5; i++) session(db, `2026-11-0${i}T09:00:00.000Z`, `S${i}`);
    const cut = getFeed(db, { tz, limit: 3 });
    expect(flat(cut).map((i) => (i.kind === 'writing' ? i.title : ''))).toEqual(['S5', 'S4', 'S3']);
    expect(cut.hasMore).toBe(true);
    expect(getFeed(db, { tz, limit: 5 }).hasMore).toBe(false);
  });

  it('uses a fallback label for removed lessons and exercises', () => {
    const db = setup();
    attempt(db, 'removed-exercise', 1, '2026-11-23T08:00:00.000Z');
    expect(flat(getFeed(db, { tz }))[0]).toMatchObject({ kind: 'lessons', lessonSlug: null, title: 'An exercise that is no longer in the library' });
  });

  it('shows a passage with its title or as Untitled, with a short preview', () => {
    const db = setup();
    passage(db, '2026-11-23T09:00:00.000Z', null, 'x'.repeat(200));
    passage(db, '2026-11-23T08:00:00.000Z', 'My book');
    const items = flat(getFeed(db, { tz })).filter((i) => i.kind === 'passage');
    expect(items[0]).toMatchObject({ title: 'Untitled passage', aiUsed: true });
    expect((items[0] as { preview: string }).preview.length).toBeLessThanOrEqual(81);
    expect(items[1]).toMatchObject({ title: 'My book', preview: 'The rain fell on the quiet street.' });
  });

  it('returns titles unchanged (escaping is the page job) and plain objects', () => {
    const db = setup();
    session(db, '2026-11-23T09:00:00.000Z', '<img src=x onerror=alert(1)>');
    const item = flat(getFeed(db, { tz }))[0];
    expect(item).toMatchObject({ title: '<img src=x onerror=alert(1)>' });
    expect(Object.getPrototypeOf(item)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(getFeed(db, { tz }).days[0])).toBe(Object.prototype);
  });

  it('never undercounts a day when it has to stop reading rows', () => {
    const db = setup();
    const e = entry(db);
    for (let i = 0; i < 50; i++) review(db, e, 'good', `2026-11-23T10:${String(i).padStart(2, '0')}:00.000Z`);
    for (let i = 0; i < 50; i++) review(db, e, 'good', `2026-11-22T10:${String(i).padStart(2, '0')}:00.000Z`);
    const f = getFeed(db, { tz, limit: 1 });
    const items = flat(f).filter((i) => i.kind === 'reviews');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ count: 50 });
    expect(f.hasMore).toBe(true);
  });

  it('caps the limit at 300 and ignores nonsense', () => {
    const db = setup();
    session(db, '2026-11-23T09:00:00.000Z');
    expect(flat(getFeed(db, { tz, limit: 100000 })).length).toBe(1);
    expect(flat(getFeed(db, { tz, limit: -5 })).length).toBe(1);
    expect(flat(getFeed(db, { tz, limit: Number.NaN })).length).toBe(1);
  });
});
