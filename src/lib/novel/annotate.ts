import type { PassageStats, SentenceInfo } from './types';

/**
 * Local passage annotator. Everything here is a heuristic, shown to the learner as an "automatic guess".
 * Rules, in short:
 *  - Text in paired double quotation marks (curly, straight, French, German) is speech. An unclosed quote runs
 *    to the end of its sentence. Single quotes (British style) count only when an opening one after a space is
 *    properly closed; otherwise they are apostrophes, so contractions can never confuse it.
 *  - In a sentence that also has speech, narration that contains a speech verb is a tag, and narration with an
 *    action verb is a beat. A narration sentence right after speech is a tag if it holds a speech verb and is
 *    short; a short narration sentence beside speech with an action verb is a beat. Narration with no speech
 *    nearby is never a tag or a beat.
 *  - In other narration: a clause that opens with a subordinating word is sub, a comma-set -ing or -ed phrase is
 *    part, a linking word at the start is link, and the rest of such a sentence is main.
 * Marks never overlap, never contain whitespace at either end, and never change the text: removing the markup
 * gives back the sanitised passage exactly.
 */

export type Annotation = {
  markup: string;
  sentences: SentenceInfo[];
  tags: string[];
  beats: string[];
  participles: string[];
  subordinates: string[];
  stats: PassageStats;
};

type Mark = { start: number; end: number; kind: 'speech' | 'tag' | 'beat' | 'sub' | 'part' | 'link' | 'main' };
type Range = { start: number; end: number };

/** Pasted braces would be read as annotation marks, so they become parentheses first. */
export const sanitise = (text: string): string => text.replace(/\{/g, '(').replace(/\}/g, ')');

const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'prof', 'mt', 'vs', 'e.g', 'i.e']);
const CLOSERS = new Set(['”', '’', '"', '»', ')', ']', "'", '“']);
const TERMINALS = new Set(['.', '!', '?', '…']);
const isSpace = (c: string) => /\s/u.test(c);
const isLower = (c: string) => /\p{Ll}/u.test(c);
const hasLetters = (t: string) => /\p{L}/u.test(t);

/** Index just past the sentence-ending punctuation (and closing quotes) that starts at `i`, or -1. */
function terminatorEnd(s: string, i: number): number {
  if (!TERMINALS.has(s[i])) return -1;
  let j = i;
  while (j < s.length && TERMINALS.has(s[j])) j++;
  while (j < s.length && CLOSERS.has(s[j])) j++;
  return j;
}

function isAbbreviation(s: string, dot: number): boolean {
  if (s[dot] !== '.') return false;
  let k = dot;
  while (k > 0 && /[\p{L}.]/u.test(s[k - 1])) k--;
  const word = s.slice(k, dot).toLowerCase();
  return ABBREVIATIONS.has(word);
}

/** Sentences with their start offsets. Never returns an empty sentence. */
export function splitSentences(text: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const n = text.length;
  let from = 0;

  const push = (a: number, b: number) => {
    while (a < b && isSpace(text[a])) a++;
    while (b > a && isSpace(text[b - 1])) b--;
    if (b > a) out.push({ text: text.slice(a, b), start: a });
  };

  let i = 0;
  while (i < n) {
    const c = text[i];
    if (c === '\n') {
      push(from, i);
      from = i + 1;
      i++;
      continue;
    }
    const end = terminatorEnd(text, i);
    if (end === -1) {
      i++;
      continue;
    }
    if (end === i + 1 && isAbbreviation(text, i)) {
      i = end;
      continue;
    }
    // A boundary needs whitespace (or the end) after the punctuation, and no lower-case letter after that.
    if (end >= n) {
      push(from, n);
      from = n;
      i = n;
      continue;
    }
    if (!isSpace(text[end])) {
      i = end;
      continue;
    }
    let k = end;
    while (k < n && isSpace(text[k]) && text[k] !== '\n') k++;
    if (k < n && text[k] !== '\n' && isLower(text[k])) {
      i = end;
      continue;
    }
    push(from, end);
    from = end;
    i = end;
  }
  push(from, n);
  return out;
}

const OPENERS: Record<string, string[]> = { '“': ['”'], '«': ['»'], '„': ['“', '”'], '"': ['"'] };
const SINGLE_OPENERS = new Set(['‘', "'"]);

