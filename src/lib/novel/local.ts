import type { Db } from '@/lib/db';
import { parseAnnotated } from '@/lib/annotate';
import { annotatePassage, sanitise } from './annotate';
import { speechVerbsFromLibrary } from './speech-verbs';
import { techniqueInfo } from './techniques';
import type { LocalAnalysis, TechniqueHit, VocabHit } from './types';

const MAX_VOCAB = 20;
const MAX_UNFAMILIAR = 10;
// Words of 7 letters are mostly ones a reader of novels already knows (quietly, explain), so start at 8.
const MIN_UNFAMILIAR_LENGTH = 8;

const POSSESSIVE = ['his', 'her', 'their', 'my', 'your', 'our', 'its', 'him', 'them'];
const SUFFIX_OK = new Set(['', 's', 'es', 'ed', 'd', 'ing', 'ly', 'er', 'ers', 'ness']);
const SHORT_SUFFIX_OK = new Set(['', 's', 'es', 'ed', 'd', 'ing']);
const SUFFIXES = ['ing', 'ed', 'es', 's', 'ly'];

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const norm = (s: string) => s.replace(/[‘’]/g, "'"); // same length, so offsets still line up

type Token = { text: string; lower: string; start: number; end: number };
type Expr = { slug: string; text: string; simple_meaning: string; level: string };
type Hit = { slug: string; start: number; end: number };

