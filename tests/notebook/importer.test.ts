import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { loadContent } from '@/lib/content/load';
import { seedContent } from '@/lib/content/seed';
import { parseObsidianNotes, importNotes, importFile } from '@/lib/notebook/importer';
import { addCustom, getEntryForSlug } from '@/lib/notebook/entries';
import { makeContentDir, CATEGORIES_YAML, expressionYaml } from '../content/helpers';

const SAMPLE = `> [!PDF|note] [[Sample Book.pdf#page=3&selection=21,0,21,10&color=note|Sample Book, p.3]]
> > frightened
> means very sacred, afraid or Terrified.
> [!PDF|note] [[Sample Book.pdf#page=3&selection=25,24,25,34&color=note|Sample Book, p.3]]
> > Squinting
>closing your eyes.
> [!PDF|important] [[Sample Book.pdf#page=4&selection=89,0,89,10&color=important|Sample Book, p.4]]
> > reassuring
> making you feel less worried and scared
`;

function setup(): Db {
  const { bundle, errors } = loadContent(
    makeContentDir({ 'categories.yaml': CATEGORIES_YAML, 'expressions/sadness/crestfallen.yaml': expressionYaml() }),
  );
  expect(errors).toEqual([]);
  const db = openDb(':memory:');
  migrate(db);
  seedContent(db, bundle);
  return db;
}

const count = (db: Db, t: string) => db.get<{ n: number }>(`SELECT COUNT(*) n FROM ${t}`)!.n;

describe('parseObsidianNotes', () => {
  it('parses a word, its meaning and the source link', () => {
    const notes = parseObsidianNotes(SAMPLE);
    expect(notes).toHaveLength(3);
    expect(notes[0]).toEqual({ text: 'frightened', meaning: 'means very sacred, afraid or Terrified.', source: 'Sample Book, p.3' });
  });

  it('keeps misspellings exactly and reads lines with no space after the quote mark', () => {
    const notes = parseObsidianNotes(SAMPLE);
    expect(notes[1]).toEqual({ text: 'Squinting', meaning: 'closing your eyes.', source: 'Sample Book, p.3' });
    expect(notes[0].meaning).toContain('sacred');
  });

  it('joins a multi-line meaning', () => {
    const text = '> [!PDF|note] [[B.pdf#page=1|B, p.1]]\n> > dwelling\n> a structure\n> used as a home\n';
    expect(parseObsidianNotes(text)[0].meaning).toBe('a structure used as a home');
  });

  it('accepts CRLF line endings', () => {
    expect(parseObsidianNotes(SAMPLE.replace(/\n/g, '\r\n'))).toHaveLength(3);
  });

  it('skips a callout with no word', () => {
    const text = '> [!PDF|note] [[B.pdf#page=1|B, p.1]]\n\n> [!PDF|note] [[B.pdf#page=2|B, p.2]]\n> > word\n> meaning\n';
    expect(parseObsidianNotes(text).map((n) => n.text)).toEqual(['word']);
  });

  it('imports a word with no meaning as an empty meaning', () => {
    const text = '> [!PDF|note] [[B.pdf#page=1|B, p.1]]\n> > lonely\n';
    expect(parseObsidianNotes(text)).toEqual([{ text: 'lonely', meaning: '', source: 'B, p.1' }]);
  });

  it('recognises callouts that are nested one level deeper, as in real Obsidian notes', () => {
    const text = `> [!PDF|note] [[B.pdf#page=1|B, p.1]]
> > alpha
> first meaning
> > [!PDF|note] [[B.pdf#page=2|B, p.2]]
> > beta
> second meaning
> [!PDF|important] [[B.pdf#page=3|B, p.3]]
> > gamma
> third meaning
`;
    expect(parseObsidianNotes(text)).toEqual([
      { text: 'alpha', meaning: 'first meaning', source: 'B, p.1' },
      { text: 'beta', meaning: 'second meaning', source: 'B, p.2' },
      { text: 'gamma', meaning: 'third meaning', source: 'B, p.3' },
    ]);
  });

  it('returns nothing for empty text or text with no callouts', () => {
    expect(parseObsidianNotes('')).toEqual([]);
    expect(parseObsidianNotes('Just some notes.\n\nNo callouts here.')).toEqual([]);
  });

  it('handles wiki links and non-ASCII characters', () => {
    const text = '> [!PDF|note] [[Café.pdf#page=1|Café, p.1]]\n> > naïve\n> not [[experienced]] — innocent\n';
    expect(parseObsidianNotes(text)[0]).toMatchObject({ text: 'naïve', source: 'Café, p.1' });
  });

  it('never throws on random text', () => {
    for (let i = 0; i < 200; i++) {
      const junk = Array.from({ length: 200 }, () => '>[]|!PDF\n {}-‘’“”'.charAt(Math.floor(Math.random() * 20))).join('');
      expect(() => parseObsidianNotes(junk)).not.toThrow();
    }
  });

  it('returns at most 5000 notes', () => {
    const one = '> [!PDF|note] [[B.pdf|B]]\n> > w\n> m\n';
    expect(parseObsidianNotes(one.repeat(6000)).length).toBe(5000);
  });
});

describe('importNotes and importFile', () => {
  it('adds entries and cards, then adds nothing the second time', () => {
    const db = setup();
    const first = importFile(db, SAMPLE);
    expect(first).toMatchObject({ ok: true, added: 3, skipped: 0 });
    expect(count(db, 'notebook_entries')).toBe(3);
    expect(count(db, 'srs_cards')).toBe(3);
    const second = importFile(db, SAMPLE);
    expect(second).toMatchObject({ ok: true, added: 0, skipped: 3 });
    expect(count(db, 'notebook_entries')).toBe(3);
  });

  it('imports duplicate words in one file once', () => {
    const db = setup();
    const text = SAMPLE + SAMPLE;
    const r = importFile(db, text);
    expect(r).toMatchObject({ ok: true, added: 3 });
    expect(count(db, 'notebook_entries')).toBe(3);
  });

  it('skips a word that is already a custom entry', () => {
    const db = setup();
    addCustom(db, { text: 'FRIGHTENED' });
    expect(importFile(db, SAMPLE)).toMatchObject({ ok: true, added: 2, skipped: 1 });
  });

  it('links a word that matches a library expression and keeps the user meaning', () => {
    const db = setup();
    const text = '> [!PDF|note] [[B.pdf#page=1|B, p.1]]\n> > crestfallen\n> sad in my own words\n';
    const r = importFile(db, text);
    expect(r).toMatchObject({ ok: true, added: 1, linked: 1 });
    const entry = getEntryForSlug(db, 'crestfallen')!;
    expect(entry.myMeaning).toBe('sad in my own words');
    expect(entry.library?.simpleMeaning).toContain('disappointed');
    expect(entry.kind).toBe('import');
  });

  it('refuses a file over 1 MB', () => {
    const r = importFile(setup(), 'x'.repeat(1_000_001));
    expect(r.ok).toBe(false);
  });

  it('truncates over-long words and meanings instead of failing the whole import', () => {
    const db = setup();
    const text = `> [!PDF|note] [[B.pdf|B]]\n> > ${'w'.repeat(300)}\n> ${'m'.repeat(900)}\n`;
    const r = importNotes(db, parseObsidianNotes(text));
    expect(r.added).toBe(1);
    const row = db.get<{ text: string; my_meaning: string }>('SELECT text, my_meaning FROM notebook_entries')!;
    expect(row.text.length).toBeLessThanOrEqual(100);
    expect(row.my_meaning.length).toBeLessThanOrEqual(500);
  });
});
