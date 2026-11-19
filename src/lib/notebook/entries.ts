import type { Db } from '@/lib/db';
import { newCardState } from '@/lib/srs/schedule';
import { LIMITS, cleanText, fail, isFail, type Fail } from './limits';

export type Entry = {
  id: number;
  kind: 'library' | 'custom' | 'import';
  expressionSlug: string | null;
  text: string;
  myMeaning: string;
  myNotes: string;
  source: string | null;
  createdAt: string;
  examples: { id: number; text: string }[];
  collections: { id: number; name: string }[];
  /** null when the linked expression is no longer in the library */
  library: { slug: string; text: string; simpleMeaning: string; contextualMeaning: string } | null;
};

type Row = {
  id: number; kind: Entry['kind']; expression_slug: string | null; text: string; my_meaning: string;
  my_notes: string; source: string | null; created_at: string;
};

function hydrate(db: Db, r: Row): Entry {
  const lib = r.expression_slug
    ? db.get<{ slug: string; text: string; simple_meaning: string; contextual_meaning: string }>(
        "SELECT slug, text, simple_meaning, contextual_meaning FROM expressions WHERE slug = ? AND status = 'published'",
        [r.expression_slug],
      )
    : undefined;
  return {
    id: r.id,
    kind: r.kind,
    expressionSlug: r.expression_slug,
    text: r.text,
    myMeaning: r.my_meaning,
    myNotes: r.my_notes,
    source: r.source,
    createdAt: r.created_at,
    examples: db.all<{ id: number; text: string }>('SELECT id, text FROM notebook_examples WHERE entry_id = ? ORDER BY id', [r.id]),
    collections: db.all<{ id: number; name: string }>(
      'SELECT c.id, c.name FROM entry_collections ec JOIN collections c ON c.id = ec.collection_id WHERE ec.entry_id = ? ORDER BY c.name',
      [r.id],
    ),
    library: lib ? { slug: lib.slug, text: lib.text, simpleMeaning: lib.simple_meaning, contextualMeaning: lib.contextual_meaning } : null,
  };
}

const COLUMNS = 'id, kind, expression_slug, text, my_meaning, my_notes, source, created_at';

export function getEntry(db: Db, id: number): Entry | undefined {
  const r = db.get<Row>(`SELECT ${COLUMNS} FROM notebook_entries WHERE id = ?`, [id]);
  return r && hydrate(db, r);
}

export function getEntryForSlug(db: Db, slug: string): Entry | undefined {
  const r = db.get<Row>(`SELECT ${COLUMNS} FROM notebook_entries WHERE expression_slug = ?`, [slug]);
  return r && hydrate(db, r);
}

/** Insert an entry row and its first review card together. Returns the new id. */
export function insertEntry(
  db: Db,
  e: { kind: Entry['kind']; expressionSlug: string | null; text: string; myMeaning?: string; myNotes?: string; source?: string | null },
  now: Date = new Date(),
): number {
  return db.transaction(() => {
    const r = db.run(
      'INSERT INTO notebook_entries (kind, expression_slug, text, my_meaning, my_notes, source) VALUES (?, ?, ?, ?, ?, ?)',
      [e.kind, e.expressionSlug, e.text, e.myMeaning ?? '', e.myNotes ?? '', e.source ?? null],
    );
    const c = newCardState(now);
    db.run('INSERT INTO srs_cards (entry_id, ease, interval_days, reps, lapses, due_at, last_reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      r.lastInsertRowid, c.ease, c.intervalDays, c.reps, c.lapses, c.dueAt, c.lastReviewedAt,
    ]);
    return r.lastInsertRowid;
  });
}

export function saveFromLibrary(db: Db, slug: string, now: Date = new Date()): { entry: Entry; created: boolean } | undefined {
  const existing = getEntryForSlug(db, slug);
  if (existing) return { entry: existing, created: false };
  const expr = db.get<{ slug: string; text: string }>("SELECT slug, text FROM expressions WHERE slug = ? AND status = 'published'", [slug]);
  if (!expr) return undefined;
  const id = insertEntry(db, { kind: 'library', expressionSlug: expr.slug, text: expr.text }, now);
  return { entry: getEntry(db, id)!, created: true };
}

