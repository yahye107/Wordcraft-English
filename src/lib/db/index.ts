import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { migrate } from './migrate';

type Param = string | number | bigint | null | Uint8Array;

export type Db = {
  all<T = Record<string, unknown>>(sql: string, params?: Param[]): T[];
  get<T = Record<string, unknown>>(sql: string, params?: Param[]): T | undefined;
  run(sql: string, params?: Param[]): { changes: number; lastInsertRowid: number };
  exec(sql: string): void;
  transaction<T>(fn: () => T): T;
};

/** Open a SQLite database. Use ':memory:' for tests. */
export function openDb(file: string): Db {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA foreign_keys = ON');
  if (file !== ':memory:') raw.exec('PRAGMA journal_mode = WAL');

  let depth = 0;

  return {
    all<T>(sql: string, params: Param[] = []) {
      return raw.prepare(sql).all(...params) as T[];
    },
    get<T>(sql: string, params: Param[] = []) {
      return raw.prepare(sql).get(...params) as T | undefined;
    },
    run(sql: string, params: Param[] = []) {
      const r = raw.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
    },
    exec(sql: string) {
      raw.exec(sql);
    },
    transaction<T>(fn: () => T): T {
      if (depth > 0) return fn();
      raw.exec('BEGIN');
      depth++;
      try {
        const result = fn();
        raw.exec('COMMIT');
        return result;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

const globalForDb = globalThis as unknown as { __wordcraftDb?: Db };

/** App-wide singleton, migrated on first use. Survives dev hot reloads. */
export function getDb(): Db {
  if (!globalForDb.__wordcraftDb) {
    const file = process.env.WORDCRAFT_DB ?? path.join(process.cwd(), 'data', 'wordcraft.sqlite');
    const db = openDb(file);
    migrate(db);
    globalForDb.__wordcraftDb = db;
  }
  return globalForDb.__wordcraftDb;
}
