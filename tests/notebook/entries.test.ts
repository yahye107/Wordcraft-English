import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { loadContent } from '@/lib/content/load';
import { seedContent } from '@/lib/content/seed';
import {
  saveFromLibrary, addCustom, updateEntry, deleteEntry, addExample, deleteExample, getEntry, getEntryForSlug, listEntries,
} from '@/lib/notebook/entries';
import { createCollection, renameCollection, deleteCollection, listCollections, setEntryCollections } from '@/lib/notebook/collections';
import { makeContentDir, CATEGORIES_YAML, expressionYaml } from '../content/helpers';

function setup(files: Record<string, string> = {}): Db {
  const { bundle, errors } = loadContent(
    makeContentDir({
      'categories.yaml': CATEGORIES_YAML,
      'expressions/sadness/crestfallen.yaml': expressionYaml(),
      'expressions/sadness/draftword.yaml': expressionYaml({ slug: 'draftword', text: 'draftword', status: 'draft', examples: [] }),
      ...files,
    }),
  );
  expect(errors).toEqual([]);
  const db = openDb(':memory:');
  migrate(db);
  seedContent(db, bundle);
  return db;
}

const count = (db: Db, t: string) => db.get<{ n: number }>(`SELECT COUNT(*) n FROM ${t}`)!.n;

describe('saveFromLibrary', () => {
  it('saves once, returns the same entry the second time, and keeps one card', () => {
    const db = setup();
    const a = saveFromLibrary(db, 'crestfallen')!;
    const b = saveFromLibrary(db, 'crestfallen')!;
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(b.entry.id).toBe(a.entry.id);
    expect(count(db, 'notebook_entries')).toBe(1);
    expect(count(db, 'srs_cards')).toBe(1);
    expect(a.entry.library?.slug).toBe('crestfallen');
  });

  it('returns undefined for an unknown or draft slug', () => {
    const db = setup();
    expect(saveFromLibrary(db, 'nope')).toBeUndefined();
    expect(saveFromLibrary(db, 'draftword')).toBeUndefined();
  });

  it('finds the entry by slug', () => {
    const db = setup();
    const { entry } = saveFromLibrary(db, 'crestfallen')!;
    expect(getEntryForSlug(db, 'crestfallen')?.id).toBe(entry.id);
    expect(getEntryForSlug(db, 'deflated')).toBeUndefined();
  });
});

describe('addCustom', () => {
  it('adds a custom word with a card', () => {
    const db = setup();
    const r = addCustom(db, { text: 'apprehensive', myMeaning: 'worried about the future' });
    expect(r.ok && r.created).toBe(true);
    expect(count(db, 'srs_cards')).toBe(1);
  });

  it('is unique ignoring case and spaces', () => {
    const db = setup();
    addCustom(db, { text: 'Apprehensive' });
    const again = addCustom(db, { text: '  apprehensive ' });
    expect(again.ok && again.created).toBe(false);
    expect(count(db, 'notebook_entries')).toBe(1);
  });

  it('rejects empty and over-long fields and stores nothing', () => {
    const db = setup();
    expect(addCustom(db, { text: '   ' }).ok).toBe(false);
    expect(addCustom(db, { text: 'x'.repeat(101) }).ok).toBe(false);
    expect(addCustom(db, { text: 'ok', myMeaning: 'm'.repeat(501) }).ok).toBe(false);
    expect(addCustom(db, { text: 'ok', myNotes: 'n'.repeat(2001) }).ok).toBe(false);
    expect(count(db, 'notebook_entries')).toBe(0);
  });
});

describe('plain objects', () => {
  it('returns plain objects so entries can be passed to client components', () => {
    const db = setup();
    const { entry } = saveFromLibrary(db, 'crestfallen')!;
    addExample(db, entry.id, 'A sentence.');
    const c = createCollection(db, 'Plain');
    if (c.ok) setEntryCollections(db, entry.id, [c.id]);
    const e = getEntry(db, entry.id)!;
    expect(Object.getPrototypeOf(e.examples[0])).toBe(Object.prototype);
    expect(Object.getPrototypeOf(e.collections[0])).toBe(Object.prototype);
    expect(Object.getPrototypeOf(listCollections(db)[0])).toBe(Object.prototype);
  });
});

