import { describe, it, expect } from 'vitest';
import { openDb } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { ensureSeeded } from '@/lib/content/bootstrap';
import { makeContentDir, CATEGORIES_YAML, expressionYaml } from './helpers';

const GOOD = {
  'categories.yaml': CATEGORIES_YAML,
  'expressions/sadness/crestfallen.yaml': expressionYaml(),
};

const fresh = () => {
  const db = openDb(':memory:');
  migrate(db);
  return db;
};
const n = (db: ReturnType<typeof fresh>) => db.get<{ n: number }>('SELECT COUNT(*) n FROM expressions')!.n;

describe('ensureSeeded', () => {
  it('seeds an empty database from the content folder', () => {
    const db = fresh();
    expect(ensureSeeded(db, makeContentDir(GOOD))).toBe('seeded');
    expect(n(db)).toBe(1);
  });

  it('leaves a database that already has expressions alone', () => {
    const db = fresh();
    const dir = makeContentDir(GOOD);
    ensureSeeded(db, dir);
    db.run("UPDATE expressions SET simple_meaning = 'edited by hand' WHERE slug = 'crestfallen'");
    expect(ensureSeeded(db, dir)).toBe('already');
    expect(db.get<{ m: string }>("SELECT simple_meaning m FROM expressions WHERE slug='crestfallen'")!.m).toBe('edited by hand');
  });

  it('does not throw and seeds nothing when the content has errors', () => {
    const db = fresh();
    const dir = makeContentDir({ ...GOOD, 'expressions/sadness/bad.yaml': 'slug: [unclosed' });
    expect(ensureSeeded(db, dir)).toBe('invalid');
    expect(n(db)).toBe(0);
  });

  it('does not throw when there is no content folder', () => {
    expect(ensureSeeded(fresh(), 'C:/definitely/not/here')).toBe('invalid');
  });
});
