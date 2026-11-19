import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { suggestNext, type SuggestInput } from '@/lib/progress/suggest';
import { getToday } from '@/lib/progress/today';

const base: SuggestInput = { dueCards: 0, weakness: null, nextLesson: null, daysSinceWriting: 1, passages: 1, hasActivity: true };
const ids = (i: Partial<SuggestInput>) => suggestNext({ ...base, ...i }).map((s) => s.id);

describe('suggestNext', () => {
  it('orders review, practise, lesson, write, passage and caps at three', () => {
    const all = ids({
      dueCards: 4,
      weakness: { label: 'Overusing “good”', href: '/studio/vocabulary' },
      nextLesson: { title: 'Tags', href: '/labs/dialogue/tags', started: false },
      daysSinceWriting: 10,
      passages: 0,
    });
    expect(all).toEqual(['review', 'practise', 'lesson']);
  });

  it('pluralises the review text', () => {
    expect(suggestNext({ ...base, dueCards: 1 })[0].title).toBe('Review 1 card');
    expect(suggestNext({ ...base, dueCards: 5 })[0].title).toBe('Review 5 cards');
    expect(suggestNext({ ...base, dueCards: 5 })[0].href).toBe('/notebook/review');
  });

  it('says Continue for a started lesson and Start for a new one', () => {
    const lesson = (started: boolean) => suggestNext({ ...base, nextLesson: { title: 'Tags', href: '/labs/dialogue/tags', started } })[0];
    expect(lesson(true).title).toBe('Continue: Tags');
    expect(lesson(false).title).toBe('Start: Tags');
    expect(lesson(true).href).toBe('/labs/dialogue/tags');
  });

  it('suggests writing when there has been none or none for 7 days, not when it was recent', () => {
    expect(ids({ daysSinceWriting: null })).toContain('write');
    expect(ids({ daysSinceWriting: 7 })).toContain('write');
    expect(ids({ daysSinceWriting: 3 })).not.toContain('write');
  });

  it('suggests the novel lab only to someone with some activity and no passages', () => {
    expect(ids({ passages: 0, hasActivity: true })).toContain('passage');
    expect(ids({ passages: 0, hasActivity: false })).not.toContain('passage');
    expect(ids({ passages: 2 })).not.toContain('passage');
  });

  it('adds Explore only as a filler when fewer than two other suggestions exist', () => {
    expect(ids({})).toEqual(['explore']);
    expect(ids({ dueCards: 2 })).toEqual(['review', 'explore']);
    expect(ids({ dueCards: 2, daysSinceWriting: null })).toEqual(['review', 'write']);
  });

  it('gives a brand-new learner a lesson, a first piece of writing and Explore', () => {
    const r = suggestNext({
      dueCards: 0,
      weakness: null,
      nextLesson: { title: 'What dialogue tags do', href: '/labs/dialogue/what-dialogue-tags-do', started: false },
      daysSinceWriting: null,
      passages: 0,
      hasActivity: false,
    });
    expect(r.map((s) => s.id)).toEqual(['lesson', 'write']);
  });

  it('every suggestion has a title, text and an internal link', () => {
    const r = suggestNext({
      dueCards: 3,
      weakness: { label: 'x', href: '/studio' },
      nextLesson: { title: 't', href: '/labs/dialogue/a', started: true },
      daysSinceWriting: 9,
      passages: 0,
      hasActivity: true,
    });
    for (const s of r) {
      expect(s.title.length).toBeGreaterThan(3);
      expect(s.text.length).toBeGreaterThan(3);
      expect(s.href.startsWith('/')).toBe(true);
    }
  });
});

const NOW = new Date('2026-11-23T12:00:00Z');
const opts = { now: NOW, tz: 0 };

function setup(): Db {
  const db = openDb(':memory:');
  migrate(db);
  return db;
}

