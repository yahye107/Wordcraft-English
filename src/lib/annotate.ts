export type AnnotationKind = 'plain' | 'speech' | 'tag' | 'beat' | 'thought' | 'emotion';
export type Segment = { text: string; kind: AnnotationKind };

const KINDS = new Set<AnnotationKind>(['speech', 'tag', 'beat', 'thought', 'emotion']);
const MAX_KIND_LENGTH = 8;

/**
 * Read `{kind|text}` markup into segments. One left-to-right scan; every check looks only a few
 * characters ahead or stops at the next brace, so odd input cannot make it slow.
 * Anything that is not well-formed (unknown kind, no closing brace, nested braces, empty body)
 * stays as literal plain text.
 */
export function parseAnnotated(input: string): Segment[] {
  const out: Segment[] = [];
  let plain = '';

  const pushPlain = () => {
    if (plain) out.push({ text: plain, kind: 'plain' });
    plain = '';
  };

  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch !== '{') {
      plain += ch;
      i++;
      continue;
    }

    // Try to read "{kind|body}" starting here
    let j = i + 1;
    while (j < input.length && j - (i + 1) <= MAX_KIND_LENGTH && /[a-z]/.test(input[j])) j++;
    const kind = input.slice(i + 1, j) as AnnotationKind;
    if (input[j] === '|' && KINDS.has(kind)) {
      const bodyStart = j + 1;
      let k = bodyStart;
      while (k < input.length && input[k] !== '}' && input[k] !== '{') k++;
      if (input[k] === '}' && k > bodyStart) {
        pushPlain();
        out.push({ text: input.slice(bodyStart, k), kind });
        i = k + 1;
        continue;
      }
    }

    // Not valid markup: keep the brace as text and move on
    plain += ch;
    i++;
  }
  pushPlain();
  return out;
}

export function stripAnnotations(input: string): string {
  return parseAnnotated(input)
    .map((s) => s.text)
    .join('');
}
