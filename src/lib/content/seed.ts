import type { Db } from '@/lib/db';
import type { CategoryNode, ContentBundle, ExerciseFile, ExpressionFile } from './schemas';

export type SeedResult = { added: number; updated: number; removed: number };

function tagName(slug: string): string {
  return slug.split(':')[1].replace(/-/g, ' ');
}

function seedCategories(db: Db, nodes: CategoryNode[]): void {
  const keep = new Set<string>();
  const walk = (list: CategoryNode[], parentId: number | null) => {
    list.forEach((n, i) => {
      keep.add(n.slug);
      db.run(
        `INSERT INTO categories (slug, name, description, parent_id, sort) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET name=excluded.name, description=excluded.description,
           parent_id=excluded.parent_id, sort=excluded.sort`,
        [n.slug, n.name, n.description, parentId, i],
      );
      const id = db.get<{ id: number }>('SELECT id FROM categories WHERE slug = ?', [n.slug])!.id;
      if (n.children) walk(n.children, id);
    });
  };
  walk(nodes, null);
  for (const row of db.all<{ slug: string }>('SELECT slug FROM categories')) {
    if (!keep.has(row.slug)) db.run('DELETE FROM categories WHERE slug = ?', [row.slug]);
  }
}

/** Names of a category and all its ancestors, so "sadness" finds entries filed under "disappointment". */
function categoryNames(db: Db, expressionId: number): string[] {
  return db
    .all<{ name: string }>(
      `WITH RECURSIVE up(id, name, parent_id) AS (
         SELECT c.id, c.name, c.parent_id FROM expression_categories ec JOIN categories c ON c.id = ec.category_id
         WHERE ec.expression_id = ?
         UNION SELECT c.id, c.name, c.parent_id FROM categories c JOIN up ON c.id = up.parent_id)
       SELECT DISTINCT name FROM up`,
      [expressionId],
    )
    .map((r) => r.name);
}

