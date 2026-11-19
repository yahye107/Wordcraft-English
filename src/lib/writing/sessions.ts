import { createHash } from 'node:crypto';
import type { Db } from '@/lib/db';
import { cleanText, fail, isFail, type Fail } from '@/lib/notebook/limits';
import { MODES, MODE_LABEL, WRITING_LIMITS, isMode, type Category, type Mode, type StoredIssue } from './limits';

export type Revision = {
  id: number;
  version: number;
  text: string;
  wordCount: number;
  aiUsed: boolean;
  aiNote: string | null;
  createdAt: string;
  issues: StoredIssue[];
  modelVersion: string | null;
};

export type Session = {
  id: number;
  mode: Mode;
  promptSlug: string | null;
  title: string;
  createdAt: string;
  revisions: Revision[];
};

export type SessionSummary = {
  id: number;
  mode: Mode;
  title: string;
  createdAt: string;
  revisionCount: number;
  latestWordCount: number;
};

export function createSession(db: Db, input: { mode: unknown; promptSlug?: string | null; title?: unknown }): { ok: true; id: number } | Fail {
  if (!isMode(input.mode)) return fail(`Choose one of: ${MODES.join(', ')}.`);
  const mode: Mode = input.mode;

  let title: string | Fail = '';
  if (input.title !== undefined) {
    title = cleanText(input.title, 'The title', WRITING_LIMITS.title);
    if (isFail(title)) return title;
  }
  let promptSlug: string | null = null;
  if (input.promptSlug) {
    const p = db.get<{ slug: string; title: string }>('SELECT slug, title FROM writing_prompts WHERE slug = ?', [input.promptSlug]);
    if (!p) return fail('That prompt does not exist.');
    promptSlug = p.slug;
    if (!title) title = p.title;
  }
  if (!title) title = MODE_LABEL[mode];

  const r = db.run('INSERT INTO writing_sessions (mode, prompt_slug, title) VALUES (?, ?, ?)', [mode, promptSlug, title]);
  return { ok: true, id: r.lastInsertRowid };
}

type IssueRow = {
  id: number; source: 'local' | 'ai'; category: Category; key: string; quote: string; why: string;
  hint1: string; hint2: string; hint3: string; alternatives_json: string; hint_level_shown: number; resolved: number;
};

export function getSession(db: Db, id: number): Session | undefined {
  const s = db.get<{ id: number; mode: Mode; prompt_slug: string | null; title: string; created_at: string }>(
    'SELECT id, mode, prompt_slug, title, created_at FROM writing_sessions WHERE id = ?',
    [id],
  );
  if (!s) return undefined;

  const revisions = db
    .all<{ id: number; version: number; text: string; word_count: number; ai_used: number; ai_note: string | null; created_at: string }>(
      'SELECT id, version, text, word_count, ai_used, ai_note, created_at FROM writing_revisions WHERE session_id = ? ORDER BY version',
      [id],
    )
    .map((r) => ({
      id: r.id,
      version: r.version,
      text: r.text,
      wordCount: r.word_count,
      aiUsed: r.ai_used === 1,
      aiNote: r.ai_note,
      createdAt: r.created_at,
      issues: db
        .all<IssueRow>(
          `SELECT id, source, category, key, quote, why, hint1, hint2, hint3, alternatives_json, hint_level_shown, resolved
           FROM feedback_items WHERE revision_id = ? ORDER BY id`,
          [r.id],
        )
        .map((i) => ({
          id: i.id,
          source: i.source,
          category: i.category,
          key: i.key,
          quote: i.quote,
          why: i.why,
          hints: [i.hint1, i.hint2, i.hint3] as [string, string, string],
          alternatives: (JSON.parse(i.alternatives_json) as { slug: string; text: string; why: string }[]).map((a) => ({
            slug: a.slug,
            text: a.text,
            why: a.why,
          })),
          hintLevelShown: i.hint_level_shown,
          resolved: i.resolved === 1,
        })),
      modelVersion: db.get<{ text: string }>('SELECT text FROM model_versions WHERE revision_id = ?', [r.id])?.text ?? null,
    }));

  return { id: s.id, mode: s.mode, promptSlug: s.prompt_slug, title: s.title, createdAt: s.created_at, revisions };
}

export function listSessions(db: Db, opts: { limit?: number; offset?: number; mode?: Mode }): SessionSummary[] {
  const where = opts.mode ? 'WHERE s.mode = ?' : '';
  const params: (string | number)[] = opts.mode ? [opts.mode] : [];
  params.push(opts.limit ?? 100, opts.offset ?? 0);
  return db
    .all<{ id: number; mode: Mode; title: string; created_at: string; revision_count: number; latest_words: number | null }>(
      `SELECT s.id, s.mode, s.title, s.created_at,
         (SELECT COUNT(*) FROM writing_revisions r WHERE r.session_id = s.id) AS revision_count,
         (SELECT word_count FROM writing_revisions r WHERE r.session_id = s.id ORDER BY version DESC LIMIT 1) AS latest_words
       FROM writing_sessions s ${where} ORDER BY s.created_at DESC, s.id DESC LIMIT ? OFFSET ?`,
      params,
    )
    .map((r) => ({
      id: r.id,
      mode: r.mode,
      title: r.title,
      createdAt: r.created_at,
      revisionCount: r.revision_count,
      latestWordCount: r.latest_words ?? 0,
    }));
}

export function deleteSession(db: Db, id: number): { ok: true } | Fail {
  const r = db.run('DELETE FROM writing_sessions WHERE id = ?', [id]);
  return r.changes > 0 ? { ok: true } : fail('That session does not exist.');
}

export const countWords = (text: string): number => (text.match(/\S+/g) ?? []).length;
const hashOf = (text: string) => createHash('sha1').update(text).digest('hex');

export function addRevision(
  db: Db,
  sessionId: number,
  text: unknown,
): { ok: true; revisionId: number; version: number; duplicate: boolean } | Fail {
  const session = db.get<{ mode: Mode }>('SELECT mode FROM writing_sessions WHERE id = ?', [sessionId]);
  if (!session) return fail('That session does not exist.');

  const max = session.mode === 'sentence' ? WRITING_LIMITS.sentence : WRITING_LIMITS.text;
  const clean = cleanText(text, 'Your writing', max, { required: true });
  if (isFail(clean)) return clean;

  const hash = hashOf(clean);
  const latest = db.get<{ id: number; version: number; text_hash: string }>(
    'SELECT id, version, text_hash FROM writing_revisions WHERE session_id = ? ORDER BY version DESC LIMIT 1',
    [sessionId],
  );
  if (latest && latest.text_hash === hash) return { ok: true, revisionId: latest.id, version: latest.version, duplicate: true };
  if (latest && latest.version >= WRITING_LIMITS.revisions) return fail(`A session can have at most ${WRITING_LIMITS.revisions} versions. Start a new one.`);

  const version = (latest?.version ?? 0) + 1;
  const r = db.run(
    'INSERT INTO writing_revisions (session_id, version, text, text_hash, word_count) VALUES (?, ?, ?, ?, ?)',
    [sessionId, version, clean, hash, countWords(clean)],
  );
  return { ok: true, revisionId: r.lastInsertRowid, version, duplicate: false };
}
