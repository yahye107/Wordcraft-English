import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { getStudyStats } from '@/lib/progress/study';

const NOW = new Date('2026-11-23T12:00:00Z');
const opts = { now: NOW, tz: 0 };

function setup(): Db {
  const db = openDb(':memory:');
  migrate(db);
  return db;
}

const allFinite = (v: unknown): boolean =>
  typeof v === 'number' ? Number.isFinite(v) : Array.isArray(v) ? v.every(allFinite) : v && typeof v === 'object' ? Object.values(v).every(allFinite) : true;

let n = 0;
function card(db: Db, c: { reps: number; interval: number; due: string }) {
  n++;
  db.run("INSERT INTO notebook_entries (id, kind, text) VALUES (?, 'custom', ?)", [n, `w${n}`]);
  db.run('INSERT INTO srs_cards (entry_id, ease, interval_days, reps, lapses, due_at) VALUES (?, 2.5, ?, ?, 0, ?)', [n, c.interval, c.reps, c.due]);
  return n;
}
const review = (db: Db, entry: number, grade: string, ts: string) =>
  db.run('INSERT INTO review_logs (entry_id, grade, prev_interval, new_interval, reviewed_at) VALUES (?, ?, 0, 1, ?)', [entry, grade, ts]);

function lesson(db: Db, slug: string, lab: 'dialogue' | 'sentence', exercises: string[]) {
  const id = db.run(
    "INSERT INTO lessons (slug, lab, title, summary, level, sort, body_json) VALUES (?, ?, ?, 's', 'beginner', 1, '{}')",
    [slug, lab, `Lesson ${slug}`],
  ).lastInsertRowid;
  exercises.forEach((e, i) =>
    db.run(
      "INSERT INTO exercises (slug, lesson_id, type, level, prompt, payload_json, answer_json, explanation, sort) VALUES (?, ?, 'choose', 'beginner', 'p', '{}', '{}', 'e', ?)",
      [e, id, i],
    ),
  );
}
const attempt = (db: Db, slug: string, correct: number | null, ts = '2026-11-22T10:00:00.000Z') =>
  db.run("INSERT INTO exercise_attempts (exercise_slug, answer_json, correct, created_at) VALUES (?, '{}', ?, ?)", [slug, correct, ts]);

describe('getStudyStats: empty', () => {
  it('is all zeros with null rates', () => {
    const s = getStudyStats(setup(), opts);
    expect(s.notebook).toEqual({ entries: 0, cards: 0, fresh: 0, learning: 0, mature: 0, dueNow: 0, dueNext7: [0, 0, 0, 0, 0, 0, 0] });
    expect(s.reviews).toMatchObject({ last30: 0, remembered: 0, rate: null });
    expect(s.reviews.perDay).toHaveLength(30);
    expect(s.accuracy).toEqual({ attempts30: 0, correct30: 0, rate: null });
    expect(s.passages).toBe(0);
    expect(s.labs.map((l) => [l.lab, l.lessons, l.lessonsDone, l.exercises, l.exercisesDone])).toEqual([
      ['dialogue', 0, 0, 0, 0],
      ['sentence', 0, 0, 0, 0],
    ]);
    expect(allFinite(s)).toBe(true);
  });
});

describe('cards', () => {
  it('classifies fresh, learning and mature around the 21-day boundary', () => {
    const db = setup();
    card(db, { reps: 0, interval: 0, due: '2026-11-23T00:00:00.000Z' });
    card(db, { reps: 3, interval: 20, due: '2026-12-10T00:00:00.000Z' });
    card(db, { reps: 5, interval: 21, due: '2026-12-10T00:00:00.000Z' });
    const s = getStudyStats(db, opts).notebook;
    expect(s).toMatchObject({ entries: 3, cards: 3, fresh: 1, learning: 1, mature: 1 });
  });

  it('counts due now and the next seven local days, with overdue cards in today', () => {
    const db = setup();
    card(db, { reps: 2, interval: 5, due: '2026-11-10T00:00:00.000Z' }); // overdue
    card(db, { reps: 2, interval: 5, due: '2026-11-23T09:00:00.000Z' }); // earlier today
    card(db, { reps: 2, interval: 5, due: '2026-11-23T18:00:00.000Z' }); // later today
    card(db, { reps: 2, interval: 5, due: '2026-11-26T08:00:00.000Z' }); // in 3 days
    card(db, { reps: 2, interval: 5, due: '2026-12-25T08:00:00.000Z' }); // far away
    const s = getStudyStats(db, opts).notebook;
    expect(s.dueNow).toBe(2);
    expect(s.dueNext7).toEqual([3, 0, 0, 1, 0, 0, 0]);
  });

  it('counts entries without a card in entries but not in cards', () => {
    const db = setup();
    db.run("INSERT INTO notebook_entries (kind, text) VALUES ('custom', 'lonely')");
    const s = getStudyStats(db, opts).notebook;
    expect(s).toMatchObject({ entries: 1, cards: 0 });
  });
});

