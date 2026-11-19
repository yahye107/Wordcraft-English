import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { loadContent } from '@/lib/content/load';
import { seedContent } from '@/lib/content/seed';
import { makeContentDir, CATEGORIES_YAML, expressionYaml } from './helpers';
import { lessonYaml, exerciseYaml } from './lesson-helpers';

const BASE: Record<string, string> = {
  'categories.yaml': CATEGORIES_YAML,
  'expressions/sadness/crestfallen.yaml': expressionYaml(),
  'lessons/dialogue/what-tags-do.yaml': lessonYaml(),
  'exercises/dialogue/ex-choose.yaml': exerciseYaml('choose'),
  'exercises/dialogue/ex-fill.yaml': exerciseYaml('fill_blank', { slug: 'ex-fill' }),
  'exercises/dialogue/ex-free.yaml': exerciseYaml('free_write'),
};

function bundleOf(files: Record<string, string>) {
  const { bundle, errors } = loadContent(makeContentDir(files));
  expect(errors).toEqual([]);
  return bundle;
}

function setup(): Db {
  const db = openDb(':memory:');
  migrate(db);
  return db;
}

const n = (db: Db, t: string) => db.get<{ n: number }>(`SELECT COUNT(*) n FROM ${t}`)!.n;

describe('seeding lessons and exercises', () => {
  it('migration 3 creates lessons, exercises and exercise_attempts', () => {
    const db = setup();
    const names = db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table'").map((r) => r.name);
    for (const t of ['lessons', 'exercises', 'exercise_attempts']) expect(names).toContain(t);
  });

  it('seeding twice leaves the same lesson and exercise counts', () => {
    const db = setup();
    const b = bundleOf(BASE);
    seedContent(db, b);
    seedContent(db, b);
    expect(n(db, 'lessons')).toBe(1);
    expect(n(db, 'exercises')).toBe(3);
  });

  it('editing an exercise updates it in place', () => {
    const db = setup();
    seedContent(db, bundleOf(BASE));
    const id = db.get<{ id: number }>("SELECT id FROM exercises WHERE slug='ex-choose'")!.id;
    seedContent(db, bundleOf({ ...BASE, 'exercises/dialogue/ex-choose.yaml': exerciseYaml('choose', { prompt: 'New prompt.' }) }));
    const row = db.get<{ id: number; prompt: string }>("SELECT id, prompt FROM exercises WHERE slug='ex-choose'")!;
    expect(row.prompt).toBe('New prompt.');
    expect(row.id).toBe(id);
  });

  it('removing an exercise from the bundle deletes it', () => {
    const db = setup();
    seedContent(db, bundleOf(BASE));
    const { 'exercises/dialogue/ex-free.yaml': _x, ...rest } = BASE;
    void _x;
    seedContent(db, bundleOf(rest));
    expect(n(db, 'exercises')).toBe(2);
  });

  it('removing a lesson deletes its exercises', () => {
    const db = setup();
    seedContent(db, bundleOf(BASE));
    seedContent(db, bundleOf({ 'categories.yaml': CATEGORIES_YAML, 'expressions/sadness/crestfallen.yaml': expressionYaml() }));
    expect(n(db, 'lessons')).toBe(0);
    expect(n(db, 'exercises')).toBe(0);
  });

  it('attempts survive editing and deleting the exercise they point at', () => {
    const db = setup();
    seedContent(db, bundleOf(BASE));
    db.run("INSERT INTO exercise_attempts (exercise_slug, answer_json, correct) VALUES ('ex-choose', '{\"choice\":0}', 1)");
    seedContent(db, bundleOf({ ...BASE, 'exercises/dialogue/ex-choose.yaml': exerciseYaml('choose', { prompt: 'Edited.' }) }));
    const { 'exercises/dialogue/ex-choose.yaml': _c, ...rest } = BASE;
    void _c;
    seedContent(db, bundleOf(rest));
    expect(n(db, 'exercises')).toBe(2);
    expect(db.all('SELECT exercise_slug, correct FROM exercise_attempts')).toEqual([{ exercise_slug: 'ex-choose', correct: 1 }]);
  });

  it('keeps the answer out of payload_json and in answer_json', () => {
    const db = setup();
    seedContent(db, bundleOf(BASE));
    const row = db.get<{ payload_json: string; answer_json: string }>("SELECT payload_json, answer_json FROM exercises WHERE slug='ex-choose'")!;
    expect(JSON.parse(row.payload_json)).toEqual({ options: ['she said', 'she smiled'] });
    expect(JSON.parse(row.answer_json)).toEqual({ answer: 0 });
    const fill = db.get<{ payload_json: string; answer_json: string }>("SELECT payload_json, answer_json FROM exercises WHERE slug='ex-fill'")!;
    expect(fill.payload_json).not.toContain('said');
    expect(JSON.parse(fill.answer_json)).toEqual({ accepted: ['said'] });
  });

  it('stores the lesson body with sections and related slugs', () => {
    const db = setup();
    seedContent(db, bundleOf({ ...BASE, 'lessons/dialogue/what-tags-do.yaml': lessonYaml({ related: ['crestfallen'] }) }));
    const row = db.get<{ body_json: string; sort: number }>("SELECT body_json, sort FROM lessons WHERE slug='what-tags-do'")!;
    const body = JSON.parse(row.body_json);
    expect(body.sections).toHaveLength(2);
    expect(body.related).toEqual(['crestfallen']);
    expect(row.sort).toBe(1);
  });
});