function lesson(db: Db, slug: string, lab: 'dialogue' | 'sentence', sort: number, exercises: string[]) {
  const id = db.run("INSERT INTO lessons (slug, lab, title, summary, level, sort, body_json) VALUES (?, ?, ?, 's', 'beginner', ?, '{}')", [slug, lab, `Lesson ${slug}`, sort]).lastInsertRowid;
  exercises.forEach((e, i) =>
    db.run("INSERT INTO exercises (slug, lesson_id, type, level, prompt, payload_json, answer_json, explanation, sort) VALUES (?, ?, 'choose', 'beginner', 'p', '{}', '{}', 'e', ?)", [e, id, i]),
  );
}
const attempt = (db: Db, slug: string, correct: number, ts: string) =>
  db.run("INSERT INTO exercise_attempts (exercise_slug, answer_json, correct, created_at) VALUES (?, '{}', ?, ?)", [slug, correct, ts]);

describe('getToday', () => {
  it('on an empty database returns 7 week entries, nothing due and a suggestion', () => {
    const t = getToday(setup(), opts);
    expect(t.week).toHaveLength(7);
    expect(t.week[6].day).toBe('2026-11-23');
    expect(t.dueCards).toBe(0);
    expect(t.suggestions.length).toBeGreaterThanOrEqual(1);
    expect(t.activity.currentStreak).toBe(0);
  });

  it('puts review first when a card is due', () => {
    const db = setup();
    db.run("INSERT INTO notebook_entries (id, kind, text) VALUES (1, 'custom', 'word')");
    db.run("INSERT INTO srs_cards (entry_id, ease, interval_days, reps, lapses, due_at) VALUES (1, 2.5, 3, 2, 0, '2026-11-20T00:00:00.000Z')");
    const t = getToday(db, opts);
    expect(t.dueCards).toBe(1);
    expect(t.suggestions[0].id).toBe('review');
  });

  it('offers practice with a real link for a repeated weakness', () => {
    const db = setup();
    db.run("INSERT INTO weakness_stats (category, key, count, last_seen) VALUES ('vocabulary', 'vocabulary:very', 4, ?)", [new Date().toISOString()]);
    const s = getToday(db, opts).suggestions.find((x) => x.id === 'practise');
    expect(s?.title).toContain('“very”');
    expect(s?.href).toBe('/studio/vocabulary');
  });

  it('continues the lesson with the latest attempt that is not finished', () => {
    const db = setup();
    lesson(db, 'old', 'dialogue', 1, ['o1', 'o2']);
    lesson(db, 'recent', 'sentence', 2, ['r1', 'r2']);
    lesson(db, 'finished', 'dialogue', 3, ['f1']);
    attempt(db, 'o1', 1, '2026-11-01T10:00:00.000Z');
    attempt(db, 'r1', 1, '2026-11-22T10:00:00.000Z');
    attempt(db, 'f1', 1, '2026-11-23T10:00:00.000Z');
    const s = getToday(db, opts).suggestions.find((x) => x.id === 'lesson');
    expect(s?.title).toBe('Continue: Lesson recent');
    expect(s?.href).toBe('/labs/sentences/recent');
  });

  it('starts the first dialogue lesson for a learner who has not begun, then the sentence lab', () => {
    const db = setup();
    lesson(db, 'sent', 'sentence', 1, ['s1']);
    lesson(db, 'dia', 'dialogue', 1, ['d1']);
    expect(getToday(db, opts).suggestions.find((x) => x.id === 'lesson')?.href).toBe('/labs/dialogue/dia');
    attempt(db, 'd1', 1, '2026-11-22T10:00:00.000Z');
    // The dialogue lesson is finished, so the next not-done lesson is the sentence one, and it is new.
    const s = getToday(db, opts).suggestions.find((x) => x.id === 'lesson');
    expect(s?.title).toBe('Start: Lesson sent');
  });

  it('does not suggest writing when something was written yesterday', () => {
    const db = setup();
    db.run("INSERT INTO writing_sessions (id, mode, title, created_at) VALUES (1, 'paragraph', 't', '2026-11-22T10:00:00.000Z')");
    db.run("INSERT INTO writing_revisions (session_id, version, text, text_hash, word_count, created_at) VALUES (1, 1, 'x', 'h', 1, '2026-11-22T10:00:00.000Z')");
    expect(getToday(db, opts).suggestions.map((s) => s.id)).not.toContain('write');
  });
});