/** End (exclusive) of a British-style single-quoted span that opens at `i`, or -1 when it is not one. */
function singleQuoteEnd(s: string, i: number): number {
  if (i > 0 && !/[\s(\[—–-]/u.test(s[i - 1])) return -1;
  if (i + 1 >= s.length || !/[\p{L}\p{N}…]/u.test(s[i + 1])) return -1;
  for (let j = i + 2; j < s.length; j++) {
    if (s[j] === '\n') return -1;
    if (s[j] !== '’' && s[j] !== "'") continue;
    // A real closing quote follows speech punctuation (‘Yes,’ ‘Why?’) or is followed by it (‘Stop’, he said).
    // That keeps possessive plurals (the dogs' bones) from closing a quote.
    const prev = s[j - 1];
    const next = s[j + 1];
    const afterPunct = /[,.!?…;:—]/u.test(prev) && (next === undefined || !/\p{L}/u.test(next));
    const beforePunct = !isSpace(prev) && next !== undefined && /[,.;:!?)—]/u.test(next);
    if (afterPunct || beforePunct) return j + 1;
  }
  return -1;
}

/** End (exclusive) of the sentence that contains position `from`. */
function sentenceEndFrom(s: string, from: number): number {
  for (let k = from; k < s.length; k++) {
    if (s[k] === '\n') return k;
    const end = terminatorEnd(s, k);
    if (end !== -1 && !(end === k + 1 && isAbbreviation(s, k)) && (end >= s.length || isSpace(s[end]))) return end;
  }
  return s.length;
}

function speechRanges(s: string): Range[] {
  const out: Range[] = [];
  let i = 0;
  while (i < s.length) {
    if (SINGLE_OPENERS.has(s[i])) {
      const end = singleQuoteEnd(s, i);
      if (end === -1) i++;
      else {
        out.push({ start: i, end });
        i = end;
      }
      continue;
    }
    const closers = OPENERS[s[i]];
    if (!closers) {
      i++;
      continue;
    }
    let close = -1;
    for (let j = i + 1; j < s.length; j++) {
      if (closers.includes(s[j])) {
        close = j;
        break;
      }
      if (s[j] === '\n') break; // a quote does not run over a line break
    }
    const end = close === -1 ? Math.max(sentenceEndFrom(s, i + 1), i + 1) : close + 1;
    out.push({ start: i, end });
    i = end;
  }
  return out;
}

const WORD_RE = /[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu;
const wordsOf = (t: string): string[] => (t.match(WORD_RE) ?? []).map((w) => w.toLowerCase());

const IRREGULAR_ACTION = new Set([
  'ran', 'sat', 'stood', 'took', 'got', 'went', 'came', 'threw', 'shook', 'held', 'kept', 'left', 'rose', 'fell', 'lay',
  'laid', 'shut', 'hit', 'cut', 'put', 'set', 'spun', 'swung', 'led', 'struck', 'strode', 'sprang', 'leapt', 'sank',
  'drew', 'froze', 'bit', 'broke', 'tore', 'pulled', 'pushed', 'slid', 'ate', 'drank', 'stepped',
]);
const NOT_ACTION = new Set([
  'need', 'indeed', 'hundred', 'speed', 'seed', 'feed', 'bleed', 'breed', 'weed', 'tired', 'scared', 'worried',
  'excited', 'bored', 'surprised', 'confused', 'pleased', 'annoyed', 'interested', 'relaxed', 'exhausted',
  'embarrassed', 'disappointed', 'ashamed', 'frightened', 'delighted', 'determined', 'married', 'used', 'supposed',
  'red', 'bed', 'shed', 'instead',
]);
const BE_WORDS = new Set(['was', 'were', 'is', 'are', 'am', 'be', 'been', 'being', 'felt', 'seemed', 'became', 'so', 'very', 'too']);

function hasActionVerb(words: string[], speech: ReadonlySet<string>): boolean {
  return words.some((w, i) => {
    if (speech.has(w)) return false;
    if (IRREGULAR_ACTION.has(w)) return true;
    return w.length >= 4 && w.endsWith('ed') && !NOT_ACTION.has(w) && !BE_WORDS.has(words[i - 1] ?? '');
  });
}

const hasSpeechVerb = (words: string[], speech: ReadonlySet<string>) => words.some((w) => speech.has(w));

const SUBORDINATORS = new Set([
  'because', 'although', 'though', 'while', 'when', 'if', 'unless', 'since', 'as', 'after', 'before', 'until',
]);
// Safe to recognise in the middle of a clause, with no comma before them.
const MID_SUBORDINATORS = new Set(['because', 'although', 'though', 'unless', 'until', 'while', 'whenever']);
const LINK_RE = /^(?:however|nevertheless|therefore|meanwhile|moreover|but|yet|so)(?![\p{L}])[,]?/iu;
const NOT_PARTICIPLE = new Set([
  'during', 'morning', 'evening', 'nothing', 'something', 'anything', 'everything', 'spring', 'string', 'bring',
  'ceiling', 'building', 'indeed', 'instead', 'need', 'feeling', 'wedding', 'meeting', 'evening',
]);

const isParticipleWord = (w: string, allowEd: boolean): boolean => {
  if (NOT_PARTICIPLE.has(w)) return false;
  if (w.length >= 5 && w.endsWith('ing')) return true;
  return allowEd && w.length >= 4 && w.endsWith('ed');
};

const firstWord = (t: string): string => wordsOf(t.slice(0, 40))[0] ?? '';

/** Clause marks for one stretch of narration `t` that starts at absolute offset `base`. */
function clauseMarks(t: string, base: number): Mark[] {
  const marks: Mark[] = [];
  let pos = 0;

  const link = LINK_RE.exec(t);
  if (link) {
    marks.push({ start: base, end: base + link[0].length, kind: 'link' });
    pos = link[0].length;
  }
  while (pos < t.length && isSpace(t[pos])) pos++;

  // Comma-separated chunks of the rest.
  const chunks: Range[] = [];
  let cs = pos;
  for (let i = pos; i <= t.length; i++) {
    if (i === t.length || t[i] === ',') {
      const e = i < t.length ? i + 1 : i;
      if (e > cs && hasLetters(t.slice(cs, e))) chunks.push({ start: cs, end: e });
      cs = e;
      while (cs < t.length && isSpace(t[cs])) cs++;
      i = Math.max(i, cs - 1);
    }
  }

  const inner: Mark[] = [];
  chunks.forEach((c, idx) => {
    const text = t.slice(c.start, c.end);
    const first = firstWord(text);
    const last = idx === chunks.length - 1;
    if (SUBORDINATORS.has(first)) {
      inner.push({ start: c.start, end: c.end, kind: 'sub' });
    } else if (idx === 0 && !last && isParticipleWord(first, true)) {
      inner.push({ start: c.start, end: c.end, kind: 'part' });
    } else if (idx > 0 && last && isParticipleWord(first, false)) {
      inner.push({ start: c.start, end: c.end, kind: 'part' });
    } else {
      // Look for a clause that starts in the middle of this chunk.
      let split = -1;
      for (const m of text.matchAll(WORD_RE)) {
        if (m.index > 0 && MID_SUBORDINATORS.has(m[0].toLowerCase())) {
          split = m.index;
          break;
        }
      }
      if (split > 0) {
        inner.push({ start: c.start, end: c.start + split, kind: 'main' });
        inner.push({ start: c.start + split, end: c.end, kind: 'sub' });
      } else {
        inner.push({ start: c.start, end: c.end, kind: 'main' });
      }
    }
  });

  const interesting = inner.some((m) => m.kind === 'sub' || m.kind === 'part');
  if (interesting) {
    for (const m of inner) {
      const prev = marks[marks.length - 1];
      if (m.kind === 'main' && prev && prev.kind === 'main') {
        prev.end = base + m.end;
      } else {
        marks.push({ start: base + m.start, end: base + m.end, kind: m.kind });
      }
    }
  }
  return marks.map((m) => trimMark(t, base, m)).filter((m): m is Mark => m !== null);
}

/** Trim whitespace off both ends of a mark (offsets are absolute, `t` starts at `base`). */
function trimMark(t: string, base: number, m: Mark): Mark | null {
  let a = m.start - base;
  let b = m.end - base;
  while (a < b && isSpace(t[a])) a++;
  while (b > a && isSpace(t[b - 1])) b--;
  return b > a ? { ...m, start: base + a, end: base + b } : null;
}

type Segment = { start: number; end: number; speech: boolean };

/** Split a sentence range into speech and narration segments using the global speech ranges. */
function segmentsOf(a: number, b: number, speech: Range[]): Segment[] {
  const out: Segment[] = [];
  let cur = a;
  for (const r of speech) {
    if (r.end <= a) continue;
    if (r.start >= b) break;
    const s = Math.max(r.start, a);
    const e = Math.min(r.end, b);
    if (s > cur) out.push({ start: cur, end: s, speech: false });
    out.push({ start: s, end: e, speech: true });
    cur = e;
  }
  if (cur < b) out.push({ start: cur, end: b, speech: false });
  return out;
}

const countWords = (t: string) => (t.match(/\S+/g) ?? []).length;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function annotatePassage(text: string, speechVerbs: ReadonlySet<string>): Annotation {
  const s = sanitise(text);
  const sents = splitSentences(s);
  const speech = speechRanges(s);

  const segs = sents.map((x) => segmentsOf(x.start, x.start + x.text.length, speech));
  const kinds: SentenceInfo['kind'][] = segs.map((g) => {
    const sp = g.some((x) => x.speech);
    if (!sp) return 'narration';
    return g.some((x) => !x.speech && hasLetters(s.slice(x.start, x.end))) ? 'mixed' : 'dialogue';
  });

  const marks: Mark[] = [];
  const tags: string[] = [];
  const beats: string[] = [];

  sents.forEach((sent, i) => {
    const prevSpeech = i > 0 && kinds[i - 1] !== 'narration';
    const nextSpeech = i + 1 < sents.length && kinds[i + 1] !== 'narration';
    const sentenceWords = countWords(sent.text);

    for (const g of segs[i]) {
      const raw = s.slice(g.start, g.end);
      const lead = raw.length - raw.trimStart().length;
      const t = raw.trim();
      if (!t) continue;
      const base = g.start + lead;

      if (g.speech) {
        marks.push({ start: base, end: base + t.length, kind: 'speech' });
        continue;
      }
      if (!hasLetters(t)) continue;

      const words = wordsOf(t);
      const speechVerb = hasSpeechVerb(words, speechVerbs);
      const action = hasActionVerb(words, speechVerbs);

      if (kinds[i] === 'mixed') {
        if (speechVerb && words.length >= 2) {
          marks.push({ start: base, end: base + t.length, kind: 'tag' });
          tags.push(t);
          continue;
        }
        if (action && words.length >= 2) {
          marks.push({ start: base, end: base + t.length, kind: 'beat' });
          beats.push(t);
          continue;
        }
      } else if (kinds[i] === 'narration') {
        if (prevSpeech && speechVerb && words.length >= 2 && sentenceWords <= 12) {
          marks.push({ start: base, end: base + t.length, kind: 'tag' });
          tags.push(t);
          continue;
        }
        if ((prevSpeech || nextSpeech) && action && !speechVerb && sentenceWords <= 20) {
          marks.push({ start: base, end: base + t.length, kind: 'beat' });
          beats.push(t);
          continue;
        }
      }
      marks.push(...clauseMarks(t, base));
    }
  });

  marks.sort((a, b) => a.start - b.start || a.end - b.end);
  const participles = marks.filter((m) => m.kind === 'part').map((m) => s.slice(m.start, m.end));
  const subordinates = marks.filter((m) => m.kind === 'sub').map((m) => s.slice(m.start, m.end));

  let markup = '';
  let cursor = 0;
  for (const m of marks) {
    if (m.start < cursor || m.end <= m.start) continue; // never nest or overlap
    markup += s.slice(cursor, m.start) + `{${m.kind}|${s.slice(m.start, m.end)}}`;
    cursor = m.end;
  }
  markup += s.slice(cursor);

  const lengths = sents.map((x) => countWords(x.text));
  const stats: PassageStats = lengths.length
    ? {
        sentences: lengths.length,
        averageWords: round1(lengths.reduce((a, b) => a + b, 0) / lengths.length),
        longest: Math.max(...lengths),
        shortest: Math.min(...lengths),
      }
    : { sentences: 0, averageWords: 0, longest: 0, shortest: 0 };

  return {
    markup,
    sentences: sents.map((x, i) => ({ text: x.text, kind: kinds[i], words: lengths[i] })),
    tags,
    beats,
    participles,
    subordinates,
    stats,
  };
}
