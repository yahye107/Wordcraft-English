import type { Db } from '@/lib/db';

/**
 * Common verbs of speaking, past tense. A verb that only describes a sound or a gesture (sighed, laughed,
 * smiled) is deliberately left out: those make a beat, not a dialogue tag.
 */
export const SPEECH_VERBS: ReadonlySet<string> = new Set([
  'said', 'says', 'asked', 'replied', 'answered', 'responded', 'whispered', 'murmured', 'muttered', 'mumbled',
  'snapped', 'exclaimed', 'remarked', 'protested', 'shouted', 'yelled', 'cried', 'called', 'added', 'explained',
  'suggested', 'insisted', 'demanded', 'declared', 'announced', 'continued', 'admitted', 'warned', 'whined',
  'groaned', 'growled', 'hissed', 'sneered', 'stammered', 'stuttered', 'urged', 'wondered', 'observed', 'begged',
  'pleaded', 'cautioned', 'agreed', 'objected', 'retorted', 'quipped', 'breathed', 'barked', 'bellowed', 'blurted',
]);

/** The built-in verbs plus every published single-word expression in the dialogue-tag categories. */
export function speechVerbsFromLibrary(db: Db): Set<string> {
  const out = new Set<string>(SPEECH_VERBS);
  const rows = db.all<{ text: string }>(
    `SELECT DISTINCT e.text FROM expressions e
       JOIN expression_categories ec ON ec.expression_id = e.id
       JOIN categories c ON c.id = ec.category_id
       LEFT JOIN categories p ON p.id = c.parent_id
      WHERE e.status = 'published'
        AND (c.slug = 'speaking-styles-and-dialogue-tags' OR p.slug = 'speaking-styles-and-dialogue-tags')`,
  );
  for (const r of rows) {
    const w = r.text.trim().toLowerCase();
    if (/^\p{L}+$/u.test(w)) out.add(w);
  }
  return out;
}