describe('reviews', () => {
  it('computes the remembered rate over the last 30 days only', () => {
    const db = setup();
    const e = card(db, { reps: 2, interval: 5, due: '2026-12-01T00:00:00.000Z' });
    review(db, e, 'good', '2026-11-22T10:00:00.000Z');
    review(db, e, 'easy', '2026-11-22T11:00:00.000Z');
    review(db, e, 'hard', '2026-11-21T10:00:00.000Z');
    review(db, e, 'good', '2026-11-20T10:00:00.000Z');
    review(db, e, 'again', '2026-09-01T10:00:00.000Z'); // too old
    const r = getStudyStats(db, opts).reviews;
    expect(r.last30).toBe(4);
    expect(r.remembered).toBe(3);
    expect(r.rate).toBe(0.75);
    expect(r.perDay[29]).toBe(0); // today
    expect(r.perDay[28]).toBe(2); // yesterday
    expect(r.perDay[27]).toBe(1);
    expect(r.perDay[26]).toBe(1);
  });
});

describe('labs and accuracy', () => {
  it('counts lessons done only when every exercise is done', () => {
    const db = setup();
    lesson(db, 'a', 'dialogue', ['a1', 'a2']);
    lesson(db, 'b', 'dialogue', ['b1', 'b2']);
    lesson(db, 'empty', 'dialogue', []);
    lesson(db, 's1', 'sentence', ['s1a']);
    attempt(db, 'a1', 1);
    attempt(db, 'a2', 1);
    attempt(db, 'b1', 1);
    attempt(db, 'b2', 0); // wrong, not done
    attempt(db, 's1a', null); // a free-write attempt counts as done
    const labs = getStudyStats(db, opts).labs;
    expect(labs[0]).toMatchObject({ lab: 'dialogue', label: 'Dialogue and narration', lessons: 3, lessonsDone: 1, exercises: 4, exercisesDone: 3 });
    expect(labs[1]).toMatchObject({ lab: 'sentence', label: 'Sentence construction', lessons: 1, lessonsDone: 1, exercises: 1, exercisesDone: 1 });
  });

  it('accuracy ignores free-write attempts and attempts older than 30 days', () => {
    const db = setup();
    attempt(db, 'x', 1);
    attempt(db, 'x', 0);
    attempt(db, 'x', 1);
    attempt(db, 'x', null);
    attempt(db, 'x', 1, '2026-08-01T10:00:00.000Z');
    const a = getStudyStats(db, opts).accuracy;
    expect(a).toMatchObject({ attempts30: 3, correct30: 2 });
    expect(a.rate).toBeCloseTo(2 / 3, 3);
  });

  it('an attempt whose exercise no longer exists does not throw or change the lab counts', () => {
    const db = setup();
    lesson(db, 'a', 'dialogue', ['a1']);
    attempt(db, 'gone-exercise', 1);
    const s = getStudyStats(db, opts);
    expect(s.labs[0]).toMatchObject({ lessons: 1, lessonsDone: 0 });
    expect(s.accuracy.attempts30).toBe(1);
  });

  it('counts stored passages', () => {
    const db = setup();
    db.run("INSERT INTO novel_analyses (excerpt, excerpt_hash, result_json) VALUES ('p', 'h', '{}')");
    expect(getStudyStats(db, opts).passages).toBe(1);
  });
});
