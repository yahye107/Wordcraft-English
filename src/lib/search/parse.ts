export type RelationIntent = {
  type: 'antonym' | 'stronger' | 'weaker' | 'synonym';
  target: string;
};

export type ParsedQuery = {
  raw: string;
  terms: string[];
  exclude: string[];
  relation?: RelationIntent;
  empty: boolean;
};

const MAX_QUERY = 500;
const MAX_TOKEN = 64;

const STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'for', 'in', 'on', 'to', 'with', 'without', 'and', 'or', 'not', 'is', 'are', 'be',
  'i', 'me', 'my', 'you', 'your', 'it', 'that', 'this', 'how', 'what', 'when', 'do', 'does',
  'way', 'ways', 'express', 'expressing', 'show', 'showing', 'say', 'saying', 'word', 'words',
  'phrase', 'phrases', 'expression', 'expressions', 'something', 'someone', 'instead', 'alternative', 'alternatives',
  'person', 'people', 'who', 'whom', 'which', 'from', 'about', 'into', 'as', 'at', 'by', 'being', 'was', 'were',
  'have', 'has', 'had', 'can', 'could', 'would', 'should', 'feel', 'feels',
]);

const WORD = `["']?([a-z][a-z'-]*)["']?`;

const EXCLUDE_PATTERNS = [
  new RegExp(`\\b(?:without|not)\\s+(?:saying|using)(?:\\s+the\\s+word)?\\s+${WORD}`, 'g'),
  new RegExp(`\\binstead\\s+of\\s+${WORD}`, 'g'),
  new RegExp(`\\bother\\s+than\\s+${WORD}`, 'g'),
];

const RELATION_PATTERNS: { re: RegExp; type: RelationIntent['type'] }[] = [
  { re: new RegExp(`\\b(?:opposites?|antonyms?)\\s+(?:of|for)\\s+(?:the\\s+word\\s+)?${WORD}`), type: 'antonym' },
  { re: new RegExp(`\\bstronger\\s+than\\s+${WORD}`), type: 'stronger' },
  { re: new RegExp(`\\bweaker\\s+than\\s+${WORD}`), type: 'weaker' },
  { re: new RegExp(`\\b(?:another\\s+word\\s+for|synonyms?\\s+(?:of|for)|words?\\s+like|similar\\s+to)\\s+${WORD}`), type: 'synonym' },
];

function cleanToken(t: string): string {
  return t.replace(/^[-']+|[-']+$/g, '').slice(0, MAX_TOKEN);
}

export function parseQuery(input: string): ParsedQuery {
  const raw = (input ?? '').slice(0, MAX_QUERY);
  let text = raw.toLowerCase().replace(/[‘’]/g, "'").replace(/[“”]/g, '"');

  const exclude: string[] = [];
  for (const re of EXCLUDE_PATTERNS) {
    text = text.replace(re, (_m, word: string) => {
      const w = cleanToken(word);
      if (w) exclude.push(w);
      return ' ';
    });
  }

  let relation: RelationIntent | undefined;
  for (const { re, type } of RELATION_PATTERNS) {
    const m = text.match(re);
    if (m) {
      const target = cleanToken(m[1]);
      if (target) relation = { type, target };
      text = text.replace(re, ' ');
      break;
    }
  }

  const terms: string[] = [];
  for (const piece of text.replace(/[^a-z0-9'\s-]/g, ' ').split(/\s+/)) {
    const t = cleanToken(piece);
    if (t.length < 2 || !/[a-z0-9]/.test(t) || STOPWORDS.has(t)) continue;
    if (!terms.includes(t)) terms.push(t);
  }

  return { raw, terms, exclude, relation, empty: terms.length === 0 && !relation };
}
