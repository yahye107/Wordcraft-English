import type { Db } from '@/lib/db';
import { LIMITS, cleanText, fail, isFail, type Fail } from './limits';

export function createCollection(db: Db, name: unknown): { ok: true; id: number } | Fail {
  const clean = cleanText(name, 'The collection name', LIMITS.collection, { required: true });
  if (isFail(clean)) return clean;
  const dup = db.get('SELECT 1 FROM collections WHERE lower(name) = lower(?)', [clean]);
  if (dup) return fail('You already have a collection with that name.');
  const r = db.run('INSERT INTO collections (name) VALUES (?)', [clean]);
  return { ok: true, id: r.lastInsertRowid };
}

export function renameCollection(db: Db, id: number, name: unknown): { ok: true } | Fail {
  const clean = cleanText(name, 'The collection name', LIMITS.collection, { required: true });
  if (isFail(clean)) return clean;
  if (!db.get('SELECT 1 FROM collections WHERE id = ?', [id])) return fail('That collection does not exist.');
  const dup = db.get('SELECT 1 FROM collections WHERE lower(name) = lower(?) AND id <> ?', [clean, id]);
  if (dup) return fail('You already have a collection with that name.');
  db.run('UPDATE collections SET name = ? WHERE id = ?', [clean, id]);
  return { ok: true };
}

export function deleteCollection(db: Db, id: number): { ok: true } | Fail {
  const r = db.run('DELETE FROM collections WHERE id = ?', [id]); // links cascade; entries stay
  return r.changes > 0 ? { ok: true } : fail('That collection does not exist.');
}

export function listCollections(db: Db): { id: number; name: string; count: number }[] {
  return db
    .all<{ id: number; name: string; count: number }>(
      `SELECT c.id, c.name, (SELECT COUNT(*) FROM entry_collections ec WHERE ec.collection_id = c.id) AS count
       FROM collections c ORDER BY lower(c.name)`,
    )
    .map((c) => ({ id: c.id, name: c.name, count: c.count })); // plain objects, safe to pass to client components
}

export function setEntryCollections(db: Db, entryId: number, collectionIds: number[]): { ok: true } | Fail {
  if (!db.get('SELECT 1 FROM notebook_entries WHERE id = ?', [entryId])) return fail('That entry does not exist.');
  if (!Array.isArray(collectionIds) || !collectionIds.every((n) => Number.isInteger(n))) return fail('Collections must be a list of ids.');
  for (const id of collectionIds) {
    if (!db.get('SELECT 1 FROM collections WHERE id = ?', [id])) return fail('One of those collections does not exist.');
  }
  db.transaction(() => {
    db.run('DELETE FROM entry_collections WHERE entry_id = ?', [entryId]);
    for (const id of new Set(collectionIds)) db.run('INSERT INTO entry_collections (entry_id, collection_id) VALUES (?, ?)', [entryId, id]);
  });
  return { ok: true };
}
