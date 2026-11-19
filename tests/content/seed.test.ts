import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { loadContent } from '@/lib/content/load';
import { seedContent } from '@/lib/content/seed';
import { makeContentDir, CATEGORIES_YAML, expressionYaml } from './helpers';

function dbWithSentinel(): Db {
  const db = openDb(':memory:');
  migrate(db);
  db.exec('CREATE TABLE user_sentinel (id INTEGER PRIMARY KEY, note TEXT)');
  db.run("INSERT INTO user_sentinel (note) VALUES ('keep me')");
  return db;
}

function bundleOf(files: Record<string, string>) {
  const { bundle, errors } = loadContent(makeContentDir({ 'categories.yaml': CATEGORIES_YAML, ...files }));
  expect(errors).toEqual([]);
  return bundle;
}

const TWO = {
  'expressions/sadness/crestfallen.yaml': expressionYaml({
    relations: [{ to: 'deflated', type: 'synonym', note: 'close' }],
    mistakes: [{ wrong: 'He crestfallen.', right: 'He looked crestfallen.', explanation: 'It is an adjective.' }],
  }),
  'expressions/sadness/deflated.yaml': expressionYaml({
    slug: 'deflated',
    text: 'deflated',
    searchPhrases: ['lost his spark'],
  }),
  'contrasts/sad-pair.yaml': JSON.stringify({
    slug: 'sad-pair',
    title: 'Crestfallen or deflated',
    explanation: 'One shows on the face, one in energy.',
    members: [
      { expression: 'crestfallen', note: 'face', example: 'x' },
      { expression: 'deflated', note: 'energy', example: 'y' },
    ],
  }),
};

const count = (db: Db, t: string) => db.get<{ n: number }>(`SELECT COUNT(*) n FROM ${t}`)!.n;

describe('seedContent', () => {
  it('seeding twice yields the same row counts', () => {
    const db = dbWithSentinel();
    const b = bundleOf(TWO);
    const first = seedContent(db, b);
    const snapshot = ['categories', 'expressions', 'examples', 'relations', 'mistakes', 'contrast_group_members', 'search_phrases', 'tags', 'expression_tags', 'expressions_fts'].map((t) => count(db, t));
    const second = seedContent(db, b);
    const again = ['categories', 'expressions', 'examples', 'relations', 'mistakes', 'contrast_group_members', 'search_phrases', 'tags', 'expression_tags', 'expressions_fts'].map((t) => count(db, t));
    expect(again).toEqual(snapshot);
    expect(first).toEqual({ added: 2, updated: 0, removed: 0 });
    expect(second).toEqual({ added: 0, updated: 2, removed: 0 });
  });

  it('editing an expression updates it in place with no duplicate', () => {
    const db = dbWithSentinel();
    seedContent(db, bundleOf(TWO));
    const edited = { ...TWO, 'expressions/sadness/deflated.yaml': expressionYaml({ slug: 'deflated', text: 'deflated', simpleMeaning: 'Lost energy or confidence.' }) };
    seedContent(db, bundleOf(edited));
    expect(count(db, 'expressions')).toBe(2);
    expect(db.get<{ simple_meaning: string }>("SELECT simple_meaning FROM expressions WHERE slug='deflated'")!.simple_meaning).toBe('Lost energy or confidence.');
    // old search phrase is gone after the edit
    expect(db.all("SELECT 1 FROM search_phrases WHERE phrase='lost his spark'")).toHaveLength(0);
  });

  it('removing an expression from the bundle deletes it and its children', () => {
    const db = dbWithSentinel();
    seedContent(db, bundleOf(TWO));
    const { 'expressions/sadness/deflated.yaml': _gone, 'contrasts/sad-pair.yaml': _c, ...rest } = TWO;
    const only = { ...rest, 'expressions/sadness/crestfallen.yaml': expressionYaml() };
    const result = seedContent(db, bundleOf(only));
    expect(result.removed).toBe(1);
    expect(db.all("SELECT 1 FROM expressions WHERE slug='deflated'")).toHaveLength(0);
    expect(count(db, 'contrast_groups')).toBe(0);
    expect(count(db, 'relations')).toBe(0);
    expect(count(db, 'expressions_fts')).toBe(1);
  });

  it('does not touch a sentinel user table', () => {
    const db = dbWithSentinel();
    seedContent(db, bundleOf(TWO));
    seedContent(db, bundleOf({ 'expressions/sadness/crestfallen.yaml': expressionYaml() }));
    expect(db.all('SELECT note FROM user_sentinel')).toEqual([{ note: 'keep me' }]);
  });

  it('fts finds a seeded expression by a search phrase and by a tag', () => {
    const db = dbWithSentinel();
    seedContent(db, bundleOf(TWO));
    const byPhrase = db.all<{ slug: string }>("SELECT slug FROM expressions_fts WHERE expressions_fts MATCH 'phrases:\"lost his spark\"'");
    expect(byPhrase.map((r) => r.slug)).toEqual(['deflated']);
    const byTag = db.all("SELECT slug FROM expressions_fts WHERE expressions_fts MATCH 'tags:disappointment'");
    expect(byTag).toHaveLength(2);
  });

  it('builds the category tree with parents', () => {
    const db = dbWithSentinel();
    seedContent(db, bundleOf(TWO));
    const row = db.get<{ parent: string }>(
      "SELECT p.slug parent FROM categories c JOIN categories p ON p.id = c.parent_id WHERE c.slug = 'disappointment'",
    );
    expect(row?.parent).toBe('sadness');
  });

  it('stores curly quotes and em dashes unchanged', () => {
    const db = dbWithSentinel();
    seedContent(db, bundleOf(TWO));
    const rows = db.all<{ text: string }>("SELECT text FROM examples WHERE text LIKE '%crestfallen—%'");
    expect(rows.length).toBeGreaterThan(0);
  });
});
