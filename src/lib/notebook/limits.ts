export const LIMITS = {
  word: 100,
  meaning: 500,
  notes: 2000,
  example: 500,
  collection: 40,
  importChars: 1_000_000,
} as const;

export type Fail = { ok: false; error: string };
export const fail = (error: string): Fail => ({ ok: false, error });

/** Trim, collapse inner whitespace, and check a length. Returns the clean text or a Fail. */
export function cleanText(value: unknown, label: string, max: number, opts: { required?: boolean } = {}): string | Fail {
  if (value === undefined || value === null) {
    return opts.required ? fail(`${label} is required.`) : '';
  }
  if (typeof value !== 'string') return fail(`${label} must be text.`);
  const trimmed = value.trim();
  if (opts.required && !trimmed) return fail(`${label} cannot be empty.`);
  if (trimmed.length > max) return fail(`${label} is too long (limit ${max} characters).`);
  return trimmed;
}

export const isFail = (v: unknown): v is Fail => typeof v === 'object' && v !== null && (v as Fail).ok === false;
