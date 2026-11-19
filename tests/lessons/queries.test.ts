import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { loadContent } from '@/lib/content/load';
import { seedContent } from '@/lib/content/seed';
import { listLessons, getLesson } from '@/lib/lessons/queries';
import { submitAnswer } from '@/lib/lessons/submit';
import { makeContentDir, CATEGORIES_YAML, expressionYaml } from '../content/helpers';
import { lessonYaml, exerciseYaml } from '../content/lesson-helpers';

function seeded(): Db {
  const { bundle, errors } = loadContent(
    makeContentDir({
      'categories.yaml': CATEGORIES_YAML,
      'expressions/sadness/crestfallen.yaml': expressionYaml(),
      'expressions/sadness/draftword.yaml': expressionYaml({ slug: 'draftword', text: 'draftword', status: 'draft', examples: [] }),
      'lessons/dialogue/what-tags-do.yaml': lessonYaml({ related: ['crestfallen', 'draftword'] }),
      'lessons/dialogue/tags-and-beats.yaml': lessonYaml({ slug: 'tags-and-beats', title: 'Tags and beats', sort: 2 }),
      'lessons/dialogue/zz-later.yaml': lessonYaml({ slug: 'zz-later', title: 'Later', sort: 3 }),
      'exercises/dialogue/ex-choose.yaml': exerciseYaml('choose'),
      'exercises/dialogue/ex-fill.yaml': exerciseYaml('fill_blank', { slug: 'ex-fill' }),
      'exercises/dialogue/ex-free.yaml': exerciseYaml('free_write', { slug: 'ex-free' }),
      'exercises/dialogue/ex-other.yaml': exerciseYaml('choose', { slug: 'ex-other', lesson: 'tags-and-beats' }),
    }),
  );
  expect(errors).toEqual([]);
  const db = openDb(':memory:');
  migrate(db);
  seedContent(db, bundle);
  return db;
}

describe('listLessons', () => {
  it('returns lessons in order with exercise and done counts', () => {
    const db = seeded();
    const list = listLessons(db, 'dialogue');
    expect(list.map((l) => l.slug)).toEqual(['what-tags-do', 'tags-and-beats', 'zz-later']);
    expect(list[0]).toMatchObject({ exerciseCount: 3, doneCount: 0 });
    expect(list[2].exerciseCount).toBe(0);
    submitAnswer(db, 'ex-choose', { choice: 0 });
    expect(listLessons(db, 'dialogue')[0].doneCount).toBe(1);
  });

  it('returns nothing for a lab with no lessons', () => {
    expect(listLessons(seeded(), 'sentence')).toEqual([]);
  });
});

describe('getLesson', () => {
  it('returns sections, related expressions and exercises without answers', () => {
    const l = getLesson(seeded(), 'what-tags-do')!;
    expect(l.sections).toHaveLength(2);
    expect(l.related).toEqual([{ slug: 'crestfallen', text: 'crestfallen' }]); // the draft is left out
    expect(l.exercises.map((e) => e.slug)).toEqual(['ex-choose', 'ex-fill', 'ex-free']);
    const json = JSON.stringify(l.exercises);
    expect(json).not.toContain('"answer"');
    expect(json).not.toContain('accepted');
    expect(json).not.toContain('Sample.');
  });

  it('returns undefined for an unknown slug', () => {
    expect(getLesson(seeded(), 'nope')).toBeUndefined();
  });

  it('gives previous and next lessons in order', () => {
    const db = seeded();
    const mid = getLesson(db, 'tags-and-beats')!;
    expect(mid.prev?.slug).toBe('what-tags-do');
    expect(mid.next?.slug).toBe('zz-later');
    expect(getLesson(db, 'what-tags-do')!.prev).toBeUndefined();
    expect(getLesson(db, 'zz-later')!.next).toBeUndefined();
  });

  it('counts an exercise once after a wrong then a right attempt', () => {
    const db = seeded();
    submitAnswer(db, 'ex-choose', { choice: 1 });
    expect(getLesson(db, 'what-tags-do')!.exercises[0].done).toBe(false);
    submitAnswer(db, 'ex-choose', { choice: 0 });
    submitAnswer(db, 'ex-choose', { choice: 0 });
    const l = getLesson(db, 'what-tags-do')!;
    expect(l.exercises[0].done).toBe(true);
    expect(listLessons(db, 'dialogue')[0].doneCount).toBe(1);
  });

  it('counts a free_write as done after one saved answer', () => {
    const db = seeded();
    submitAnswer(db, 'ex-free', { text: 'My line.' });
    expect(getLesson(db, 'what-tags-do')!.exercises[2].done).toBe(true);
  });
});

