import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { loadContent } from '@/lib/content/load';
import { seedContent } from '@/lib/content/seed';
import { saveFromLibrary, addCustom } from '@/lib/notebook/entries';
import { getDueCards, countDue, gradeCard } from '@/lib/notebook/review';
import { setSetting } from '@/lib/settings';
import { makeContentDir, CATEGORIES_YAML, expressionYaml } from '../content/helpers';

const DAY = 86_400_000;
const NOW = new Date('2026-11-20T09:00:00.000Z');
const later = (days: number) => new Date(NOW.getTime() + days * DAY);

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

const addWords = (db: Db, n: number) => {
  const ids: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = addCustom(db, { text: `word${i}`, myMeaning: `meaning ${i}` }, NOW);
    if (r.ok) ids.push(r.entry.id);
  }
  return ids;
};

describe('getDueCards', () => {
  it('returns due cards oldest first and only when due', () => {
    const db = setup();
    const [a, b] = addWords(db, 2);
    db.run("UPDATE srs_cards SET due_at = '2026-11-18T00:00:00.000Z', reps = 3, last_reviewed_at = '2026-11-10T00:00:00.000Z' WHERE entry_id = ?", [b]);
    db.run("UPDATE srs_cards SET due_at = '2026-11-25T00:00:00.000Z', reps = 3, last_reviewed_at = '2026-11-10T00:00:00.000Z' WHERE entry_id = ?", [a]);
    const cards = getDueCards(db, NOW);
    expect(cards.map((c) => c.entryId)).toEqual([b]);
    expect(cards[0].isNew).toBe(false);
  });

  it('respects the daily new-card limit across repeated calls on one day', () => {
    const db = setup();
    setSetting(db, 'new_cards_per_day', '2');
    addWords(db, 5);
    const first = getDueCards(db, NOW);
    expect(first).toHaveLength(2);
    expect(first.every((c) => c.isNew)).toBe(true);
    expect(gradeCard(db, first[0].entryId, 'good', NOW).ok).toBe(true);
    expect(getDueCards(db, NOW)).toHaveLength(1);
    // the next day the allowance resets
    expect(getDueCards(db, later(1)).length).toBeGreaterThanOrEqual(2);
  });

  it('never exceeds 50 cards in a session', () => {
    const db = setup();
    setSetting(db, 'new_cards_per_day', '500');
    addWords(db, 70);
    expect(getDueCards(db, NOW)).toHaveLength(50);
    expect(countDue(db, NOW)).toBe(70);
  });

  it('includes library details for a linked expression and library null for a removed one', () => {
    const db = setup();
    const { entry } = saveFromLibrary(db, 'crestfallen', NOW)!;
    const card = getDueCards(db, NOW).find((c) => c.entryId === entry.id)!;
    expect(card.library?.slug).toBe('crestfallen');
    expect(card.library?.examples.length).toBeGreaterThan(0);
    db.run("DELETE FROM expressions WHERE slug = 'crestfallen'");
    expect(getDueCards(db, NOW).find((c) => c.entryId === entry.id)!.library).toBeNull();
  });

  it('shows my own examples on the card', () => {
    const db = setup();
    const [id] = addWords(db, 1);
    db.run("INSERT INTO notebook_examples (entry_id, text) VALUES (?, 'My own sentence.')", [id]);
    expect(getDueCards(db, NOW)[0].examples).toEqual(['My own sentence.']);
  });
});

describe('gradeCard', () => {
  it('updates the card and writes one log row', () => {
    const db = setup();
    const [id] = addWords(db, 1);
    const r = gradeCard(db, id, 'good', NOW);
    expect(r.ok).toBe(true);
    const card = db.get<{ interval_days: number; reps: number }>('SELECT interval_days, reps FROM srs_cards WHERE entry_id = ?', [id])!;
    expect(card).toEqual({ interval_days: 1, reps: 1 });
    expect(db.all('SELECT grade, prev_interval, new_interval FROM review_logs')).toEqual([{ grade: 'good', prev_interval: 0, new_interval: 1 }]);
  });

  it('returns 409 for a card that is not due and writes nothing', () => {
    const db = setup();
    const [id] = addWords(db, 1);
    gradeCard(db, id, 'good', NOW);
    const again = gradeCard(db, id, 'good', NOW);
    expect(again).toMatchObject({ ok: false, status: 409 });
    expect(db.get<{ n: number }>('SELECT COUNT(*) n FROM review_logs')!.n).toBe(1);
  });

  it('returns 404 for an unknown entry and 400 for an invalid grade', () => {
    const db = setup();
    const [id] = addWords(db, 1);
    expect(gradeCard(db, 9999, 'good', NOW)).toMatchObject({ ok: false, status: 404 });
    expect(gradeCard(db, id, 'perfect' as never, NOW)).toMatchObject({ ok: false, status: 400 });
    expect(db.get<{ n: number }>('SELECT COUNT(*) n FROM review_logs')!.n).toBe(0);
  });

  it('removes a graded card from the queue until it is due again', () => {
    const db = setup();
    const [id] = addWords(db, 1);
    gradeCard(db, id, 'good', NOW);
    expect(getDueCards(db, NOW)).toHaveLength(0);
    expect(getDueCards(db, later(1)).map((c) => c.entryId)).toEqual([id]);
  });
});
