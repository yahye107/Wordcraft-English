export type Part = { text: string; hit: boolean };

const POSSESSIVE = ['his', 'her', 'their', 'my', 'your', 'our', 'its', 'him', 'them'];
const SUFFIXES = ['ing', 'ed', 'es', 's', 'ly'];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const normalise = (s: string) => s.replace(/[‘’]/g, "'");

function stem(word: string): string {
  const w = word.toLowerCase();
  for (const s of SUFFIXES) if (w.endsWith(s) && w.length - s.length >= 4) return w.slice(0, -s.length);
  return w;
}

/** Candidate patterns, most exact first. */
function patterns(needle: string): RegExp[] {
  const n = normalise(needle).trim();
  if (!n) return [];
  const out: RegExp[] = [new RegExp(escape(n), 'i')];
  const words = n.split(/\s+/);

  if (words.length > 1 && words.some((w) => POSSESSIVE.includes(w.toLowerCase()))) {
    const src = words
      .map((w) => (POSSESSIVE.includes(w.toLowerCase()) ? `(?:${POSSESSIVE.join('|')})` : escape(w)))
      .join('\\s+');
    out.push(new RegExp(src, 'i'));
  }
  if (words.length === 1 && /^[a-z'-]+$/i.test(n) && n.length >= 5) {
    out.push(new RegExp(`\\b${escape(stem(n))}[a-z]*`, 'i'));
  }
  return out;
}

/**
 * Split a sentence into parts so the taught expression can be marked.
 * Marks the first match only. If nothing matches, the whole sentence is returned unmarked.
 */
export function highlightParts(text: string, needle: string): Part[] {
  const haystack = normalise(text);
  for (const re of patterns(needle)) {
    const m = re.exec(haystack);
    if (m && m[0].length > 0) {
      const start = m.index;
      const end = start + m[0].length;
      return [
        ...(start > 0 ? [{ text: text.slice(0, start), hit: false }] : []),
        { text: text.slice(start, end), hit: true },
        ...(end < text.length ? [{ text: text.slice(end), hit: false }] : []),
      ];
    }
  }
  return [{ text, hit: false }];
}
