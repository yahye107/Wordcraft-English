import { describe, it, expect } from 'vitest';
import { openDb } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { MIGRATIONS } from '@/lib/db/migrations';

const CONTENT_TABLES = [
  'categories',
  'expressions',
  'expression_categories',
  'examples',
  'relations',
  'contrast_groups',
  'contrast_group_members',
  'mistakes',
  'tags',
  'expression_tags',
  'search_phrases',
  'expressions_fts',
  'settings',
  'ai_usage',
  'notebook_entries',
  'srs_cards',
  'review_logs',
];

function fresh() {
  const db = openDb(':memory:');
  migrate(db);
  return db;
}

describe('migrate', () => {
  it('creates all content tables', () => {
    const db = fresh();
    const names = db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type IN ('table')")
      .map((r) => r.name);
    for (const t of CONTENT_TABLES) expect(names).toContain(t);
  });

  it('is idempotent: running twice leaves one schema_migrations row per migration', () => {
    const db = openDb(':memory:');
    migrate(db);
    migrate(db);
    const rows = db.all('SELECT version FROM schema_migrations');
    expect(rows).toHaveLength(MIGRATIONS.length);
  });

  it('cascades expression deletes to examples, relations, mistakes and tags', () => {
    const db = fresh();
    db.run(
      `INSERT INTO expressions (id, slug, text, kind, simple_meaning, contextual_meaning, usage_notes, register, level)
       VALUES (1,'a','a','word','m','c','u','neutral','beginner'), (2,'b','b','word','m','c','u','neutral','beginner')`,
    );
    db.run("INSERT INTO examples (expression_id, text, setting) VALUES (1, 'x', 'everyday')");
    db.run("INSERT INTO relations (from_id, to_id, type) VALUES (1, 2, 'synonym')");
    db.run("INSERT INTO mistakes (expression_id, wrong, right, explanation) VALUES (1, 'w', 'r', 'e')");
    db.run("INSERT INTO tags (id, slug, kind, name) VALUES (1, 'emotion:x', 'emotion', 'x')");
    db.run('INSERT INTO expression_tags (expression_id, tag_id) VALUES (1, 1)');
    db.run('DELETE FROM expressions WHERE id = 1');
    for (const t of ['examples', 'relations', 'mistakes', 'expression_tags']) {
      expect(db.get<{ n: number }>(`SELECT COUNT(*) n FROM ${t}`)!.n).toBe(0);
    }
  });

  it('expressions_fts matches on text and on a search phrase', () => {
    const db = fresh();
    db.run(
      `INSERT INTO expressions_fts (rowid, slug, text, meanings, usage, examples, phrases, tags)
       VALUES (1, 'crestfallen', 'crestfallen', 'sad and disappointed', '', '', 'let down', 'emotion:disappointment')`,
    );
    expect(db.all("SELECT slug FROM expressions_fts WHERE expressions_fts MATCH 'crestfallen'")).toHaveLength(1);
    expect(db.all("SELECT slug FROM expressions_fts WHERE expressions_fts MATCH 'phrases:\"let down\"'")).toHaveLength(1);
  });

  it('porter stemming lets a stem match its inflections', () => {
    const db = fresh();
    db.run(
      `INSERT INTO expressions_fts (rowid, slug, text, meanings, usage, examples, phrases, tags)
       VALUES (1, 'x', 'disappointed', '', '', '', '', '')`,
    );
    expect(db.all("SELECT slug FROM expressions_fts WHERE expressions_fts MATCH 'disappointing'")).toHaveLength(1);
  });
});