describe('updating and deleting', () => {
  it('updates meaning and notes and rejects over-long ones', () => {
    const db = setup();
    const { entry } = saveFromLibrary(db, 'crestfallen')!;
    expect(updateEntry(db, entry.id, { myMeaning: 'sad after bad news', myNotes: 'use for faces' }).ok).toBe(true);
    expect(getEntry(db, entry.id)).toMatchObject({ myMeaning: 'sad after bad news', myNotes: 'use for faces' });
    expect(updateEntry(db, entry.id, { myNotes: 'n'.repeat(2001) }).ok).toBe(false);
    expect(getEntry(db, entry.id)!.myNotes).toBe('use for faces');
    expect(updateEntry(db, 9999, { myMeaning: 'x' }).ok).toBe(false);
  });

  it('adds and deletes example sentences with limits', () => {
    const db = setup();
    const { entry } = saveFromLibrary(db, 'crestfallen')!;
    const ex = addExample(db, entry.id, 'He looked crestfallen.');
    expect(ex.ok).toBe(true);
    expect(getEntry(db, entry.id)!.examples).toHaveLength(1);
    expect(addExample(db, entry.id, '   ').ok).toBe(false);
    expect(addExample(db, entry.id, 'x'.repeat(501)).ok).toBe(false);
    if (ex.ok) expect(deleteExample(db, ex.id).ok).toBe(true);
    expect(getEntry(db, entry.id)!.examples).toHaveLength(0);
  });

  it('deleting an entry removes its card, logs, examples and collection links', () => {
    const db = setup();
    const { entry } = saveFromLibrary(db, 'crestfallen')!;
    addExample(db, entry.id, 'A sentence.');
    const c = createCollection(db, 'Sadness');
    if (c.ok) setEntryCollections(db, entry.id, [c.id]);
    db.run("INSERT INTO review_logs (entry_id, grade, prev_interval, new_interval) VALUES (?, 'good', 0, 1)", [entry.id]);
    expect(deleteEntry(db, entry.id).ok).toBe(true);
    for (const t of ['notebook_entries', 'notebook_examples', 'srs_cards', 'review_logs', 'entry_collections']) expect(count(db, t)).toBe(0);
    expect(count(db, 'collections')).toBe(1);
    expect(deleteEntry(db, entry.id).ok).toBe(false);
  });

  it('keeps an entry whose expression was removed from the content, with library null', () => {
    const db = setup();
    const { entry } = saveFromLibrary(db, 'crestfallen')!;
    db.run("DELETE FROM expressions WHERE slug = 'crestfallen'");
    const e = getEntry(db, entry.id)!;
    expect(e.library).toBeNull();
    expect(e.text).toBe('crestfallen');
  });
});

describe('listEntries', () => {
  it('filters by collection and by text search', () => {
    const db = setup();
    const a = saveFromLibrary(db, 'crestfallen')!.entry;
    const bRes = addCustom(db, { text: 'apprehensive', myMeaning: 'worried' });
    const c = createCollection(db, 'From The Giver');
    if (c.ok) setEntryCollections(db, a.id, [c.id]);
    expect(listEntries(db, {}).map((e) => e.text).sort()).toEqual(['apprehensive', 'crestfallen']);
    if (c.ok) expect(listEntries(db, { collectionId: c.id }).map((e) => e.text)).toEqual(['crestfallen']);
    expect(listEntries(db, { q: 'worried' }).map((e) => e.text)).toEqual(['apprehensive']);
    expect(listEntries(db, { q: 'CREST' }).map((e) => e.text)).toEqual(['crestfallen']);
    expect(bRes.ok).toBe(true);
  });
});

describe('collections', () => {
  it('trims names, keeps them unique ignoring case and rejects over-long ones', () => {
    const db = setup();
    expect(createCollection(db, '  Anger words ').ok).toBe(true);
    expect(createCollection(db, 'anger WORDS').ok).toBe(false);
    expect(createCollection(db, '').ok).toBe(false);
    expect(createCollection(db, 'x'.repeat(41)).ok).toBe(false);
    expect(listCollections(db).map((c) => c.name)).toEqual(['Anger words']);
  });

  it('renames and deletes without deleting entries, and counts entries', () => {
    const db = setup();
    const e = saveFromLibrary(db, 'crestfallen')!.entry;
    const c = createCollection(db, 'A');
    if (!c.ok) throw new Error('create failed');
    setEntryCollections(db, e.id, [c.id]);
    expect(listCollections(db)[0].count).toBe(1);
    expect(renameCollection(db, c.id, 'B').ok).toBe(true);
    expect(deleteCollection(db, c.id).ok).toBe(true);
    expect(count(db, 'notebook_entries')).toBe(1);
    expect(getEntry(db, e.id)!.collections).toEqual([]);
  });
});
