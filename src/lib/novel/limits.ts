export const NOVEL_LIMITS = { chars: 800, words: 120, title: 100, stored: 200 } as const;

export type ExcerptCheck = { ok: true; text: string; words: number } | { ok: false; error: string };

/** Validate and normalise a pasted passage. Short excerpts only: this is a study tool, not a reader. */
export function checkExcerpt(input: unknown): ExcerptCheck {
  if (typeof input !== 'string') return { ok: false, error: 'The passage must be text.' };
  const text = input
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!text) return { ok: false, error: 'Paste a passage first.' };
  if (text.length > NOVEL_LIMITS.chars) {
    return { ok: false, error: `That passage is too long (limit ${NOVEL_LIMITS.chars} characters). Paste one short scene or a few sentences.` };
  }
  const words = (text.match(/\S+/g) ?? []).length;
  if (words > NOVEL_LIMITS.words) {
    return { ok: false, error: `That passage is too long (limit ${NOVEL_LIMITS.words} words). Paste one short scene or a few sentences.` };
  }
  return { ok: true, text, words };
}
