import type { Db } from '@/lib/db';
import { parseQuery } from '@/lib/search/parse';
import { searchExpressions } from '@/lib/search/search';
import { BASIC_WORDS } from './basic-words';
import type { Category, Issue } from './limits';

const MAX_ISSUES = 8;
const MAX_HINT = 240;
const REPEAT_WINDOW = 30;
const LONG_SENTENCE = 40;

const STOP = new Set([
  'that', 'with', 'have', 'they', 'this', 'there', 'were', 'been', 'from', 'what', 'when', 'then', 'them', 'will', 'would',
  'could', 'should', 'about', 'which', 'their', 'your', 'into', 'than', 'just', 'also', 'only', 'very', 'some', 'more', 'most',
  'such', 'each', 'other', 'where', 'while', 'these', 'those', 'because', 'after', 'before', 'again', 'over', 'under',
]);

type Token = { text: string; lower: string; start: number; end: number };
type Sentence = { start: number; tokens: Token[] };

const clip = (s: string) => (s.length > MAX_HINT ? s.slice(0, MAX_HINT - 1) + '…' : s);

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(/[\p{L}\p{M}][\p{L}\p{M}'’-]*/gu)) {
    out.push({ text: m[0], lower: m[0].toLowerCase(), start: m.index!, end: m.index! + m[0].length });
  }
  return out;
}

function sentencesOf(text: string, tokens: Token[]): Sentence[] {
  const out: Sentence[] = [];
  for (const m of text.matchAll(/[^.!?\n]+[.!?]*/g)) {
    const start = m.index!;
    const end = start + m[0].length;
    const inside = tokens.filter((t) => t.start >= start && t.end <= end);
    if (inside.length > 0) out.push({ start, tokens: inside });
  }
  return out;
}

function alternativesFor(db: Db, terms: string[]): Issue['alternatives'] {
  if (terms.length === 0) return [];
  const q = parseQuery(terms.join(' '));
  if (q.empty) return [];
  return searchExpressions(db, q, { limit: 3 }).map((r) => ({ slug: r.slug, text: r.text, why: r.simpleMeaning }));
}

function issue(
  category: Category,
  key: string,
  quote: string,
  why: string,
  h1: string,
  h3: string,
  alternatives: Issue['alternatives'] = [],
): Issue {
  return { category, key, quote, why: clip(why), hints: [clip(h1), clip(why), clip(h3)], alternatives, source: 'local' };
}

const PRIORITY: Record<Category, number> = { grammar: 0, spelling: 1, punctuation: 2, naturalness: 3, structure: 4, vocabulary: 5, tone: 6 };

