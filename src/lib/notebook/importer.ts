import type { Db } from '@/lib/db';
import { insertEntry } from './entries';
import { LIMITS, fail, type Fail } from './limits';

export type ParsedNote = { text: string; meaning: string; source: string | null };

const MAX_NOTES = 5000;
const CALLOUT_START = /^(?:\s*>)+\s*\[!PDF\|/;
const ANY_CALLOUT = /^(?:\s*>)+\s*\[!/;
const QUOTE_PREFIX = /^(?:\s*>)+\s*/;

/** The text shown for the link, such as "The Giver - Lois Lowry, p.3". */
function sourceOf(line: string): string | null {
  const open = line.indexOf('[[');
  if (open === -1) return null;
  const close = line.indexOf(']]', open + 2);
  if (close === -1) return null;
  const inner = line.slice(open + 2, close);
  const bar = inner.lastIndexOf('|');
  const shown = (bar === -1 ? inner.split('#')[0] : inner.slice(bar + 1)).trim();
  return shown || null;
}

/**
 * Read Obsidian PDF-note callouts: a callout line with a link, then the word, then its meaning.
 * One pass over the lines. Spelling and wording are kept exactly as written. Never throws.
 */
export function parseObsidianNotes(input: string): ParsedNote[] {
  const lines = String(input ?? '').split(/\r\n|\r|\n/);
  const notes: ParsedNote[] = [];

  let i = 0;
  while (i < lines.length && notes.length < MAX_NOTES) {
    if (!CALLOUT_START.test(lines[i])) {
      i++;
      continue;
    }
    const source = sourceOf(lines[i]);
    i++;
    const body: string[] = [];
    while (i < lines.length && lines[i].trimStart().startsWith('>') && !ANY_CALLOUT.test(lines[i])) {
      const stripped = lines[i].replace(QUOTE_PREFIX, '').trim();
      if (stripped) body.push(stripped);
      i++;
    }
    if (body.length === 0) continue;
    notes.push({ text: body[0], meaning: body.slice(1).join(' '), source });
  }
  return notes;
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function importNotes(db: Db, notes: ParsedNote[], now: Date = new Date()): { added: number; skipped: number; linked: number } {
  let added = 0;
  let skipped = 0;
  let linked = 0;

  db.transaction(() => {
    for (const n of notes) {
      const text = n.text.replace(/\s+/g, ' ').trim().slice(0, LIMITS.word);
      if (!text) {
        skipped++;
        continue;
      }
      const meaning = n.meaning.trim().slice(0, LIMITS.meaning);

      const same = db.get('SELECT 1 FROM notebook_entries WHERE lower(trim(text)) = lower(trim(?))', [text]);
      if (same) {
        skipped++;
        continue;
      }

      const lib = db.get<{ slug: string }>(
        "SELECT slug FROM expressions WHERE status = 'published' AND (lower(text) = lower(?) OR slug = ?)",
        [text, slugify(text)],
      );
      if (lib && db.get('SELECT 1 FROM notebook_entries WHERE expression_slug = ?', [lib.slug])) {
        skipped++;
        continue;
      }

      insertEntry(db, { kind: 'import', expressionSlug: lib?.slug ?? null, text, myMeaning: meaning, source: n.source }, now);
      added++;
      if (lib) linked++;
    }
  });

  return { added, skipped, linked };
}

export function importFile(
  db: Db,
  text: unknown,
  now: Date = new Date(),
): ({ ok: true; added: number; skipped: number; linked: number; found: number }) | Fail {
  if (typeof text !== 'string') return fail('Send the notes as text.');
  if (text.length > LIMITS.importChars) return fail('That file is too large (limit 1 MB).');
  const notes = parseObsidianNotes(text);
  return { ok: true, found: notes.length, ...importNotes(db, notes, now) };
}