describe('submitAnswer', () => {
  it('stores an attempt for a valid answer and returns the result', () => {
    const db = seeded();
    const r = submitAnswer(db, 'ex-choose', { choice: 0 });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, correct: true });
    expect(db.all('SELECT exercise_slug, correct FROM exercise_attempts')).toEqual([{ exercise_slug: 'ex-choose', correct: 1 }]);
  });

  it('stores a free_write attempt with correct null', () => {
    const db = seeded();
    submitAnswer(db, 'ex-free', { text: 'Hello.' });
    expect(db.all('SELECT correct FROM exercise_attempts')).toEqual([{ correct: null }]);
  });

  it('returns 400 and stores nothing for an invalid answer', () => {
    const db = seeded();
    const r = submitAnswer(db, 'ex-choose', { choice: 99 });
    expect(r.status).toBe(400);
    expect(r.body.ok).toBe(false);
    expect(db.get<{ n: number }>('SELECT COUNT(*) n FROM exercise_attempts')!.n).toBe(0);
  });

  it('returns 404 for an unknown exercise and stores nothing', () => {
    const db = seeded();
    const r = submitAnswer(db, 'ghost', { choice: 0 });
    expect(r.status).toBe(404);
    expect(db.get<{ n: number }>('SELECT COUNT(*) n FROM exercise_attempts')!.n).toBe(0);
  });
});

describe('two labs', () => {
  function twoLabs(): Db {
    const { bundle, errors } = loadContent(
      makeContentDir({
        'categories.yaml': CATEGORIES_YAML,
        'expressions/sadness/crestfallen.yaml': expressionYaml(),
        'lessons/dialogue/d1.yaml': lessonYaml({ slug: 'd1', title: 'D1', sort: 1 }),
        'lessons/dialogue/d2.yaml': lessonYaml({ slug: 'd2', title: 'D2', sort: 2 }),
        'lessons/sentences/s1.yaml': lessonYaml({ slug: 's1', title: 'S1', lab: 'sentence', sort: 1 }),
        'lessons/sentences/s2.yaml': lessonYaml({ slug: 's2', title: 'S2', lab: 'sentence', sort: 2 }),
        'exercises/dialogue/e1.yaml': exerciseYaml('choose', { slug: 'e1', lesson: 'd1' }),
        'exercises/sentences/e2.yaml': exerciseYaml('choose', { slug: 'e2', lesson: 's1' }),
        'exercises/sentences/e3.yaml': exerciseYaml('choose', { slug: 'e3', lesson: 's1' }),
      }),
    );
    expect(errors).toEqual([]);
    const db = openDb(':memory:');
    migrate(db);
    seedContent(db, bundle);
    return db;
  }

  it("listLessons keeps each lab's lessons and counts apart", () => {
    const db = twoLabs();
    const d = listLessons(db, 'dialogue');
    const s = listLessons(db, 'sentence');
    expect(d.map((l) => l.slug)).toEqual(['d1', 'd2']);
    expect(s.map((l) => l.slug)).toEqual(['s1', 's2']);
    expect(d[0].exerciseCount).toBe(1);
    expect(s[0].exerciseCount).toBe(2);
    submitAnswer(db, 'e2', { choice: 0 });
    expect(listLessons(db, 'dialogue')[0].doneCount).toBe(0);
    expect(listLessons(db, 'sentence')[0].doneCount).toBe(1);
  });

  it('prev and next stay inside the lab', () => {
    const db = twoLabs();
    expect(getLesson(db, 's2')!.next).toBeUndefined();
    expect(getLesson(db, 's2')!.prev?.slug).toBe('s1');
    expect(getLesson(db, 'd1')!.prev).toBeUndefined();
    expect(getLesson(db, 'd1')!.next?.slug).toBe('d2');
    expect(getLesson(db, 's1')!.lab).toBe('sentence');
  });
});
