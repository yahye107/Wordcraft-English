import { describe, it, expect, afterEach } from 'vitest';
import { openDb } from '@/lib/db';
import { getDb } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { MIGRATIONS } from '@/lib/db/migrations';

type Cache = { __wordcraftDb?: unknown; __wordcraftDbVersion?: number };
const g = globalThis as unknown as Cache;

afterEach(() => {
  delete g.__wordcraftDb;
  delete g.__wordcraftDbVersion;
});

describe('getDb', () => {
  it('applies a migration added after the cached connection was created (dev hot reload)', () => {
    // A connection cached by an older version of the code: migrated only up to version 3
    const old = openDb(':memory:');
    migrate(old);
    old.exec('DROP TABLE review_logs; DROP TABLE srs_cards; DROP TABLE entry_collections; DROP TABLE collections; DROP TABLE notebook_examples; DROP TABLE notebook_entries;');
    old.run('DELETE FROM schema_migrations WHERE version = 4');
    g.__wordcraftDb = old;
    g.__wordcraftDbVersion = 3;

    const db = getDb();
    expect(() => db.get('SELECT COUNT(*) FROM srs_cards')).not.toThrow();
    expect(g.__wordcraftDbVersion).toBe(MIGRATIONS.length);
  });

  it('does not re-run migrations when the cached connection is current', () => {
    const db = openDb(':memory:');
    migrate(db);
    g.__wordcraftDb = db;
    g.__wordcraftDbVersion = MIGRATIONS.length;
    expect(getDb()).toBe(db);
  });
});
