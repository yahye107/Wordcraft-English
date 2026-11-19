import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { loadContent } from '@/lib/content/load';
import { seedContent } from '@/lib/content/seed';
import { makeContentDir, CATEGORIES_YAML, expressionYaml } from './helpers';

export const promptYaml = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    slug: 'late-train',
    mode: 'situation',
    kind: 'scene',
    title: 'The late train',
    situation: 'You are standing on a cold platform. The train is forty minutes late and nobody has said why.',
    constraints: ['Use at least one sensory detail.'],
    try: ['crestfallen'],
    level: 'intermediate',
    ...over,
  });

const BASE: Record<string, string> = {
  'categories.yaml': CATEGORIES_YAML,
  'expressions/sadness/crestfallen.yaml': expressionYaml(),
  'prompts/situation/late-train.yaml': promptYaml(),
};

const errorsOf = (files: Record<string, string>) => loadContent(makeContentDir({ ...BASE, ...files })).errors;

function seeded(files: Record<string, string>): Db {
  const { bundle, errors } = loadContent(makeContentDir(files));
  expect(errors).toEqual([]);
  const db = openDb(':memory:');
  migrate(db);
  seedContent(db, bundle);
  return db;
}
const count = (db: Db) => db.get<{ n: number }>('SELECT COUNT(*) n FROM writing_prompts')!.n;

describe('writing prompts', () => {
  it('a valid prompt loads', () => {
    const { bundle, errors } = loadContent(makeContentDir(BASE));
    expect(errors).toEqual([]);
    expect(bundle.prompts).toHaveLength(1);
  });

  it('an unknown mode is an error', () => {
    expect(errorsOf({ 'prompts/situation/late-train.yaml': promptYaml({ mode: 'poetry' }) }).length).toBeGreaterThan(0);
  });

  it('an unknown try expression is an error naming it', () => {
    const e = errorsOf({ 'prompts/situation/late-train.yaml': promptYaml({ try: ['ghost-word'] }) });
    expect(e.some((x) => x.message.includes('ghost-word'))).toBe(true);
  });

  it('a duplicate prompt slug names both files', () => {
    const e = errorsOf({ 'prompts/situation/copy.yaml': promptYaml() });
    const dup = e.find((x) => /duplicate/i.test(x.message));
    expect(dup?.message).toContain('late-train.yaml');
    expect(dup?.message).toContain('copy.yaml');
  });

  it('more than 5 constraints is an error', () => {
    const e = errorsOf({ 'prompts/situation/late-train.yaml': promptYaml({ constraints: ['a', 'b', 'c', 'd', 'e', 'f'] }) });
    expect(e.length).toBeGreaterThan(0);
  });

  it('seeding twice keeps one row per prompt', () => {
    const db = seeded(BASE);
    const { bundle } = loadContent(makeContentDir(BASE));
    seedContent(db, bundle);
    expect(count(db)).toBe(1);
  });

  it('editing a prompt updates it in place and removing it deletes it', () => {
    const db = seeded(BASE);
    const edited = loadContent(makeContentDir({ ...BASE, 'prompts/situation/late-train.yaml': promptYaml({ title: 'A longer wait' }) })).bundle;
    seedContent(db, edited);
    expect(db.get<{ title: string }>("SELECT title FROM writing_prompts WHERE slug='late-train'")!.title).toBe('A longer wait');
    const removed = loadContent(makeContentDir({ 'categories.yaml': CATEGORIES_YAML, 'expressions/sadness/crestfallen.yaml': expressionYaml() })).bundle;
    seedContent(db, removed);
    expect(count(db)).toBe(0);
  });
});
