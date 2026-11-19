import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { getWritingTrends, getExpressionUse } from '@/lib/progress/writing';

const NOW = new Date('2026-11-23T12:00:00Z');
const opts = { now: NOW, tz: 0 };

function setup(): Db {
  const db = openDb(':memory:');
  migrate(db);
  return db;
}

type Version = { words: number; issues?: string[]; text?: string };
let n = 0;
/** One session with the given versions. Issue keys look like 'vocabulary:very'. */
function session(db: Db, day: string, versions: Version[], title = `Session ${++n}`, mode = 'paragraph') {
  const id = db.run('INSERT INTO writing_sessions (mode, title, created_at) VALUES (?, ?, ?)', [mode, title, `${day}T09:00:00.000Z`]).lastInsertRowid;
  versions.forEach((v, i) => {
    const rid = db.run(
      'INSERT INTO writing_revisions (session_id, version, text, text_hash, word_count, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [id, i + 1, v.text ?? 'text', `h${++n}`, v.words, `${day}T09:00:00.000Z`],
    ).lastInsertRowid;
    for (const key of v.issues ?? []) {
      db.run(
        "INSERT INTO feedback_items (revision_id, source, category, key, quote, why, hint1, hint2, hint3) VALUES (?, 'local', ?, ?, 'q', 'w', 'a', 'b', 'c')",
        [rid, key.split(':')[0], key],
      );
    }
  });
  return id;
}
const issues = (k: number, key = 'vocabulary:very') => Array.from({ length: k }, () => key);

describe('getWritingTrends', () => {
  it('is empty with no sessions', () => {
    const t = getWritingTrends(setup(), opts);
    expect(t.sessions).toEqual([]);
    expect(t.totals).toEqual({ sessions: 0, words: 0, wordsLast30: 0 });
    expect(t.trend.state).toBe('not-enough');
    expect(t.repeatErrors).toEqual([]);
  });

  it('computes problems per 100 words for first and final drafts, and 0 for no words', () => {
    const db = setup();
    session(db, '2026-11-20', [{ words: 50, issues: issues(3) }, { words: 60, issues: issues(1) }]);
    session(db, '2026-11-21', [{ words: 0, issues: issues(2) }]);
    const t = getWritingTrends(db, opts);
    expect(t.sessions).toHaveLength(2);
    expect(t.sessions[0]).toMatchObject({ words: 60, versions: 2, firstDraftPer100: 6, finalPer100: 1.7 });
    expect(t.sessions[1]).toMatchObject({ words: 0, firstDraftPer100: 0, finalPer100: 0 });
    expect(JSON.stringify(t)).not.toMatch(/NaN|Infinity/);
  });

  it('is not-enough with 2 and with 3 sessions, and compares 4 sessions (latest 3 against 1)', () => {
    const db = setup();
    session(db, '2026-11-01', [{ words: 100, issues: issues(10) }]);
    session(db, '2026-11-02', [{ words: 100, issues: issues(10) }]);
    expect(getWritingTrends(db, opts).trend.state).toBe('not-enough');
    session(db, '2026-11-03', [{ words: 100, issues: issues(10) }]);
    expect(getWritingTrends(db, opts).trend.state).toBe('not-enough');
    session(db, '2026-11-04', [{ words: 100, issues: issues(2) }]);
    // latest 3 are the 2nd, 3rd and 4th: (10 + 10 + 2) / 3 = 7.33 against the 1st: 10
    expect(getWritingTrends(db, opts).trend.state).toBe('better');
  });

  it('says better, worse or about the same with six sessions', () => {
    const build = (earlier: number, latest: number) => {
      const db = setup();
      [earlier, earlier, earlier, latest, latest, latest].forEach((k, i) => session(db, `2026-11-0${i + 1}`, [{ words: 100, issues: issues(k) }]));
      return getWritingTrends(db, opts).trend.state;
    };
    expect(build(10, 5)).toBe('better');
    expect(build(5, 10)).toBe('worse');
    expect(build(20, 19)).toBe('same'); // a 5 percent change
    expect(build(0, 0)).toBe('same');
    expect(build(0, 3)).toBe('worse');
  });

  it('has a plain sentence for every state', () => {
    const db = setup();
    expect(getWritingTrends(db, opts).trend.note.length).toBeGreaterThan(10);
  });

  it('totals use the latest version, and wordsLast30 excludes older sessions', () => {
    const db = setup();
    session(db, '2026-11-20', [{ words: 40 }, { words: 50 }]);
    session(db, '2026-09-01', [{ words: 200 }]);
    const t = getWritingTrends(db, opts);
    expect(t.totals).toEqual({ sessions: 2, words: 250, wordsLast30: 50 });
  });

  it('compares repeated problems in the latest 5 sessions with the 5 before, capped at 5, first drafts only', () => {
    const db = setup();
    for (let i = 0; i < 5; i++) session(db, `2026-10-0${i + 1}`, [{ words: 100, issues: ['vocabulary:very', 'vocabulary:very'] }]);
    for (let i = 0; i < 5; i++) {
      session(db, `2026-11-0${i + 1}`, [{ words: 100, issues: ['vocabulary:very', 'grammar:doubled-word'] }, { words: 100, issues: ['punctuation:capital'] }]);
    }
    const t = getWritingTrends(db, opts);
    expect(t.repeatErrors.map((r) => [r.key, r.recent, r.earlier])).toEqual([
      ['grammar:doubled-word', 5, 0],
      ['vocabulary:very', 5, 10],
    ]);
    expect(t.repeatErrors[0].label).toBe('Doubled words');
  });

  it('caps repeated problems at 5', () => {
    const db = setup();
    for (let i = 0; i < 3; i++) session(db, `2026-11-0${i + 1}`, [{ words: 100, issues: ['a:1', 'a:2', 'a:3', 'a:4', 'a:5', 'a:6', 'a:7'] }]);
    expect(getWritingTrends(db, opts).repeatErrors).toHaveLength(5);
  });

  it('forgets a deleted session', () => {
    const db = setup();
    const id = session(db, '2026-11-20', [{ words: 50, issues: issues(3) }]);
    session(db, '2026-11-21', [{ words: 10 }]);
    db.run('DELETE FROM writing_sessions WHERE id = ?', [id]);
    const t = getWritingTrends(db, opts);
    expect(t.sessions).toHaveLength(1);
    expect(t.totals.sessions).toBe(1);
  });

  it('ignores a session with no versions', () => {
    const db = setup();
    db.run("INSERT INTO writing_sessions (mode, title) VALUES ('paragraph', 'empty')");
    expect(getWritingTrends(db, opts).totals.sessions).toBe(0);
  });

  it('respects the limit and lists oldest first', () => {
    const db = setup();
    for (let i = 1; i <= 5; i++) session(db, `2026-11-0${i}`, [{ words: 10 }], `S${i}`);
    expect(getWritingTrends(db, { ...opts, limit: 3 }).sessions.map((s) => s.title)).toEqual(['S3', 'S4', 'S5']);
  });
});

