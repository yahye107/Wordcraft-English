import type { Db } from '@/lib/db';
import { aiConfigured } from '@/lib/ai/client';
import { cleanText, fail, isFail, type Fail } from '@/lib/notebook/limits';
import { getAiAnalysis } from './ai';
import { checkExcerpt, NOVEL_LIMITS } from './limits';
import { analyseLocalPassage } from './local';
import { analysisCount, findByExcerpt, getAnalysis, saveAnalysis, updateAiLayer } from './store';
import type { AnalysisResult } from './types';

export type AnalyseOutcome = { ok: true; id: number; existing: boolean; aiUsed: boolean; aiNote: string | null } | Fail;
export type AddAiOutcome = { ok: true; aiUsed: true } | (Fail & { unavailable?: true });

const LOCAL_ONLY = 'Local analysis only. Nothing was sent anywhere.';
const NO_KEY = 'No ANTHROPIC_API_KEY is set, so the tutor analysis is off. This is the local analysis.';
const SOME_DROPPED = 'Some tutor notes were left out because they did not match your passage.';

/** Ask the tutor and fold the answer into `result`. Returns the note to show when the tutor was not used. */
async function tutorLayer(
  db: Db,
  excerpt: string,
  result: AnalysisResult,
): Promise<{ result: AnalysisResult; aiUsed: boolean; note: string | null }> {
  if (!aiConfigured()) return { result, aiUsed: false, note: NO_KEY };
  const ai = await getAiAnalysis(db, excerpt);
  if (!ai.ok) return { result, aiUsed: false, note: `Tutor analysis was not used: ${ai.reason} This is the local analysis.` };
  return { result: { ...result, ai: ai.analysis }, aiUsed: true, note: ai.dropped > 0 ? SOME_DROPPED : null };
}

export async function analysePassage(
  db: Db,
  input: { excerpt: unknown; sourceTitle?: unknown; useAi: boolean },
): Promise<AnalyseOutcome> {
  const check = checkExcerpt(input.excerpt);
  if (!check.ok) return fail(check.error);
  const title = cleanText(input.sourceTitle, 'The book title', NOVEL_LIMITS.title);
  if (isFail(title)) return title;

  const existing = findByExcerpt(db, check.text);
  if (existing) {
    if (input.useAi && !existing.result.ai) {
      const added = await addAiLayer(db, existing.id);
      if (added.ok) return { ok: true, id: existing.id, existing: true, aiUsed: true, aiNote: null };
      return { ok: true, id: existing.id, existing: true, aiUsed: existing.aiUsed, aiNote: existing.aiNote };
    }
    return { ok: true, id: existing.id, existing: true, aiUsed: existing.aiUsed, aiNote: existing.aiNote };
  }

  // Check room before spending anything on the tutor.
  if (analysisCount(db) >= NOVEL_LIMITS.stored) {
    return fail(`You have ${NOVEL_LIMITS.stored} saved analyses, which is the limit. Delete some you no longer need.`);
  }

  let result: AnalysisResult = { local: analyseLocalPassage(db, check.text), ai: null };
  let aiUsed = false;
  let aiNote: string | null = LOCAL_ONLY;
  if (input.useAi) {
    const t = await tutorLayer(db, check.text, result);
    result = t.result;
    aiUsed = t.aiUsed;
    aiNote = t.note;
  }

  const saved = saveAnalysis(db, { excerpt: check.text, sourceTitle: title, result, aiUsed, aiNote });
  if (!saved.ok) return saved;
  return { ok: true, id: saved.id, existing: saved.existing, aiUsed, aiNote };
}

/** Add the tutor layer to a stored local-only analysis. Changes nothing if the tutor cannot be used. */
export async function addAiLayer(db: Db, id: number): Promise<AddAiOutcome> {
  const record = getAnalysis(db, id);
  if (!record) return fail('That analysis does not exist.');
  if (record.result.ai) return { ok: true, aiUsed: true };

  const t = await tutorLayer(db, record.excerpt, record.result);
  if (!t.aiUsed) return { ok: false, error: t.note ?? 'The tutor could not be used.', unavailable: true };
  const saved = updateAiLayer(db, id, t.result, true, t.note);
  return saved.ok ? { ok: true, aiUsed: true } : saved;
}
