import type { Db } from '@/lib/db';

/**
 * Finds library expressions in a piece of text: single words (with common endings: whispers, whispered,
 * whispering) and phrases (with a changed possessive: folded her arms, folded his arms). Never matches inside a
 * longer word. Shared by the novel lab and the progress pages.
 */

const POSSESSIVE = ['his', 'her', 'their', 'my', 'your', 'our', 'its', 'him', 'them'];
const SUFFIX_OK = new Set(['', 's', 'es', 'ed', 'd', 'ing', 'ly', 'er', 'ers', 'ness']);
const SHORT_SUFFIX_OK = new Set(['', 's', 'es', 'ed', 'd', 'ing']);
const SUFFIXES = ['ing', 'ed', 'es', 's', 'ly'];

export const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const norm = (s: string) => s.replace(/[‘’]/g, "'"); // same length, so offsets still line up

export type Token = { text: string; lower: string; start: number; end: number };
export type Expr = { slug: string; text: string; simple_meaning: string; level: string };
export type Hit = { slug: string; start: number; end: number };

export function tokenise(s: string): Token[] {
  const out: Token[] = [];
  for (const m of s.matchAll(WORD_RE)) out.push({ text: m[0], lower: m[0].toLowerCase(), start: m.index, end: m.index + m[0].length });
  return out;
}

/** Likely stems of a single word: the word with a common suffix removed, with and without a final e. */
function stemsOf(w: string): string[] {
  let stem = w;
  for (const s of SUFFIXES) {
    if (w.endsWith(s) && w.length - s.length >= 4) {
      stem = w.slice(0, -s.length);
      break;
    }
  }
  const out = [stem];
  if (stem.endsWith('e') && stem.length - 1 >= 4) out.push(stem.slice(0, -1));
  return out;
}

function matchesWord(word: string, stems: string[], token: string): boolean {
  if (token === word) return true;
  if (word.length < 5) {
    return token.startsWith(word) && SHORT_SUFFIX_OK.has(token.slice(word.length)) && token.length > word.length;
  }
  return stems.some((stem) => {
    if (!token.startsWith(stem)) return false;
    const rest = token.slice(stem.length);
    if (!SUFFIX_OK.has(rest)) return false;
    return rest !== '' || stem.length >= 5;
  });
}

function phraseRegex(text: string): RegExp | null {
  const words = norm(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;
  const parts = words.map((w) => (POSSESSIVE.includes(w.toLowerCase()) ? `(?:${POSSESSIVE.join('|')})` : escape(w)));
  try {
    return new RegExp(`(?<![\\p{L}\\p{N}])${parts.join('\\s+')}(?![\\p{L}\\p{N}])`, 'iu');
  } catch {
    return null;
  }
}

/** Where one expression first appears in a passage (`hay` is `norm(passage)`), or null. Pure. */
export function matchExpression(exprText: string, hay: string, tokens: Token[]): { start: number; end: number } | null {
  const word = norm(exprText).trim().toLowerCase();
  if (/^\p{L}+$/u.test(word)) {
    const stems = word.length >= 5 ? stemsOf(word) : [];
    const t = tokens.find((tok) => matchesWord(word, stems, tok.lower));
    return t ? { start: t.start, end: t.end } : null;
  }
  const m = phraseRegex(exprText)?.exec(hay);
  return m && m[0].length > 0 ? { start: m.index, end: m.index + m[0].length } : null;
}

/** True when the passage contains the expression (inflected single words and a changed possessive count). */
export function containsExpression(exprText: string, passage: string): boolean {
  return matchExpression(exprText, norm(passage), tokenise(passage)) !== null;
}

/** Library expressions found in the passage: first match of each, no overlaps, in order of position. */
export function findHits(db: Db, s: string, tokens: Token[]): { hits: Hit[]; exprs: Map<string, Expr> } {
  const exprs = new Map<string, Expr>();
  const rows = db.all<Expr>("SELECT slug, text, simple_meaning, level FROM expressions WHERE status = 'published' ORDER BY id");
  const hay = norm(s);
  const all: Hit[] = [];

  for (const e of rows) {
    exprs.set(e.slug, { slug: e.slug, text: e.text, simple_meaning: e.simple_meaning, level: e.level });
    const m = matchExpression(e.text, hay, tokens);
    if (m) all.push({ slug: e.slug, start: m.start, end: m.end });
  }

  // Earlier first, and the longer match wins when two overlap.
  all.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));
  const kept: Hit[] = [];
  let lastEnd = -1;
  for (const h of all) {
    if (h.start < lastEnd) continue;
    kept.push(h);
    lastEnd = h.end;
  }
  return { hits: kept, exprs };
}

export type ExpressionMatch = { slug: string; text: string; quote: string; start: number; end: number };

/** The first match of each published expression, without overlaps, in order of position. */
export function findExpressionsIn(db: Db, text: string): ExpressionMatch[] {
  const { hits, exprs } = findHits(db, text, tokenise(text));
  return hits.map((h) => ({ slug: h.slug, text: exprs.get(h.slug)!.text, quote: text.slice(h.start, h.end), start: h.start, end: h.end }));
}
