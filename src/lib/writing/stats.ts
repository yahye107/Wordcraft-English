import type { Db } from '@/lib/db';
import { highlightParts } from '@/lib/highlight';

export type Weakness = { category: string; key: string; label: string; count: number; lastSeen: string };

const LABELS: Record<string, string> = {
  'vocabulary:very': 'Using “very” instead of a stronger word',
  'vocabulary:really': 'Using “really” instead of a stronger word',
  'vocabulary:good': 'Overusing “good”',
  'vocabulary:bad': 'Overusing “bad”',
  'vocabulary:nice': 'Overusing “nice”',
  'vocabulary:got': 'Overusing “got”',
  'vocabulary:thing': 'Vague words like “thing”',
  'vocabulary:things': 'Vague words like “things”',
  'vocabulary:big': 'Overusing “big”',
  'vocabulary:stuff': 'Vague words like “stuff”',
  'grammar:doubled-word': 'Doubled words',
  'punctuation:capital': 'Missing capital letters at sentence starts',
  'structure:same-start': 'Sentences that start the same way',
  'structure:long-sentence': 'Very long sentences',
  'structure:same-length': 'Sentences all the same length',
};

export function labelFor(category: string, key: string): string {
  if (LABELS[key]) return LABELS[key];
  if (key.startsWith('naturalness:repeat:')) return 'Repeating the same word close together';
  if (key.startsWith('structure:same-start:')) return LABELS['structure:same-start'];
  const type = key.split(':').slice(1).join(' ').replace(/-/g, ' ').trim();
  const cap = category.charAt(0).toUpperCase() + category.slice(1);
  return type && type !== 'other' ? `${cap}: ${type}` : cap;
}

/** Problems seen at least 3 times in the last `days` days, most frequent first. */
export function getWeaknesses(db: Db, opts: { days?: number; limit?: number } = {}): Weakness[] {
  const since = new Date(Date.now() - (opts.days ?? 30) * 86_400_000).toISOString();
  return db
    .all<{ category: string; key: string; count: number; last_seen: string }>(
      'SELECT category, key, count, last_seen FROM weakness_stats WHERE count >= 3 AND last_seen >= ? ORDER BY count DESC, last_seen DESC LIMIT ?',
      [since, opts.limit ?? 10],
    )
    .map((r) => ({ category: r.category, key: r.key, label: labelFor(r.category, r.key), count: r.count, lastSeen: r.last_seen }));
}

export type ProgressPoint = { sessionId: number; title: string; date: string; words: number; issuesPer100Words: number };

/** For each session, the number of issues in its latest version per 100 words, oldest first. */
export function getProgress(db: Db, limit = 20): ProgressPoint[] {
  const rows = db.all<{ id: number; title: string; created_at: string; words: number; issues: number }>(
    `SELECT s.id, s.title, s.created_at,
       r.word_count AS words,
       (SELECT COUNT(*) FROM feedback_items f WHERE f.revision_id = r.id) AS issues
     FROM writing_sessions s
     JOIN writing_revisions r ON r.session_id = s.id
       AND r.version = (SELECT MAX(version) FROM writing_revisions WHERE session_id = s.id)
     ORDER BY s.created_at DESC, s.id DESC LIMIT ?`,
    [limit],
  );
  return rows
    .reverse()
    .map((r) => ({
      sessionId: r.id,
      title: r.title,
      date: r.created_at,
      words: r.words,
      issuesPer100Words: r.words > 0 ? Math.round((r.issues / r.words) * 1000) / 10 : 0,
    }));
}

/** Which of the given expressions (by slug) appear in the text, including inflected forms. */
export function getUsedExpressions(db: Db, text: string, slugs: string[]): string[] {
  const used: string[] = [];
  for (const slug of slugs) {
    const e = db.get<{ text: string }>('SELECT text FROM expressions WHERE slug = ?', [slug]);
    if (e && highlightParts(text, e.text).some((p) => p.hit)) used.push(slug);
  }
  return used;
}