function tokenise(s: string): Token[] {
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

/** Library expressions found in the passage: first match of each, no overlaps, in order of position. */
function findHits(db: Db, s: string, tokens: Token[]): { hits: Hit[]; exprs: Map<string, Expr> } {
  const exprs = new Map<string, Expr>();
  const rows = db.all<Expr>("SELECT slug, text, simple_meaning, level FROM expressions WHERE status = 'published' ORDER BY id");
  const hay = norm(s);
  const all: Hit[] = [];

  for (const e of rows) {
    exprs.set(e.slug, { slug: e.slug, text: e.text, simple_meaning: e.simple_meaning, level: e.level });
    const word = norm(e.text).trim().toLowerCase();
    if (/^\p{L}+$/u.test(word)) {
      const stems = word.length >= 5 ? stemsOf(word) : [];
      const t = tokens.find((tok) => matchesWord(word, stems, tok.lower));
      if (t) all.push({ slug: e.slug, start: t.start, end: t.end });
    } else {
      const re = phraseRegex(e.text);
      const m = re?.exec(hay);
      if (m && m[0].length > 0) all.push({ slug: e.slug, start: m.index, end: m.index + m[0].length });
    }
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

const COMMON_LONG_WORDS = new Set(
  (
    'something everything anything nothing because through another without between however himself herself ' +
    'themselves yourself myself together suddenly sometimes probably certainly remember thought brought ' +
    'morning evening someone everyone anyone whatever whenever wherever although nobody outside inside towards ' +
    'against already perhaps believe understand different important example through thinking looking walking ' +
    'talking waiting wanting trying getting nothing question another between country everybody anybody ' +
    'children daughter brother mother father husband friends people believed started wanted decided stopped ' +
    'finally quickly slowly usually actually completely absolutely seemed continued following afternoon tonight ' +
    'yesterday tomorrow weekend suppose happened without whether during several nothing instead enough ' +
    'sentence sentences language beautiful wonderful dangerous important possible whatever everything'
  ).split(/\s+/),
);

const STOP_WORDS = new Set(
  (
    'that with have from they this were been there their would could about which when what then them said asked ' +
    'into over under than very just also only some more most much many such even each other your will your ' +
    'while where after before again still back down here came went made make like long look looked'
  ).split(/\s+/),
);

const SENSORY = new Set(
  (
    'glittered shimmered gleamed glowed glowing sparkled flickered hummed echoed rustled creaked whispered crackled ' +
    'scent aroma smelled smell stench perfume fragrance bitter sweet sour salty rough smooth cold warm damp silky ' +
    'crisp velvet icy burning cool chilly stinging sticky scorching'
  ).split(/\s+/),
);

const SENTENCE_START_PREV = new Set(['.', '!', '?', '…']);
const SKIP_BEFORE = new Set(['“', '"', '«', '„', '‘', "'", '(', '”', '’', '»']);

/** True when the token begins a sentence (so a capital letter does not mean it is a name). */
function startsSentence(s: string, start: number): boolean {
  let k = start - 1;
  while (k >= 0 && (/\s/u.test(s[k]) || SKIP_BEFORE.has(s[k]))) k--;
  return k < 0 || SENTENCE_START_PREV.has(s[k]) || s[k] === ':';
}

function unfamiliarWords(s: string, tokens: Token[], hits: Hit[]): string[] {
  const seen = new Set<string>();
  const found: { word: string; start: number }[] = [];
  for (const t of tokens) {
    if (t.text.length < MIN_UNFAMILIAR_LENGTH || !/^\p{L}+$/u.test(t.text)) continue;
    if (COMMON_LONG_WORDS.has(t.lower) || seen.has(t.lower)) continue;
    if (hits.some((h) => t.start < h.end && t.end > h.start)) continue;
    if (/\p{Lu}/u.test(t.text[0]) && !startsSentence(s, t.start)) continue;
    seen.add(t.lower);
    found.push({ word: t.lower, start: t.start });
  }
  found.sort((a, b) => b.word.length - a.word.length || a.start - b.start);
  return found.slice(0, MAX_UNFAMILIAR).map((f) => f.word);
}

const NOT_SIMILE_BEFORE = new Set([
  'i', 'you', 'we', 'they', 'would', 'wouldnt', 'do', 'dont', "don't", 'did', "didn't", 'will', 'might', 'could', 'to', 'people', 'who',
]);
const NOT_SIMILE_MIDDLE = new Set(['soon', 'long', 'much', 'many', 'far', 'well', 'quickly', 'early', 'late', 'possible', 'usual']);

function findSimile(s: string): string | null {
  const hay = norm(s);
  for (const m of hay.matchAll(/(?<![\p{L}])like (?:a|an|the) \p{L}+/giu)) {
    const before = hay.slice(Math.max(0, m.index - 24), m.index);
    const prev = /(\p{L}+(?:'\p{L}+)?)\W*$/u.exec(before)?.[1]?.toLowerCase();
    if (prev && NOT_SIMILE_BEFORE.has(prev)) continue;
    return s.slice(m.index, m.index + m[0].length);
  }
  for (const m of hay.matchAll(/(?<![\p{L}])as (\p{L}+) as (?:(?:a|an|the) )?\p{L}+/giu)) {
    if (NOT_SIMILE_MIDDLE.has(m[1].toLowerCase())) continue;
    return s.slice(m.index, m.index + m[0].length);
  }
  return null;
}

function findRepetition(tokens: Token[]): string | null {
  const counts = new Map<string, { n: number; first: Token }>();
  for (const t of tokens) {
    if (t.lower.length < 4 || STOP_WORDS.has(t.lower) || !/^\p{L}+$/u.test(t.text)) continue;
    const c = counts.get(t.lower);
    if (c) c.n++;
    else counts.set(t.lower, { n: 1, first: t });
  }
  let best: { n: number; first: Token } | null = null;
  for (const c of counts.values()) if (c.n >= 3 && (!best || c.n > best.n || (c.n === best.n && c.first.start < best.first.start))) best = c;
  return best ? best.first.text : null;
}

function findListOfThree(s: string): string | null {
  const m = /(?<![\p{L}])\p{L}+, \p{L}+,? (?:and|or) \p{L}+/u.exec(s);
  return m ? m[0] : null;
}

function findSensory(tokens: Token[]): string | null {
  const hits = tokens.filter((t) => SENSORY.has(t.lower));
  return new Set(hits.map((h) => h.lower)).size >= 2 ? hits[0].text : null;
}

/**
 * Local (no network) analysis of a pasted passage: colour marks, library words, words to look up and the
 * techniques it can recognise. Everything here is a guess from simple rules and is shown as such.
 */
export function analyseLocalPassage(db: Db, text: string): LocalAnalysis {
  const s = sanitise(text);
  const ann = annotatePassage(text, speechVerbsFromLibrary(db));
  const tokens = tokenise(s);
  const { hits, exprs } = findHits(db, s, tokens);

  const vocabulary: VocabHit[] = hits.slice(0, MAX_VOCAB).map((h) => {
    const e = exprs.get(h.slug)!;
    return { slug: e.slug, text: e.text, simpleMeaning: e.simple_meaning, level: e.level, quote: s.slice(h.start, h.end) };
  });

  const found = new Map<string, string>();
  const add = (name: string, quote: string | null | undefined) => {
    if (quote && !found.has(name)) found.set(name, quote);
  };
  add('Dialogue tag', ann.tags[0]);
  add('Action beat', ann.beats[0]);
  add('Participial phrase', ann.participles[0]);
  add('Subordinate clause', ann.subordinates[0]);
  add('Linking word', parseAnnotated(ann.markup).find((x) => x.kind === 'link')?.text);
  for (let i = 1; i < ann.sentences.length; i++) {
    if (ann.sentences[i].words <= 4 && ann.sentences[i - 1].words >= 14) {
      add('Short sentence for effect', ann.sentences[i].text);
      break;
    }
  }
  add('Simile', findSimile(s));
  add('Repetition', findRepetition(tokens));
  add('List of three', findListOfThree(s));
  add('Sensory detail', findSensory(tokens));

  const techniques: TechniqueHit[] = [...found].map(([name, quote]) => {
    const info = techniqueInfo(name);
    return { name, quote, note: info.note, lessonHref: info.lessonHref };
  });
  techniques.sort((a, b) => order(a.name) - order(b.name));

  return {
    markup: ann.markup,
    sentences: ann.sentences,
    stats: ann.stats,
    vocabulary,
    unfamiliar: unfamiliarWords(s, tokens, hits),
    techniques,
  };
}

const NAMES = [
  'Dialogue tag', 'Action beat', 'Participial phrase', 'Subordinate clause', 'Linking word',
  'Short sentence for effect', 'Simile', 'Repetition', 'List of three', 'Sensory detail',
];
const order = (n: string) => NAMES.indexOf(n);