export function addCustom(
  db: Db,
  input: { text?: unknown; myMeaning?: unknown; myNotes?: unknown },
  now: Date = new Date(),
): { ok: true; entry: Entry; created: boolean } | Fail {
  const text = cleanText(input.text, 'The word', LIMITS.word, { required: true });
  if (isFail(text)) return text;
  const meaning = cleanText(input.myMeaning, 'The meaning', LIMITS.meaning);
  if (isFail(meaning)) return meaning;
  const notes = cleanText(input.myNotes, 'The notes', LIMITS.notes);
  if (isFail(notes)) return notes;

  const normal = text.replace(/\s+/g, ' ');
  const existing = db.get<{ id: number }>(
    "SELECT id FROM notebook_entries WHERE kind IN ('custom','import') AND lower(trim(text)) = lower(trim(?))",
    [normal],
  );
  if (existing) return { ok: true, entry: getEntry(db, existing.id)!, created: false };

  const id = insertEntry(db, { kind: 'custom', expressionSlug: null, text: normal, myMeaning: meaning, myNotes: notes }, now);
  return { ok: true, entry: getEntry(db, id)!, created: true };
}

export function updateEntry(db: Db, id: number, patch: { myMeaning?: unknown; myNotes?: unknown }): { ok: true } | Fail {
  if (!db.get('SELECT 1 FROM notebook_entries WHERE id = ?', [id])) return fail('That entry does not exist.');
  const meaning = patch.myMeaning === undefined ? undefined : cleanText(patch.myMeaning, 'The meaning', LIMITS.meaning);
  if (isFail(meaning)) return meaning;
  const notes = patch.myNotes === undefined ? undefined : cleanText(patch.myNotes, 'The notes', LIMITS.notes);
  if (isFail(notes)) return notes;
  db.transaction(() => {
    if (meaning !== undefined) db.run('UPDATE notebook_entries SET my_meaning = ? WHERE id = ?', [meaning, id]);
    if (notes !== undefined) db.run('UPDATE notebook_entries SET my_notes = ? WHERE id = ?', [notes, id]);
  });
  return { ok: true };
}

export function deleteEntry(db: Db, id: number): { ok: true } | Fail {
  const r = db.run('DELETE FROM notebook_entries WHERE id = ?', [id]); // examples, card, logs, links cascade
  return r.changes > 0 ? { ok: true } : fail('That entry does not exist.');
}

export function addExample(db: Db, entryId: number, text: unknown): { ok: true; id: number } | Fail {
  if (!db.get('SELECT 1 FROM notebook_entries WHERE id = ?', [entryId])) return fail('That entry does not exist.');
  const clean = cleanText(text, 'The sentence', LIMITS.example, { required: true });
  if (isFail(clean)) return clean;
  const r = db.run('INSERT INTO notebook_examples (entry_id, text) VALUES (?, ?)', [entryId, clean]);
  return { ok: true, id: r.lastInsertRowid };
}

export function deleteExample(db: Db, exampleId: number): { ok: true } | Fail {
  const r = db.run('DELETE FROM notebook_examples WHERE id = ?', [exampleId]);
  return r.changes > 0 ? { ok: true } : fail('That sentence does not exist.');
}

export function listEntries(db: Db, opts: { collectionId?: number; q?: string; limit?: number; offset?: number } = {}): Entry[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts.collectionId !== undefined) {
    where.push('id IN (SELECT entry_id FROM entry_collections WHERE collection_id = ?)');
    params.push(opts.collectionId);
  }
  const q = opts.q?.trim().toLowerCase();
  if (q) {
    where.push("(lower(text) LIKE ? ESCAPE '\\' OR lower(my_meaning) LIKE ? ESCAPE '\\' OR lower(my_notes) LIKE ? ESCAPE '\\')");
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    params.push(like, like, like);
  }
  params.push(opts.limit ?? 200, opts.offset ?? 0);
  return db
    .all<Row>(
      `SELECT ${COLUMNS} FROM notebook_entries ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
      params,
    )
    .map((r) => hydrate(db, r));
}
