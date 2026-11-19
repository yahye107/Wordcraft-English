import type { Db } from '@/lib/db';
import type { Level, LessonSection } from '@/lib/content/schemas';
import type { ExerciseKind } from '@/lib/exercises/check';

export type Lab = 'dialogue' | 'sentence';

export type LessonSummary = {
  slug: string;
  title: string;
  summary: string;
  level: Level;
  sort: number;
  exerciseCount: number;
  doneCount: number;
};

export type PublicExercise = {
  slug: string;
  type: ExerciseKind;
  level: Level;
  prompt: string;
  payload: unknown;
  done: boolean;
};

export type LessonDetail = {
  slug: string;
  lab: Lab;
  title: string;
  summary: string;
  level: Level;
  sections: LessonSection[];
  related: { slug: string; text: string }[];
  exercises: PublicExercise[];
  prev?: { slug: string; title: string };
  next?: { slug: string; title: string };
};

/** Done = a correct attempt, or (for free writing, which has no right answer) any saved attempt. */
const DONE_SLUGS = `SELECT DISTINCT exercise_slug FROM exercise_attempts WHERE correct = 1 OR correct IS NULL`;

export function listLessons(db: Db, lab: Lab): LessonSummary[] {
  return db
    .all<{ slug: string; title: string; summary: string; level: Level; sort: number; total: number; done: number }>(
      `SELECT l.slug, l.title, l.summary, l.level, l.sort,
         (SELECT COUNT(*) FROM exercises e WHERE e.lesson_id = l.id) AS total,
         (SELECT COUNT(*) FROM exercises e WHERE e.lesson_id = l.id AND e.slug IN (${DONE_SLUGS})) AS done
       FROM lessons l WHERE l.lab = ? ORDER BY l.sort, l.title`,
      [lab],
    )
    .map((r) => ({
      slug: r.slug,
      title: r.title,
      summary: r.summary,
      level: r.level,
      sort: r.sort,
      exerciseCount: r.total,
      doneCount: r.done,
    }));
}

export function getLesson(db: Db, slug: string): LessonDetail | undefined {
  const row = db.get<{
    id: number; slug: string; lab: Lab; title: string; summary: string; level: Level; sort: number; body_json: string;
  }>('SELECT id, slug, lab, title, summary, level, sort, body_json FROM lessons WHERE slug = ?', [slug]);
  if (!row) return undefined;

  const body = JSON.parse(row.body_json) as { sections: LessonSection[]; related: string[] };

  const related = body.related.flatMap((s) => {
    const e = db.get<{ slug: string; text: string }>(
      "SELECT slug, text FROM expressions WHERE slug = ? AND status = 'published'",
      [s],
    );
    return e ? [e] : [];
  });

  const done = new Set(db.all<{ exercise_slug: string }>(DONE_SLUGS).map((r) => r.exercise_slug));
  const exercises = db
    .all<{ slug: string; type: ExerciseKind; level: Level; prompt: string; payload_json: string }>(
      'SELECT slug, type, level, prompt, payload_json FROM exercises WHERE lesson_id = ? ORDER BY sort',
      [row.id],
    )
    .map((e) => ({
      slug: e.slug,
      type: e.type,
      level: e.level,
      prompt: e.prompt,
      payload: JSON.parse(e.payload_json) as unknown,
      done: done.has(e.slug),
    }));

  const before = db.get<{ slug: string; title: string }>(
    'SELECT slug, title FROM lessons WHERE lab = ? AND sort < ? ORDER BY sort DESC LIMIT 1',
    [row.lab, row.sort],
  );
  const after = db.get<{ slug: string; title: string }>(
    'SELECT slug, title FROM lessons WHERE lab = ? AND sort > ? ORDER BY sort ASC LIMIT 1',
    [row.lab, row.sort],
  );

  return {
    slug: row.slug,
    lab: row.lab,
    title: row.title,
    summary: row.summary,
    level: row.level,
    sections: body.sections,
    related,
    exercises,
    ...(before ? { prev: before } : {}),
    ...(after ? { next: after } : {}),
  };
}
