import type { Db } from '@/lib/db';
import { CONTENT_KINDS, indexContentFiles, isContentKind, type ContentFile, type ContentKind } from './files';

export type ReviewState = 'draft' | 'unreviewed' | 'needs-work' | 'changed' | 'approved';

export type ReviewItem = {
  kind: ContentKind;
  slug: string;
  title: string;
  /** The top-level area for an expression; null for other kinds. */
  area: string | null;
  status: 'draft' | 'published' | null;
  state: ReviewState;
  note: string;
  level: string | null;
};

export type ReviewQueue = {
  items: ReviewItem[];
  counts: { draft: number; unreviewed: number; needsWork: number; changed: number; approved: number };
  problems: { file: string; message: string }[];
};

type Verdict = { kind: ContentKind; slug: string; verdict: 'approved' | 'needs-work'; note: string; fingerprint: string };

const MAX_NOTE = 1000;
const RANK: Record<ReviewState, number> = { draft: 0, changed: 1, 'needs-work': 2, unreviewed: 3, approved: 4 };

function verdictMap(db: Db): Map<string, Verdict> {
  const rows = db.all<Verdict>('SELECT kind, slug, verdict, note, fingerprint FROM content_reviews');
  return new Map(rows.map((r) => [`${r.kind}:${r.slug}`, { kind: r.kind, slug: r.slug, verdict: r.verdict, note: r.note, fingerprint: r.fingerprint }]));
}

/** Titles (and, for expressions, area and level) as the database knows them. Files not yet seeded have none. */
function titles(db: Db): Map<string, { title: string; area: string | null; level: string | null }> {
  const out = new Map<string, { title: string; area: string | null; level: string | null }>();

  const cats = new Map(db.all<{ id: number; name: string; parent_id: number | null }>('SELECT id, name, parent_id FROM categories').map((c) => [c.id, c]));
  const topName = (id: number): string | null => {
    let cur = cats.get(id);
    for (let guard = 0; cur && cur.parent_id !== null && guard < 10; guard++) cur = cats.get(cur.parent_id);
    return cur?.name ?? null;
  };
  const primary = new Map(
    db.all<{ expression_id: number; category_id: number }>('SELECT expression_id, category_id FROM expression_categories WHERE is_primary = 1').map((r) => [r.expression_id, r.category_id]),
  );
  for (const e of db.all<{ id: number; slug: string; text: string; level: string }>('SELECT id, slug, text, level FROM expressions')) {
    const cat = primary.get(e.id);
    out.set(`expression:${e.slug}`, { title: e.text, area: cat === undefined ? null : topName(cat), level: e.level });
  }
  for (const c of db.all<{ slug: string; title: string }>('SELECT slug, title FROM contrast_groups')) out.set(`contrast:${c.slug}`, { title: c.title, area: null, level: null });
  for (const l of db.all<{ slug: string; title: string; level: string }>('SELECT slug, title, level FROM lessons')) out.set(`lesson:${l.slug}`, { title: l.title, area: null, level: l.level });
  for (const p of db.all<{ slug: string; title: string; level: string }>('SELECT slug, title, level FROM writing_prompts')) out.set(`prompt:${p.slug}`, { title: p.title, area: null, level: p.level });
  return out;
}

function stateOf(item: ContentFile, v: Verdict | undefined): ReviewState {
  if (!v) return item.kind === 'expression' && item.status === 'draft' ? 'draft' : 'unreviewed';
  if (v.fingerprint !== item.fingerprint) return 'changed';
  return v.verdict;
}

/** Everything to review, in the order to review it, with counts. Reads the files and the learner's verdicts. */
export function getReviewQueue(db: Db, dir: string): ReviewQueue {
  const { items: files, problems } = indexContentFiles(dir);
  const verdicts = verdictMap(db);
  const info = titles(db);

  const items: ReviewItem[] = files.map((f) => {
    const key = `${f.kind}:${f.slug}`;
    const v = verdicts.get(key);
    const known = info.get(key);
    return {
      kind: f.kind,
      slug: f.slug,
      title: known?.title ?? f.slug,
      area: known?.area ?? null,
      status: f.status,
      state: stateOf(f, v),
      note: v?.note ?? '',
      level: known?.level ?? null,
    };
  });

  items.sort(
    (a, b) =>
      RANK[a.state] - RANK[b.state] ||
      CONTENT_KINDS.indexOf(a.kind) - CONTENT_KINDS.indexOf(b.kind) ||
      (a.area ?? '').localeCompare(b.area ?? '') ||
      a.title.localeCompare(b.title) ||
      a.slug.localeCompare(b.slug),
  );

  const n = (s: ReviewState) => items.filter((i) => i.state === s).length;
  return {
    items,
    counts: { draft: n('draft'), unreviewed: n('unreviewed'), needsWork: n('needs-work'), changed: n('changed'), approved: n('approved') },
    problems,
  };
}