/** Rule-based checks. No network. Deterministic. Every quote is an exact substring of `text`. */
export function analyseLocal(db: Db, text: string): Issue[] {
  if (typeof text !== 'string' || !text.trim()) return [];
  const tokens = tokenize(text);
  const sentences = sentencesOf(text, tokens);
  const found: Issue[] = [];

  // 1. Basic or overused words (first two of each)
  const seen: Record<string, number> = {};
  tokens.forEach((t, i) => {
    const basic = BASIC_WORDS[t.lower];
    if (!basic) return;
    seen[t.lower] = (seen[t.lower] ?? 0) + 1;
    if (seen[t.lower] > 2) return;

    let quote = t.text;
    let terms = basic.search;
    if (t.lower === 'very' || t.lower === 'really') {
      const next = tokens[i + 1];
      if (next && /^\s+$/.test(text.slice(t.end, next.start))) {
        quote = text.slice(t.start, next.end);
        terms = [next.lower];
      }
    }
    const alts = alternativesFor(db, terms);
    found.push(
      issue(
        'vocabulary',
        `vocabulary:${t.lower}`,
        quote,
        basic.why,
        `Look at “${quote}”. Is it as exact as it could be?`,
        alts.length
          ? 'Think about what you really mean. Look at the suggested words, choose one that fits, and write your own sentence with it.'
          : 'Think about what you really mean and find a more exact word. Try searching the library for the idea, then write your own sentence.',
        alts,
      ),
    );
  });

  // 2. Doubled word ("the the")
  for (let i = 0; i + 1 < tokens.length; i++) {
    const a = tokens[i];
    const b = tokens[i + 1];
    if (a.lower === b.lower && /^\s+$/.test(text.slice(a.end, b.start))) {
      found.push(
        issue(
          'grammar',
          'grammar:doubled-word',
          text.slice(a.start, b.end),
          'The same word appears twice in a row. This is usually a typing slip.',
          'Look closely at this part of your text. Something is repeated.',
          'Read it aloud slowly. Decide whether one of the words should be removed or whether you meant a different word.',
        ),
      );
      break;
    }
  }

  // 3. A lower-case sentence start
  for (const s of sentences) {
    const first = s.tokens[0];
    if (first.text[0] !== first.text[0].toUpperCase()) {
      found.push(
        issue(
          'punctuation',
          'punctuation:capital',
          first.text,
          'A sentence starts with a capital letter.',
          `Look at the start of the sentence that begins with “${first.text}”.`,
          'Check the first letter of every sentence in your text and fix any that need a capital.',
        ),
      );
      break;
    }
  }

  // 4. A word repeated close together
  const reported = new Set<string>();
  for (let i = 0; i < tokens.length && reported.size < 2; i++) {
    const t = tokens[i];
    if (t.lower.length < 4 || STOP.has(t.lower) || BASIC_WORDS[t.lower] || reported.has(t.lower)) continue;
    for (let j = Math.max(0, i - REPEAT_WINDOW); j < i; j++) {
      if (tokens[j].lower === t.lower) {
        reported.add(t.lower);
        found.push(
          issue(
            'naturalness',
            `naturalness:repeat:${t.lower}`,
            t.text,
            `You used “${t.lower}” twice close together. Repeating a word can make writing feel flat.`,
            `Look at the word “${t.text}”. You used it recently.`,
            'Decide whether you can use a pronoun, a different word with the same meaning, or restructure the sentence so you only need it once.',
          ),
        );
        break;
      }
    }
  }

  // 5. Three or more sentences starting with the same word
  const starts = new Map<string, Token[]>();
  for (const s of sentences) starts.set(s.tokens[0].lower, [...(starts.get(s.tokens[0].lower) ?? []), s.tokens[0]]);
  for (const [w, list] of starts) {
    if (list.length >= 3) {
      found.push(
        issue(
          'structure',
          `structure:same-start:${w}`,
          list[0].text,
          `${list.length} sentences start with “${w}”. Sentences that all begin the same way feel repetitive.`,
          `Look at how your sentences begin. Several start with “${list[0].text}”.`,
          'Change the opening of one or two sentences: start with a detail, a time, a place, or an action instead.',
        ),
      );
      break;
    }
  }

  // 6. A very long sentence
  for (const s of sentences) {
    if (s.tokens.length > LONG_SENTENCE) {
      const six = s.tokens[Math.min(5, s.tokens.length - 1)];
      found.push(
        issue(
          'structure',
          'structure:long-sentence',
          text.slice(s.tokens[0].start, six.end),
          `One sentence has more than ${LONG_SENTENCE} words. Very long sentences are hard to follow.`,
          `Find the long sentence that begins “${text.slice(s.tokens[0].start, six.end)}”.`,
          'Look for a natural place to split it into two sentences, or cut details that do not matter.',
        ),
      );
      break;
    }
  }

  // 7. Sentences that are all about the same length
  if (sentences.length >= 4) {
    const counts = sentences.map((s) => s.tokens.length);
    if (Math.max(...counts) - Math.min(...counts) <= 2) {
      const s0 = sentences[0];
      const third = s0.tokens[Math.min(2, s0.tokens.length - 1)];
      found.push(
        issue(
          'structure',
          'structure:same-length',
          text.slice(s0.tokens[0].start, third.end),
          'Your sentences are almost all the same length. Mixing short and long sentences makes writing flow better.',
          'Count the words in each of your sentences. They are very close in length.',
          'Join two short sentences, or turn one idea into a very short sentence for emphasis.',
        ),
      );
    }
  }

  // Order by priority, remove repeats, keep at most 8
  const unique: Issue[] = [];
  const keys = new Set<string>();
  for (const i of found.sort((a, b) => PRIORITY[a.category] - PRIORITY[b.category])) {
    const k = `${i.key}|${i.quote}`;
    if (keys.has(k)) continue;
    keys.add(k);
    unique.push(i);
  }
  return unique.slice(0, MAX_ISSUES);
}
