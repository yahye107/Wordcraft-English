import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { getActivity } from '@/lib/progress/activity';

const NOW = new Date('2026-11-23T12:00:00Z');
const opts = { now: NOW, tz: 0 };

function setup(): Db {
  const db = openDb(':memory:');
  migrate(db);
  return db;
}

let n = 0;
const at = (day: string, time = '10:00:00') => `${day}T${time}.000Z`;
const lesson = (db: Db, ts: string) =>
  db.run("INSERT INTO exercise_attempts (exercise_slug, answer_json, correct, created_at) VALUES ('x', '{}', 1, ?)", [ts]);
const review = (db: Db, ts: string) => {
  n++;
  db.run("INSERT INTO notebook_entries (id, kind, text, created_at) VALUES (?, 'custom', ?, '2000-01-01T00:00:00.000Z')", [1000 + n, `w${n}`]);
  db.run("INSERT INTO review_logs (entry_id, grade, prev_interval, new_interval, reviewed_at) VALUES (?, 'good', 0, 1, ?)", [1000 + n, ts]);
};
const writing = (db: Db, ts: string) => {
  n++;
  db.run("INSERT INTO writing_sessions (id, mode, title, created_at) VALUES (?, 'paragraph', 't', ?)", [2000 + n, ts]);
  db.run("INSERT INTO writing_revisions (session_id, version, text, text_hash, word_count, created_at) VALUES (?, 1, 'x', ?, 1, ?)", [2000 + n, `h${n}`, ts]);
};
const passage = (db: Db, ts: string) => {
  n++;
  db.run("INSERT INTO novel_analyses (excerpt, excerpt_hash, result_json, created_at) VALUES ('p', ?, '{}', ?)", [`h${n}`, ts]);
};
const notebook = (db: Db, ts: string) => {
  n++;
  db.run("INSERT INTO notebook_entries (kind, text, created_at) VALUES ('custom', ?, ?)", [`nb${n}`, ts]);
};

describe('getActivity', () => {
  it('is all zeros on an empty database, with no NaN', () => {
    const a = getActivity(setup(), opts);
    expect(a.days).toHaveLength(84);
    expect(a.days[83].day).toBe('2026-11-23');
    expect(a.days[0].day).toBe('2026-09-01');
    expect(a).toMatchObject({ today: 0, currentStreak: 0, longestStreak: 0, activeDays7: 0, activeDays30: 0, firstDay: null });
    expect(Object.values(a.lifetime).every((v) => v === 0)).toBe(true);
    expect(a.days.every((d) => d.total === 0)).toBe(true);
  });

  it('counts one row of each kind today', () => {
    const db = setup();
    const t = at('2026-11-23');
    lesson(db, t);
    review(db, t);
    writing(db, t);
    passage(db, t);
    notebook(db, t);
    const a = getActivity(db, opts);
    expect(a.days[83].byKind).toEqual({ lesson: 1, review: 1, writing: 1, passage: 1, notebook: 1 });
    expect(a.today).toBe(5);
    expect(a.days[83].total).toBe(5);
  });

  it('puts 23:30 and 00:30 local on different days', () => {
    const db = setup();
    lesson(db, '2026-11-22T22:30:00.000Z'); // 23:30 on the 22nd at +60
    lesson(db, '2026-11-22T23:30:00.000Z'); // 00:30 on the 23rd at +60
    const a = getActivity(db, { now: NOW, tz: 60 });
    expect(a.days[82].total).toBe(1);
    expect(a.days[83].total).toBe(1);
  });

  it('counts a streak of consecutive days ending today', () => {
    const db = setup();
    for (const d of ['2026-11-23', '2026-11-22', '2026-11-21']) lesson(db, at(d));
    const a = getActivity(db, opts);
    expect(a.currentStreak).toBe(3);
    expect(a.longestStreak).toBe(3);
  });

  it('keeps the streak when today is still empty, and breaks it after a full empty day', () => {
    const db = setup();
    lesson(db, at('2026-11-22'));
    lesson(db, at('2026-11-21'));
    expect(getActivity(db, opts).currentStreak).toBe(2);

    const db2 = setup();
    lesson(db2, at('2026-11-21'));
    lesson(db2, at('2026-11-20'));
    expect(getActivity(db2, opts).currentStreak).toBe(0);
  });

  it('finds an older run longer than the current one', () => {
    const db = setup();
    for (const d of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-11-23']) lesson(db, at(d));
    const a = getActivity(db, opts);
    expect(a.currentStreak).toBe(1);
    expect(a.longestStreak).toBe(4);
  });

  it('ignores rows dated in the future', () => {
    const db = setup();
    lesson(db, at('2026-11-24'));
    lesson(db, at('2027-05-01'));
    const a = getActivity(db, opts);
    expect(a.today).toBe(0);
    expect(a.currentStreak).toBe(0);
    expect(a.lifetime.lesson).toBe(2);
  });

  it('counts lifetime rows older than the window and finds the first day', () => {
    const db = setup();
    lesson(db, at('2024-02-01'));
    lesson(db, at('2026-11-23'));
    const a = getActivity(db, opts);
    expect(a.lifetime.lesson).toBe(2);
    expect(a.firstDay).toBe('2024-02-01');
    expect(a.days.reduce((s, d) => s + d.total, 0)).toBe(1);
  });

  it('counts active days over the last 7 and 30 days', () => {
    const db = setup();
    for (const d of ['2026-11-23', '2026-11-20', '2026-11-17', '2026-10-30', '2026-10-20']) lesson(db, at(d));
    lesson(db, at('2026-11-20', '12:00:00'));
    const a = getActivity(db, opts);
    expect(a.activeDays7).toBe(3); // the 23rd, 20th and 17th are inside the last 7 days (17th to 23rd)
    expect(a.activeDays30).toBe(4); // 23 Nov, 20 Nov, 17 Nov and 30 Oct; 20 Oct is too old
  });

  it('honours a custom window length', () => {
    expect(getActivity(setup(), { ...opts, days: 7 }).days).toHaveLength(7);
  });
});