describe('getExpressionUse', () => {
  function withLibrary(): Db {
    const db = setup();
    const add = (id: number, slug: string, text: string) =>
      db.run(
        "INSERT INTO expressions (id, slug, text, kind, simple_meaning, contextual_meaning, usage_notes, register, level, status) VALUES (?, ?, ?, 'word', 'm', 'c', 'u', 'neutral', 'basic', 'published')",
        [id, slug, text],
      );
    add(1, 'whispered', 'whispered');
    add(2, 'furious', 'furious');
    add(3, 'weathered', 'weathered');
    return db;
  }

  it('finds inflected library words in the latest version only', () => {
    const db = withLibrary();
    session(db, '2026-11-20', [{ words: 5, text: 'She was furious and weathered.' }, { words: 5, text: 'She whispers to him.' }]);
    const u = getExpressionUse(db);
    expect(u.libraryWords.map((w) => w.slug)).toEqual(['whispered']);
  });

  it('lists saved notebook words that were used, and the notebook total', () => {
    const db = withLibrary();
    db.run("INSERT INTO notebook_entries (kind, expression_slug, text) VALUES ('library', 'whispered', 'whispered')");
    db.run("INSERT INTO notebook_entries (kind, expression_slug, text) VALUES ('library', 'furious', 'furious')");
    db.run("INSERT INTO notebook_entries (kind, text) VALUES ('custom', 'my own word')");
    session(db, '2026-11-20', [{ words: 5, text: 'He whispered that she was weathered.' }]);
    const u = getExpressionUse(db);
    expect(u.libraryWords.map((w) => w.slug).sort()).toEqual(['weathered', 'whispered']);
    expect(u.notebookWords.map((w) => w.slug)).toEqual(['whispered']);
    expect(u.notebookLibraryTotal).toBe(2);
  });

  it('is empty with no writing and never throws', () => {
    expect(getExpressionUse(withLibrary())).toEqual({ libraryWords: [], notebookWords: [], notebookLibraryTotal: 0 });
  });
});
