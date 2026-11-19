import { z } from 'zod';
import type { Db } from '@/lib/db';
import { AiUnavailableError, askClaude } from '@/lib/ai/client';
import { CATEGORIES, type Issue } from './limits';
import { TUTOR_SYSTEM, buildTutorUserMessage } from './tutor-prompt';

const MAX_HINT = 240;
const MAX_WHY = 400;
const REWRITE_SHARE = 0.6;

const ReplySchema = z.object({
  issues: z
    .array(
      z.object({
        category: z.enum(CATEGORIES as [string, ...string[]]),
        type: z.string().optional(),
        quote: z.string(),
        why: z.string(),
        hint1: z.string(),
        hint2: z.string(),
        hint3: z.string(),
        alternatives: z.array(z.object({ text: z.string(), why: z.string() })).max(3).optional(),
      }),
    )
    .max(8),
  strengths: z.array(z.string()).max(3).default([]),
  overall: z.string().default(''),
  nextStep: z.string().default(''),
});
export type TutorReply = z.infer<typeof ReplySchema>;

const words = (s: string) => (s.toLowerCase().match(/[\p{L}\p{M}'’-]+/gu) ?? []).map((w) => w.replace(/’/g, "'"));

/** Length of the longest common subsequence of two word lists. */
function lcs(a: string[], b: string[]): number {
  const prev = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(prev[j], prev[j - 1]);
      diag = up;
    }
  }
  return prev[b.length];
}

/** A field "looks like a rewrite" when it contains most of the learner's words in order. */
function looksLikeRewrite(learner: string[], field: string): boolean {
  if (learner.length < 5) return false;
  const f = words(field);
  if (f.length < 5) return false;
  return lcs(learner, f) / learner.length >= REWRITE_SHARE;
}

function libraryAlternative(db: Db, alt: { text: string; why: string }): Issue['alternatives'][number] {
  const slug = alt.text.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const row = db.get<{ slug: string; text: string }>(
    "SELECT slug, text FROM expressions WHERE status = 'published' AND (lower(text) = lower(?) OR slug = ?)",
    [alt.text.trim(), slug],
  );
  return { slug: row?.slug ?? '', text: alt.text.trim().slice(0, 100), why: alt.why.trim().slice(0, 200) };
}

/** Keep only the issues that are safe to show: exact quotes, short hints, and no rewrites. */
export function validateTutorReply(db: Db, text: string, reply: TutorReply): { issues: Issue[]; dropped: number } {
  const learner = words(text);
  const issues: Issue[] = [];
  let dropped = 0;

  for (const raw of reply.issues) {
    const quote = raw.quote.trim();
    const hints = [raw.hint1, raw.hint2, raw.hint3];
    const alts = raw.alternatives ?? [];
    const fields = [raw.why, ...hints, ...alts.flatMap((a) => [a.text, a.why])];

    const ok =
      quote.length > 0 &&
      quote.length <= 300 &&
      text.includes(quote) &&
      hints.every((h) => h.trim().length > 0 && h.length <= MAX_HINT) &&
      !fields.some((f) => looksLikeRewrite(learner, f));
    if (!ok) {
      dropped++;
      continue;
    }

    const type = raw.type && /^[a-z][a-z-]{1,39}$/.test(raw.type) ? raw.type : 'other';
    issues.push({
      category: raw.category as Issue['category'],
      key: `${raw.category}:${type}`,
      quote,
      why: raw.why.trim().slice(0, MAX_WHY),
      hints: [hints[0].trim(), hints[1].trim(), hints[2].trim()],
      alternatives: alts.map((a) => libraryAlternative(db, a)),
      source: 'ai',
    });
  }
  return { issues, dropped };
}

export type TutorResult =
  | { ok: true; issues: Issue[]; strengths: string[]; overall: string; nextStep: string }
  | { ok: false; reason: string };

export async function getTutorFeedback(
  db: Db,
  input: { text: string; mode: string; promptTitle?: string; situation?: string; tryWords?: string[] },
): Promise<TutorResult> {
  let reply: TutorReply;
  try {
    reply = await askClaude({
      db,
      feature: 'tutor-feedback',
      tier: 'main',
      system: TUTOR_SYSTEM,
      user: buildTutorUserMessage(input),
      schema: ReplySchema,
      maxTokens: 4000,
      effort: 'medium',
    });
  } catch (e) {
    return { ok: false, reason: e instanceof AiUnavailableError ? e.message : 'The tutor could not be reached.' };
  }

  if (reply.issues.length === 0) {
    return { ok: true, issues: [], strengths: reply.strengths.slice(0, 3), overall: reply.overall.slice(0, 400), nextStep: reply.nextStep.slice(0, 300) };
  }
  const { issues } = validateTutorReply(db, input.text, reply);
  if (issues.length === 0) return { ok: false, reason: 'The tutor reply could not be used.' };
  return {
    ok: true,
    issues,
    strengths: reply.strengths.slice(0, 3),
    overall: reply.overall.slice(0, 400),
    nextStep: reply.nextStep.slice(0, 300),
  };
}
