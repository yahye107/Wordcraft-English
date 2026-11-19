import type { Db } from '@/lib/db';
import type { Level, Register } from '@/lib/content/schemas';
import type { ParsedQuery } from './parse';

export type MatchedVia = 'text' | 'phrase' | 'tag' | 'relation';

export type SearchResult = {
  slug: string;
  text: string;
  simpleMeaning: string;
  level: Level;
  register: Register;
  intensity: number | null;
  matchedVia: MatchedVia;
  contrastGroupSlug?: string;
};

type Candidate = { score: number; via: MatchedVia; viaScore: number };

const SUFFIXES = ['ments', 'ment', 'ings', 'ing', 'ness', 'ions', 'ion', 'ed', 'es', 'ly', 's'];

function stemOf(word: string): string {
  const w = word.toLowerCase();
  for (const s of SUFFIXES) if (w.endsWith(s) && w.length - s.length >= 4) return w.slice(0, -s.length);
  return w;
}

function sameWord(candidate: string, stem: string): boolean {
  return stem.length >= 4 ? candidate.startsWith(stem) : candidate === stem;
}

const placeholders = (n: number) => Array(n).fill('?').join(',');

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function ftsQuery(terms: string[]): string {
  // Longer words also match by beginning ("quiet" finds "quietly"); the stemmer does not join them.
  const quoted = terms.map((t) => {
    const clean = t.replace(/"/g, '');
    return clean.length >= 4 ? `"${clean}"*` : `"${clean}"`;
  });
  const clauses = [...quoted];
  if (terms.length > 1) clauses.push(`"${terms.join(' ').replace(/"/g, '')}"`);
  return clauses.join(' OR ');
}

const WEIGHTS = { body: 1, phrase: 1.5, tag: 1.2 } as const;
const BM25 = 'bm25(expressions_fts, 0, 10, 4, 1, 1, 6, 5)';

function ftsHits(db: Db, columns: string, match: string): { id: number; score: number }[] {
  try {
    return db
      .all<{ id: number; rank: number }>(
        `SELECT rowid AS id, ${BM25} AS rank FROM expressions_fts
         WHERE expressions_fts MATCH ? ORDER BY rank LIMIT 80`,
        [`${columns} : (${match})`],
      )
      .map((r) => ({ id: r.id, score: -r.rank }));
  } catch {
    return [];
  }
}

function relatedIds(db: Db, targetIds: number[], type: NonNullable<ParsedQuery['relation']>['type']): number[] {
  if (targetIds.length === 0) return [];
  const ph = placeholders(targetIds.length);
  const q = (sql: string) => db.all<{ id: number }>(sql, targetIds).map((r) => r.id);
  switch (type) {
    case 'antonym':
      return [
        ...q(`SELECT to_id AS id FROM relations WHERE type='antonym' AND from_id IN (${ph})`),
        ...q(`SELECT from_id AS id FROM relations WHERE type='antonym' AND to_id IN (${ph})`),
      ];
    case 'synonym':
      return [
        ...q(`SELECT to_id AS id FROM relations WHERE type IN ('synonym','related') AND from_id IN (${ph})`),
        ...q(`SELECT from_id AS id FROM relations WHERE type IN ('synonym','related') AND to_id IN (${ph})`),
      ];
    case 'stronger':
      return [
        ...q(`SELECT to_id AS id FROM relations WHERE type='stronger' AND from_id IN (${ph})`),
        ...q(`SELECT from_id AS id FROM relations WHERE type='weaker' AND to_id IN (${ph})`),
      ];
    case 'weaker':
      return [
        ...q(`SELECT to_id AS id FROM relations WHERE type='weaker' AND from_id IN (${ph})`),
        ...q(`SELECT from_id AS id FROM relations WHERE type='stronger' AND to_id IN (${ph})`),
      ];
  }
}

export function searchExpressions(db: Db, q: ParsedQuery, opts: { limit?: number } = {}): SearchResult[] {
  if (q.empty) return [];
  const limit = opts.limit ?? 30;
  const cands = new Map<number, Candidate>();

  const add = (id: number, amount: number, via: MatchedVia) => {
    const c = cands.get(id);
    if (!c) cands.set(id, { score: amount, via, viaScore: amount });
    else {
      c.score += amount;
      if (amount > c.viaScore) { c.via = via; c.viaScore = amount; }
    }
  };

  // 1. Lexical search over text, meanings, phrases and tags
  const direct = new Set<number>();
  if (q.terms.length > 0) {
    const match = ftsQuery(q.terms);
    for (const h of ftsHits(db, '{text meanings usage examples}', match)) { add(h.id, h.score * WEIGHTS.body, 'text'); direct.add(h.id); }
    for (const h of ftsHits(db, 'phrases', match)) { add(h.id, h.score * WEIGHTS.phrase, 'phrase'); direct.add(h.id); }
    for (const h of ftsHits(db, 'tags', match)) { add(h.id, h.score * WEIGHTS.tag, 'tag'); direct.add(h.id); }

    // An exact word always ranks first
    const exact = db.all<{ id: number }>(
      `SELECT id FROM expressions WHERE lower(text) IN (${placeholders(q.terms.length)}) OR slug IN (${placeholders(q.terms.length)})`,
      [...q.terms, ...q.terms],
    );
    for (const e of exact) { add(e.id, 50, 'text'); direct.add(e.id); }
  }

  // 2. Relation intent ("opposite of X", "stronger than X", ...)
  const dropIds = new Set<number>();
  if (q.relation) {
    const slug = slugify(q.relation.target);
    const targets = db
      .all<{ id: number }>('SELECT id FROM expressions WHERE slug = ? OR lower(text) = ?', [slug, q.relation.target.toLowerCase()])
      .map((r) => r.id);
    for (const t of targets) dropIds.add(t);
    for (const id of relatedIds(db, targets, q.relation.type)) add(id, 100, 'relation');
  }

  // 3. Widen by one hop from the best direct hits
  const best = [...direct]
    .map((id) => ({ id, score: cands.get(id)!.score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
  for (const { id, score } of best) {
    const hops = db.all<{ id: number }>(
      `SELECT to_id AS id FROM relations WHERE from_id = ? AND type IN ('synonym','related')
       UNION SELECT from_id AS id FROM relations WHERE to_id = ? AND type IN ('synonym','related')`,
      [id, id],
    );
    for (const h of hops) if (!cands.has(h.id)) add(h.id, score * 0.25, 'relation');
  }

  const ids = [...cands.keys()].filter((id) => !dropIds.has(id));
  if (ids.length === 0) return [];

  // 4. Load published rows, apply exclusions
  type Row = {
    id: number; slug: string; text: string; simple_meaning: string; level: Level; register: Register;
    intensity: number | null; phrases: string | null; contrast_group: string | null;
  };
  const rows = db.all<Row>(
    `SELECT e.id, e.slug, e.text, e.simple_meaning, e.level, e.register, e.intensity,
       (SELECT group_concat(phrase, '|') FROM search_phrases sp WHERE sp.expression_id = e.id) AS phrases,
       (SELECT g.slug FROM contrast_group_members m JOIN contrast_groups g ON g.id = m.group_id
         WHERE m.expression_id = e.id ORDER BY g.title LIMIT 1) AS contrast_group
     FROM expressions e WHERE e.status = 'published' AND e.id IN (${placeholders(ids.length)})`,
    ids,
  );

  const stems = q.exclude.map(stemOf);
  const excluded = (r: Row): boolean => {
    if (stems.length === 0) return false;
    const words = [...r.text.toLowerCase().split(/[^a-z']+/), ...r.slug.split('-')].filter(Boolean);
    const singlePhrases = (r.phrases ?? '').toLowerCase().split('|').filter((p) => p && !/\s/.test(p));
    return stems.some((s) => words.some((w) => sameWord(w, s)) || singlePhrases.some((p) => sameWord(p, s)));
  };

  return rows
    .filter((r) => !excluded(r))
    .map((r) => {
      const c = cands.get(r.id)!;
      const result: SearchResult = {
        slug: r.slug,
        text: r.text,
        simpleMeaning: r.simple_meaning,
        level: r.level,
        register: r.register,
        intensity: r.intensity,
        matchedVia: c.via,
      };
      if (r.contrast_group) result.contrastGroupSlug = r.contrast_group;
      return { result, score: c.score };
    })
    .sort((a, b) => b.score - a.score || a.result.text.localeCompare(b.result.text))
    .slice(0, limit)
    .map((x) => x.result);
}