function ftsRow(db: Db, id: number, e: ExpressionFile): void {
  db.run('DELETE FROM expressions_fts WHERE rowid = ?', [id]);
  db.run(
    `INSERT INTO expressions_fts (rowid, slug, text, meanings, usage, examples, phrases, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      e.slug,
      e.text,
      `${e.simpleMeaning} ${e.contextualMeaning}`,
      e.usageNotes,
      e.examples.map((x) => x.text).join(' '),
      e.searchPhrases.join(' ; '),
      [...e.tags.map((t) => `${tagName(t)} ${t.split(':')[0]}`), ...categoryNames(db, id)].join(' '),
    ],
  );
}

/** Split an exercise into what the learner sees and the answer key. */
function splitExercise(x: ExerciseFile): { payload: unknown; answer: unknown } {
  switch (x.type) {
    case 'choose':
      return { payload: { options: x.options }, answer: { answer: x.answer } };
    case 'fill_blank':
      return { payload: {}, answer: { accepted: x.accepted } };
    case 'identify':
      return { payload: { items: x.items.map((i) => i.text), choices: x.choices }, answer: { answers: x.items.map((i) => i.answer) } };
    case 'fix_punctuation':
      return { payload: { broken: x.broken }, answer: { accepted: x.accepted } };
    case 'reorder':
      return { payload: { fragments: x.fragments }, answer: { accepted: x.accepted } };
    case 'free_write':
      return { payload: { checklist: x.checklist }, answer: x.sample ? { sample: x.sample } : {} };
  }
}

function seedLessons(db: Db, bundle: ContentBundle): void {
  const keepLessons = new Set<string>();
  for (const l of bundle.lessons) {
    keepLessons.add(l.slug);
    db.run(
      `INSERT INTO lessons (slug, lab, title, summary, level, sort, body_json) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET lab=excluded.lab, title=excluded.title, summary=excluded.summary,
         level=excluded.level, sort=excluded.sort, body_json=excluded.body_json`,
      [l.slug, l.lab, l.title, l.summary, l.level, l.sort, JSON.stringify({ sections: l.sections, related: l.related })],
    );
  }
  for (const row of db.all<{ slug: string }>('SELECT slug FROM lessons')) {
    if (!keepLessons.has(row.slug)) db.run('DELETE FROM lessons WHERE slug = ?', [row.slug]); // exercises cascade
  }

  const keepExercises = new Set<string>();
  const perLesson = new Map<string, number>();
  for (const x of bundle.exercises) {
    keepExercises.add(x.slug);
    const lessonId = db.get<{ id: number }>('SELECT id FROM lessons WHERE slug = ?', [x.lesson])!.id;
    const order = perLesson.get(x.lesson) ?? 0;
    perLesson.set(x.lesson, order + 1);
    const { payload, answer } = splitExercise(x);
    db.run(
      `INSERT INTO exercises (slug, lesson_id, type, level, prompt, payload_json, answer_json, explanation, sort)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET lesson_id=excluded.lesson_id, type=excluded.type, level=excluded.level,
         prompt=excluded.prompt, payload_json=excluded.payload_json, answer_json=excluded.answer_json,
         explanation=excluded.explanation, sort=excluded.sort`,
      [x.slug, lessonId, x.type, x.level, x.prompt, JSON.stringify(payload), JSON.stringify(answer), x.explanation, order],
    );
  }
  for (const row of db.all<{ slug: string }>('SELECT slug FROM exercises')) {
    if (!keepExercises.has(row.slug)) db.run('DELETE FROM exercises WHERE slug = ?', [row.slug]);
  }
}

/**
 * Upsert the bundle into the content tables by slug. Idempotent. Only content tables
 * are touched; learner tables are never read or written here.
 */
export function seedContent(db: Db, bundle: ContentBundle): SeedResult {
  return db.transaction(() => {
    let added = 0;
    let updated = 0;

    seedCategories(db, bundle.categories);

    // Pass 1: expression rows
    const ids = new Map<string, number>();
    for (const e of bundle.expressions) {
      const existing = db.get<{ id: number }>('SELECT id FROM expressions WHERE slug = ?', [e.slug]);
      db.run(
        `INSERT INTO expressions (slug, text, kind, pos, simple_meaning, contextual_meaning, usage_notes,
           intensity, register, level, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET text=excluded.text, kind=excluded.kind, pos=excluded.pos,
           simple_meaning=excluded.simple_meaning, contextual_meaning=excluded.contextual_meaning,
           usage_notes=excluded.usage_notes, intensity=excluded.intensity, register=excluded.register,
           level=excluded.level, status=excluded.status`,
        [
          e.slug, e.text, e.kind, e.pos ?? null, e.simpleMeaning, e.contextualMeaning, e.usageNotes,
          e.intensity ?? null, e.register, e.level, e.status,
        ],
      );
      ids.set(e.slug, db.get<{ id: number }>('SELECT id FROM expressions WHERE slug = ?', [e.slug])!.id);
      if (existing) updated++;
      else added++;
    }

    // Remove expressions no longer in the bundle (children cascade; FTS rows by rowid)
    let removed = 0;
    for (const row of db.all<{ id: number; slug: string }>('SELECT id, slug FROM expressions')) {
      if (!ids.has(row.slug)) {
        db.run('DELETE FROM expressions_fts WHERE rowid = ?', [row.id]);
        db.run('DELETE FROM expressions WHERE id = ?', [row.id]);
        removed++;
      }
    }

    // Pass 2: children (all ids now known, so relations can resolve)
    for (const e of bundle.expressions) {
      const id = ids.get(e.slug)!;
      for (const t of ['expression_categories', 'examples', 'relations', 'mistakes', 'expression_tags', 'search_phrases']) {
        db.run(`DELETE FROM ${t} WHERE ${t === 'relations' ? 'from_id' : 'expression_id'} = ?`, [id]);
      }
      e.categories.forEach((c, i) => {
        const cat = db.get<{ id: number }>('SELECT id FROM categories WHERE slug = ?', [c])!;
        db.run('INSERT INTO expression_categories (expression_id, category_id, is_primary) VALUES (?, ?, ?)', [id, cat.id, i === 0 ? 1 : 0]);
      });
      e.examples.forEach((x, i) =>
        db.run('INSERT INTO examples (expression_id, text, setting, context_note, sort) VALUES (?, ?, ?, ?, ?)', [id, x.text, x.setting, x.contextNote ?? null, i]),
      );
      for (const r of e.relations) {
        db.run('INSERT INTO relations (from_id, to_id, type, note) VALUES (?, ?, ?, ?)', [id, ids.get(r.to)!, r.type, r.note ?? null]);
      }
      for (const m of e.mistakes) {
        db.run('INSERT INTO mistakes (expression_id, wrong, right, explanation) VALUES (?, ?, ?, ?)', [id, m.wrong, m.right, m.explanation]);
      }
      for (const t of e.tags) {
        db.run('INSERT INTO tags (slug, kind, name) VALUES (?, ?, ?) ON CONFLICT(slug) DO NOTHING', [t, t.split(':')[0], tagName(t)]);
        const tag = db.get<{ id: number }>('SELECT id FROM tags WHERE slug = ?', [t])!;
        db.run('INSERT INTO expression_tags (expression_id, tag_id) VALUES (?, ?)', [id, tag.id]);
      }
      for (const p of e.searchPhrases) {
        db.run('INSERT INTO search_phrases (expression_id, phrase) VALUES (?, ?)', [id, p]);
      }
      ftsRow(db, id, e);
    }
    db.run('DELETE FROM tags WHERE id NOT IN (SELECT tag_id FROM expression_tags)');

    // Contrast groups
    const keepGroups = new Set<string>();
    for (const c of bundle.contrasts) {
      keepGroups.add(c.slug);
      db.run(
        `INSERT INTO contrast_groups (slug, title, explanation) VALUES (?, ?, ?)
         ON CONFLICT(slug) DO UPDATE SET title=excluded.title, explanation=excluded.explanation`,
        [c.slug, c.title, c.explanation],
      );
      const gid = db.get<{ id: number }>('SELECT id FROM contrast_groups WHERE slug = ?', [c.slug])!.id;
      db.run('DELETE FROM contrast_group_members WHERE group_id = ?', [gid]);
      c.members.forEach((m, i) =>
        db.run('INSERT INTO contrast_group_members (group_id, expression_id, note, example, sort) VALUES (?, ?, ?, ?, ?)', [gid, ids.get(m.expression)!, m.note, m.example, i]),
      );
    }
    for (const g of db.all<{ slug: string }>('SELECT slug FROM contrast_groups')) {
      if (!keepGroups.has(g.slug)) db.run('DELETE FROM contrast_groups WHERE slug = ?', [g.slug]);
    }

    seedLessons(db, bundle);

    return { added, updated, removed };
  });
}
