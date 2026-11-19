import { z } from 'zod';
import type { Db } from '@/lib/db';
import { parseQuery, type ParsedQuery } from '@/lib/search/parse';
import { askClaude } from './client';

const Translation = z.object({
  terms: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
  relation: z
    .object({ type: z.enum(['antonym', 'stronger', 'weaker', 'synonym']), target: z.string() })
    .nullable()
    .default(null),
});

const SYSTEM = `You turn a learner's search request into structured filters for an English expression library.
The library holds words and phrases about emotions, body language, speech, movement, description and writing craft.
Reply with JSON only, in this shape:
{"terms": string[], "exclude": string[], "relation": null | {"type": "antonym"|"stronger"|"weaker"|"synonym", "target": string}}
- "terms": 1 to 5 single English words that name the feeling, action or situation (include close synonyms the learner may not know).
- "exclude": single words the learner said they do not want to use.
- "relation": only when the learner asks for the opposite of, a stronger or weaker version of, or another word for one specific word.
Use lowercase. Do not add commentary.`;

const cleanWords = (words: string[]): string[] => words.flatMap((w) => parseQuery(w).terms);

/**
 * Ask the cheaper model to read a natural-language request. Always safe to call:
 * on any failure it returns the rule-based parse of the same input.
 */
export async function translateQuery(db: Db, raw: string): Promise<ParsedQuery> {
  const fallback = parseQuery(raw);
  const trimmed = raw.trim().slice(0, 500);
  if (!trimmed) return fallback;

  const key = `translate:${trimmed.toLowerCase().replace(/\s+/g, ' ')}`;
  const cached = db.get<{ value: string }>('SELECT value FROM ai_cache WHERE key = ?', [key]);
  if (cached) {
    try {
      return JSON.parse(cached.value) as ParsedQuery;
    } catch {
      /* fall through and ask again */
    }
  }

  try {
    const t = await askClaude({
      db,
      feature: 'smart-search',
      tier: 'cheap',
      system: SYSTEM,
      user: trimmed,
      schema: Translation,
      maxTokens: 1000,
    });

    const terms = cleanWords(t.terms);
    const exclude = cleanWords(t.exclude);
    let relation: ParsedQuery['relation'];
    if (t.relation) {
      const target = cleanWords([t.relation.target])[0];
      if (target) relation = { type: t.relation.type, target };
    }
    const result: ParsedQuery = { raw: trimmed, terms, exclude, relation, empty: terms.length === 0 && !relation };
    if (result.empty) return fallback;

    db.run('INSERT INTO ai_cache (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [
      key,
      JSON.stringify(result),
    ]);
    return result;
  } catch {
    return fallback;
  }
}
