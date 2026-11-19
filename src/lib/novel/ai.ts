import { z } from 'zod';
import type { Db } from '@/lib/db';
import { AiUnavailableError, askClaude } from '@/lib/ai/client';
import { lcs, wordList } from '@/lib/text/lcs';
import { sanitise } from './annotate';
import { NOVEL_SYSTEM, buildNovelUserMessage } from './ai-prompt';
import type { AiAnalysis } from './types';

const MAX_FIELD = 600;
const MAX_QUOTE = 300;
const MAX_EXAMPLE_WORDS = 80;
const COPY_RUN = 8;
const COPY_SHARE = 0.5;

// Every field is lenient (a wrong type becomes empty) so one bad field cannot throw the whole reply away.
const text = z.string().catch('');
const optionalText = z.string().nullish().catch(null);
const ReplySchema = z.object({
  vocabulary: z.array(z.object({ quote: z.string(), meaning: z.string() }).catch({ quote: '', meaning: '' })).max(12).catch([]),
  structure: text,
  grammar: z.array(z.object({ quote: z.string(), explanation: z.string() }).catch({ quote: '', explanation: '' })).max(8).catch([]),
  dialogue: optionalText,
  descriptive: optionalText,
  emotion: optionalText,
  whyNatural: text,
  technique: z.object({ name: z.string(), how: z.string() }).catch({ name: '', how: '' }),
  example: z.object({ situation: z.string(), text: z.string() }).catch({ situation: '', text: '' }),
  tryIt: text,
});
export type NovelReply = z.infer<typeof ReplySchema>;

export type AiResult = { ok: true; analysis: AiAnalysis; dropped: number } | { ok: false; reason: string };

const clip = (s: string, n = MAX_FIELD) => s.trim().slice(0, n);

/** True when `candidate` reuses the passage: a run of 8 passage words, half its words in order, or all of it. */
function copiesPassage(passage: string, candidate: string): boolean {
  const p = wordList(passage);
  const c = wordList(candidate);
  if (p.length === 0 || c.length === 0) return false;
  if (` ${c.join(' ')} `.includes(` ${p.join(' ')} `)) return true; // the whole passage, however short
  if (p.length >= COPY_RUN) {
    const runs = new Set<string>();
    for (let i = 0; i + COPY_RUN <= p.length; i++) runs.add(p.slice(i, i + COPY_RUN).join(' '));
    for (let i = 0; i + COPY_RUN <= c.length; i++) if (runs.has(c.slice(i, i + COPY_RUN).join(' '))) return true;
  }
  return p.length >= 5 && lcs(p, c) / p.length >= COPY_SHARE;
}

/** Keep only what is safe to show: exact quotes, short fields, and an original example. */
export function validateAiAnalysis(excerpt: string, reply: NovelReply): AiResult {
  const clean = sanitise(excerpt);
  const inPassage = (q: string) => q.length > 0 && q.length <= MAX_QUOTE && (excerpt.includes(q) || clean.includes(q));
  let dropped = 0;

  const example = { situation: clip(reply.example.situation, 200), text: clip(reply.example.text, 800) };
  if (!example.text) return { ok: false, reason: 'The tutor reply did not include an example.' };
  if (example.text.split(/\s+/).length > MAX_EXAMPLE_WORDS) return { ok: false, reason: 'The tutor example was too long, so it was not used.' };
  if (copiesPassage(excerpt, example.text) || copiesPassage(excerpt, example.situation)) {
    return { ok: false, reason: 'The tutor example copied the passage, so it was not used.' };
  }

  const vocabulary = reply.vocabulary.flatMap((v) => {
    const quote = v.quote.trim();
    if (!inPassage(quote) || !v.meaning.trim()) {
      dropped++;
      return [];
    }
    return [{ quote, meaning: clip(v.meaning, 300) }];
  });
  const grammar = reply.grammar.flatMap((g) => {
    const quote = g.quote.trim();
    if (!inPassage(quote) || !g.explanation.trim()) {
      dropped++;
      return [];
    }
    return [{ quote, explanation: clip(g.explanation) }];
  });

  const optional = (v: string | null | undefined): string | null => {
    const t = (v ?? '').trim();
    if (!t) return null;
    if (t.length > MAX_FIELD) {
      dropped++;
      return null;
    }
    return t;
  };

  const analysis: AiAnalysis = {
    vocabulary,
    structure: clip(reply.structure),
    grammar,
    dialogue: optional(reply.dialogue),
    descriptive: optional(reply.descriptive),
    emotion: optional(reply.emotion),
    whyNatural: clip(reply.whyNatural),
    technique: { name: clip(reply.technique.name, 80), how: clip(reply.technique.how) },
    example,
    tryIt: clip(reply.tryIt),
  };
  return { ok: true, analysis, dropped };
}

/** Ask the tutor about a passage. Sends the rules and the passage only: no title, no notebook, no history. */
export async function getAiAnalysis(db: Db, excerpt: string): Promise<AiResult> {
  let reply: NovelReply;
  try {
    reply = await askClaude({
      db,
      feature: 'novel-analysis',
      tier: 'main',
      system: NOVEL_SYSTEM,
      user: buildNovelUserMessage(excerpt),
      schema: ReplySchema,
      maxTokens: 4000,
      effort: 'medium',
    });
  } catch (e) {
    return { ok: false, reason: e instanceof AiUnavailableError ? e.message : 'The tutor could not be reached.' };
  }
  return validateAiAnalysis(excerpt, reply);
}
