import type { Db } from '@/lib/db';
import type { Level, Register } from './schemas';

export type CategoryWithCount = {
  slug: string;
  name: string;
  description: string;
  expressionCount: number;
  children: CategoryWithCount[];
};

export type ExpressionSummary = {
  slug: string;
  text: string;
  simpleMeaning: string;
  level: Level;
  register: Register;
  intensity: number | null;
  kind: string;
};

export type ContrastGroupDetail = {
  slug: string;
  title: string;
  explanation: string;
  members: { slug: string; text: string; note: string; example: string }[];
};

export type ExpressionDetail = ExpressionSummary & {
  pos: string | null;
  contextualMeaning: string;
  usageNotes: string;
  categories: { slug: string; name: string }[];
  tags: { kind: string; slug: string }[];
  examples: { text: string; setting: string; contextNote: string | null }[];
  relations: { slug: string; text: string; type: string; note: string | null }[];
  contrastGroups: ContrastGroupDetail[];
  mistakes: { wrong: string; right: string; explanation: string }[];
};

type CatRow = { id: number; slug: string; name: string; description: string; parent_id: number | null };

export function getCategoryTree(db: Db): CategoryWithCount[] {
  const cats = db.all<CatRow>('SELECT id, slug, name, description, parent_id FROM categories ORDER BY sort, name');
  const byParent = new Map<number | null, CatRow[]>();
  for (const c of cats) {
    const list = byParent.get(c.parent_id) ?? [];
    list.push(c);
    byParent.set(c.parent_id, list);
  }

  // Each node's count is its own distinct published expressions plus its descendants',
  // deduplicated by id, so an expression filed under two subcategories counts once.
  const idsFor = (c: CatRow): Set<number> => {
    const ids = new Set(
      db
        .all<{ expression_id: number }>(
          `SELECT ec.expression_id FROM expression_categories ec JOIN expressions e ON e.id = ec.expression_id
           WHERE ec.category_id = ? AND e.status = 'published'`,
          [c.id],
        )
        .map((r) => r.expression_id),
    );
    for (const child of byParent.get(c.id) ?? []) for (const id of idsFor(child)) ids.add(id);
    return ids;
  };

  const build = (parent: number | null): CategoryWithCount[] =>
    (byParent.get(parent) ?? []).map((c) => ({
      slug: c.slug,
      name: c.name,
      description: c.description,
      expressionCount: idsFor(c).size,
      children: build(c.id),
    }));

  return build(null);
}

type ExprRow = {
  slug: string; text: string; simple_meaning: string; level: Level; register: Register;
  intensity: number | null; kind: string;
};

const toSummary = (r: ExprRow): ExpressionSummary => ({
  slug: r.slug,
  text: r.text,
  simpleMeaning: r.simple_meaning,
  level: r.level,
  register: r.register,
  intensity: r.intensity,
  kind: r.kind,
});

export function listExpressions(
  db: Db,
  opts: { categorySlug?: string; level?: Level; register?: Register; limit?: number; offset?: number } = {},
): ExpressionSummary[] {
  const where: string[] = ["e.status = 'published'"];
  const params: (string | number)[] = [];
  let cte = '';
  let join = '';

  if (opts.categorySlug) {
    cte = `WITH RECURSIVE sub(id) AS (
      SELECT id FROM categories WHERE slug = ?
      UNION ALL SELECT c.id FROM categories c JOIN sub ON c.parent_id = sub.id)`;
    params.push(opts.categorySlug);
    join = 'JOIN expression_categories ec ON ec.expression_id = e.id';
    where.push('ec.category_id IN (SELECT id FROM sub)');
  }
  if (opts.level) { where.push('e.level = ?'); params.push(opts.level); }
  if (opts.register) { where.push('e.register = ?'); params.push(opts.register); }

  params.push(opts.limit ?? 200, opts.offset ?? 0);
  const rows = db.all<ExprRow>(
    `${cte} SELECT DISTINCT e.slug, e.text, e.simple_meaning, e.level, e.register, e.intensity, e.kind
     FROM expressions e ${join}
     WHERE ${where.join(' AND ')}
     ORDER BY e.text COLLATE NOCASE LIMIT ? OFFSET ?`,
    params,
  );
  return rows.map(toSummary);
}

function loadGroup(db: Db, groupId: number, slug: string, title: string, explanation: string): ContrastGroupDetail {
  const members = db.all<{ slug: string; text: string; note: string; example: string }>(
    `SELECT e.slug, e.text, m.note, m.example
     FROM contrast_group_members m JOIN expressions e ON e.id = m.expression_id
     WHERE m.group_id = ? AND e.status = 'published' ORDER BY m.sort`,
    [groupId],
  );
  return { slug, title, explanation, members };
}

export function getContrastGroup(db: Db, slug: string): ContrastGroupDetail | undefined {
  const g = db.get<{ id: number; slug: string; title: string; explanation: string }>(
    'SELECT id, slug, title, explanation FROM contrast_groups WHERE slug = ?',
    [slug],
  );
  return g && loadGroup(db, g.id, g.slug, g.title, g.explanation);
}

export function getExpression(db: Db, slug: string): ExpressionDetail | undefined {
  const row = db.get<ExprRow & { id: number; pos: string | null; contextual_meaning: string; usage_notes: string }>(
    `SELECT id, slug, text, kind, pos, simple_meaning, contextual_meaning, usage_notes, intensity, register, level
     FROM expressions WHERE slug = ? AND status = 'published'`,
    [slug],
  );
  if (!row) return undefined;

  const categories = db.all<{ slug: string; name: string }>(
    `SELECT c.slug, c.name FROM expression_categories ec JOIN categories c ON c.id = ec.category_id
     WHERE ec.expression_id = ? ORDER BY ec.is_primary DESC, c.name`,
    [row.id],
  );
  const tags = db.all<{ kind: string; slug: string }>(
    `SELECT t.kind, t.slug FROM expression_tags et JOIN tags t ON t.id = et.tag_id
     WHERE et.expression_id = ? ORDER BY t.slug`,
    [row.id],
  );
  const examples = db
    .all<{ text: string; setting: string; context_note: string | null }>(
      'SELECT text, setting, context_note FROM examples WHERE expression_id = ? ORDER BY sort',
      [row.id],
    )
    .map((x) => ({ text: x.text, setting: x.setting, contextNote: x.context_note }));
  const relations = db.all<{ slug: string; text: string; type: string; note: string | null }>(
    `SELECT e.slug, e.text, r.type, r.note FROM relations r JOIN expressions e ON e.id = r.to_id
     WHERE r.from_id = ? AND e.status = 'published' ORDER BY r.id`,
    [row.id],
  );
  const mistakes = db.all<{ wrong: string; right: string; explanation: string }>(
    'SELECT wrong, right, explanation FROM mistakes WHERE expression_id = ? ORDER BY id',
    [row.id],
  );
  const groups = db
    .all<{ id: number; slug: string; title: string; explanation: string }>(
      `SELECT g.id, g.slug, g.title, g.explanation FROM contrast_groups g
       JOIN contrast_group_members m ON m.group_id = g.id WHERE m.expression_id = ? ORDER BY g.title`,
      [row.id],
    )
    .map((g) => loadGroup(db, g.id, g.slug, g.title, g.explanation));

  return {
    ...toSummary(row),
    pos: row.pos,
    contextualMeaning: row.contextual_meaning,
    usageNotes: row.usage_notes,
    categories,
    tags,
    examples,
    relations,
    contrastGroups: groups,
    mistakes,
  };
}