export type VerdictResult = { ok: true } | { ok: false; status: 400 | 404; error: string };

/** Store the learner's verdict on one item, against the file's current fingerprint. Replaces an earlier verdict. */
export function recordVerdict(
  db: Db,
  dir: string,
  input: { kind: unknown; slug: unknown; verdict: unknown; note?: unknown },
): VerdictResult {
  if (!isContentKind(input.kind)) return { ok: false, status: 400, error: 'Choose a kind: expression, contrast, lesson or prompt.' };
  if (typeof input.slug !== 'string' || !input.slug) return { ok: false, status: 400, error: 'Send the slug of the item.' };
  if (input.verdict !== 'approved' && input.verdict !== 'needs-work') return { ok: false, status: 400, error: 'The verdict must be approved or needs-work.' };

  const note = typeof input.note === 'string' ? input.note.trim() : '';
  if (input.note !== undefined && input.note !== null && typeof input.note !== 'string') return { ok: false, status: 400, error: 'The note must be text.' };
  if (input.verdict === 'needs-work' && !note) return { ok: false, status: 400, error: 'Say what needs work.' };
  if (note.length > MAX_NOTE) return { ok: false, status: 400, error: `That note is too long (limit ${MAX_NOTE} characters).` };

  const item = indexContentFiles(dir).items.find((i) => i.kind === input.kind && i.slug === input.slug);
  if (!item) return { ok: false, status: 404, error: 'That item does not exist.' };

  saveVerdict(db, item, input.verdict, note);
  return { ok: true };
}

/** Upsert a verdict row. Shared with publishing, which records an approval. */
export function saveVerdict(db: Db, item: ContentFile, verdict: 'approved' | 'needs-work', note: string): void {
  db.run(
    `INSERT INTO content_reviews (kind, slug, verdict, note, fingerprint) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(kind, slug) DO UPDATE SET verdict = excluded.verdict, note = excluded.note,
       fingerprint = excluded.fingerprint, reviewed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`,
    [item.kind, item.slug, verdict, note, item.fingerprint],
  );
}

/** The item after `after` in the queue, skipping approved items when `skipDone`. Undefined at the end. */
export function nextItem(items: ReviewItem[], after: { kind: ContentKind; slug: string }, skipDone: boolean): ReviewItem | undefined {
  const at = items.findIndex((i) => i.kind === after.kind && i.slug === after.slug);
  if (at === -1) return undefined;
  return items.slice(at + 1).find((i) => !skipDone || i.state !== 'approved');
}

export type ReviewNote = { kind: ContentKind; slug: string; file: string; state: 'needs-work' | 'changed'; note: string; reviewedAt: string };

/** Items the learner marked "needs work" (and items edited since), with their file paths, newest first. */
export function getNotes(db: Db, dir: string): ReviewNote[] {
  const files = new Map(indexContentFiles(dir).items.map((f) => [`${f.kind}:${f.slug}`, f]));
  const rows = db.all<{ kind: ContentKind; slug: string; verdict: string; note: string; fingerprint: string; reviewed_at: string }>(
    "SELECT kind, slug, verdict, note, fingerprint, reviewed_at FROM content_reviews WHERE note <> '' ORDER BY reviewed_at DESC, id DESC",
  );
  const out: ReviewNote[] = [];
  for (const r of rows) {
    const f = files.get(`${r.kind}:${r.slug}`);
    if (!f || r.verdict !== 'needs-work') continue;
    out.push({ kind: r.kind, slug: r.slug, file: f.file, state: r.fingerprint === f.fingerprint ? 'needs-work' : 'changed', note: r.note, reviewedAt: r.reviewed_at });
  }
  return out;
}
