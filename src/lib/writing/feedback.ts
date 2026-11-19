import type { Db } from '@/lib/db';
import { fail, type Fail } from '@/lib/notebook/limits';
import { aiConfigured } from '@/lib/ai/client';
import { addRevision, getSession } from './sessions';
import { analyseLocal } from './local';
import { getTutorFeedback } from './tutor';
import type { Issue, StoredIssue } from './limits';

const MAX_STORED = 10;

export type FeedbackResult = {
  ok: true;
  revisionId: number;
  version: number;
  duplicate: boolean;
  aiUsed: boolean;
  aiNote: string | null;
  issues: StoredIssue[];
  strengths: string[];
  overall: string | null;
  nextStep: string | null;
  progress: { resolved: number; remaining: number; added: number } | null;
};

const overlaps = (a: Issue, b: Issue) => a.quote === b.quote || a.quote.includes(b.quote) || b.quote.includes(a.quote);

/** AI issues come first; a local issue that covers the same words is dropped. */
function merge(local: Issue[], ai: Issue[]): Issue[] {
  const rest = local.filter((l) => !ai.some((a) => overlaps(a, l)));
  return [...ai, ...rest].slice(0, MAX_STORED);
}

function promptContext(db: Db, promptSlug: string | null) {
  if (!promptSlug) return {};
  const p = db.get<{ title: string; situation: string; try_json: string }>('SELECT title, situation, try_json FROM writing_prompts WHERE slug = ?', [promptSlug]);
  if (!p) return {};
  const slugs = JSON.parse(p.try_json) as string[];
  const tryWords = slugs.flatMap((s) => {
    const e = db.get<{ text: string }>('SELECT text FROM expressions WHERE slug = ?', [s]);
    return e ? [e.text] : [];
  });
  return { promptTitle: p.title, situation: p.situation, tryWords };
}

export async function submitForFeedback(
  db: Db,
  sessionId: number,
  text: string,
  opts: { useAi: boolean },
): Promise<FeedbackResult | Fail> {
  const added = addRevision(db, sessionId, text);
  if (!added.ok) return added;

  const before = getSession(db, sessionId)!;
  const mine = before.revisions.find((r) => r.id === added.revisionId)!;

  if (added.duplicate) {
    return {
      ok: true,
      revisionId: mine.id,
      version: mine.version,
      duplicate: true,
      aiUsed: mine.aiUsed,
      aiNote: mine.aiNote,
      issues: mine.issues,
      strengths: mine.strengths,
      overall: mine.overall,
      nextStep: mine.nextStep,
      progress: null,
    };
  }

  const previous = before.revisions.find((r) => r.version === mine.version - 1) ?? null;
  const local = analyseLocal(db, mine.text);

  let aiUsed = false;
  let aiNote: string | null = 'Local checks only. Nothing was sent anywhere.';
  let aiIssues: Issue[] = [];
  let strengths: string[] = [];
  let overall: string | null = null;
  let nextStep: string | null = null;

  if (opts.useAi) {
    if (!aiConfigured()) {
      aiNote = 'No ANTHROPIC_API_KEY is set, so AI feedback is off. These are local checks.';
    } else {
      const r = await getTutorFeedback(db, { text: mine.text, mode: before.mode, ...promptContext(db, before.promptSlug) });
      if (r.ok) {
        aiUsed = true;
        aiNote = null;
        aiIssues = r.issues;
        strengths = r.strengths;
        overall = r.overall || null;
        nextStep = r.nextStep || null;
      } else {
        aiNote = `AI feedback was not used: ${r.reason} These are local checks.`;
      }
    }
  }

  const issues = merge(local, aiIssues);

  db.transaction(() => {
    db.run('UPDATE writing_revisions SET ai_used = ?, ai_note = ?, extra_json = ? WHERE id = ?', [
      aiUsed ? 1 : 0,
      aiNote,
      JSON.stringify({ strengths, overall, nextStep }),
      mine.id,
    ]);
    const now = new Date().toISOString();
    for (const i of issues) {
      db.run(
        `INSERT INTO feedback_items (revision_id, source, category, key, quote, why, hint1, hint2, hint3, alternatives_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [mine.id, i.source, i.category, i.key, i.quote, i.why, i.hints[0], i.hints[1], i.hints[2], JSON.stringify(i.alternatives)],
      );
      db.run(
        `INSERT INTO weakness_stats (category, key, count, last_seen) VALUES (?, ?, 1, ?)
         ON CONFLICT(category, key) DO UPDATE SET count = count + 1, last_seen = excluded.last_seen`,
        [i.category, i.key, now],
      );
    }
    if (previous) {
      for (const p of previous.issues) {
        if (!mine.text.includes(p.quote)) db.run('UPDATE feedback_items SET resolved = 1 WHERE id = ?', [p.id]);
      }
    }
  });

  const stored = getSession(db, sessionId)!.revisions.find((r) => r.id === mine.id)!;
  let progress: FeedbackResult['progress'] = null;
  if (previous) {
    const resolved = previous.issues.filter((p) => !mine.text.includes(p.quote)).length;
    const prevQuotes = new Set(previous.issues.map((p) => p.quote));
    progress = {
      resolved,
      remaining: stored.issues.length,
      added: stored.issues.filter((i) => !prevQuotes.has(i.quote)).length,
    };
  }

  return {
    ok: true,
    revisionId: mine.id,
    version: mine.version,
    duplicate: false,
    aiUsed,
    aiNote,
    issues: stored.issues,
    strengths,
    overall,
    nextStep,
    progress,
  };
}

export function setHintLevel(db: Db, feedbackId: number, level: number): { ok: true } | Fail {
  if (![1, 2, 3].includes(level)) return fail('The hint level must be 1, 2 or 3.');
  const r = db.run('UPDATE feedback_items SET hint_level_shown = MAX(hint_level_shown, ?) WHERE id = ?', [level, feedbackId]);
  return r.changes > 0 ? { ok: true } : fail('That feedback item does not exist.');
}

export function markResolved(db: Db, feedbackId: number): { ok: true } | Fail {
  const r = db.run('UPDATE feedback_items SET resolved = 1 WHERE id = ?', [feedbackId]);
  return r.changes > 0 ? { ok: true } : fail('That feedback item does not exist.');
}
