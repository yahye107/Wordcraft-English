import type { Db } from './index';
import { MIGRATIONS } from './migrations';

/** Apply any migrations not yet recorded, in order. Safe to call repeatedly. */
export function migrate(db: Db): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL)');
  const applied = new Set(db.all<{ version: number }>('SELECT version FROM schema_migrations').map((r) => r.version));
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', [m.version, m.name]);
    });
  }
}
