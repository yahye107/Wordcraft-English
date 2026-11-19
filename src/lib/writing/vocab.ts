import type { Db } from '@/lib/db';
import { parseQuery } from '@/lib/search/parse';
import { searchExpressions } from '@/lib/search/search';

export type VocabItem = {
  slug: string;
  text: string;
  simpleMeaning: string;
  register: string;
  intensity: number | null;
  note?: string;
};

export type VocabResult = {
  word: string;
  groups: { slug: string; title: string; explanation: string; items: VocabItem[] }[];
  loose: VocabItem[];
};

const MAX_WORD = 40;

/** Better words for a basic one, grouped so near-synonyms sit together with what makes each different. */
export function findAlternatives(db: Db, wordInput: string, sentence?: string): VocabResult {
  const word = String(wordInput ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}'’ -]/gu, ' ')
    .trim()
    .slice(0, MAX_WORD);
  const empty: VocabResult = { word, groups: [], loose: [] };
  if (!word) return empty;

  const q = parseQuery(word);
  if (q.empty) return empty;
  const results = searchExpressions(db, q, { limit: 30 }).filter((r) => r.text.toLowerCase() !== word);

  const dialogue = typeof sentence === 'string' && /["“”]/.test(sentence.slice(0, 500));
  const rank = (register: string) => (dialogue ? (register === 'literary' ? 1 : 0) : 0);

  const item = (r: { slug: string; text: string; simpleMeaning: string; register: string; intensity: number | null }, note?: string): VocabItem => ({
    slug: r.slug,
    text: r.text,
    simpleMeaning: r.simpleMeaning,
    register: r.register,
    intensity: r.intensity,
    ...(note ? { note } : {}),
  });

  const groupSlugs: string[] = [];
  for (const r of results) {
    if (r.contrastGroupSlug && !groupSlugs.includes(r.contrastGroupSlug)) groupSlugs.push(r.contrastGroupSlug);
  }

  const groups = groupSlugs.flatMap((slug) => {
    const g = db.get<{ id: number; title: string; explanation: string }>('SELECT id, title, explanation FROM contrast_groups WHERE slug = ?', [slug]);
    if (!g) return [];
    const members = db
      .all<{ slug: string; text: string; simple_meaning: string; register: string; intensity: number | null; note: string }>(
        `SELECT e.slug, e.text, e.simple_meaning, e.register, e.intensity, m.note
         FROM contrast_group_members m JOIN expressions e ON e.id = m.expression_id
         WHERE m.group_id = ? AND e.status = 'published' ORDER BY m.sort`,
        [g.id],
      )
      .filter((m) => m.text.toLowerCase() !== word)
      .map((m) => item({ slug: m.slug, text: m.text, simpleMeaning: m.simple_meaning, register: m.register, intensity: m.intensity }, m.note));
    return members.length > 0 ? [{ slug, title: g.title, explanation: g.explanation, items: members.sort((a, b) => rank(a.register) - rank(b.register)) }] : [];
  });

  const inGroups = new Set(groups.flatMap((g) => g.items.map((i) => i.slug)));
  const loose = results.filter((r) => !inGroups.has(r.slug)).map((r) => item(r)).sort((a, b) => rank(a.register) - rank(b.register));

  return { word, groups, loose };
}
