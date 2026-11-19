import type { Db } from '@/lib/db';
import { checkAnswer, type CheckResult, type ExerciseKind } from '@/lib/exercises/check';

type Ok = Extract<CheckResult, { ok: true }>;

export type SubmitResult =
  | { status: 200; body: Ok }
  | { status: 400 | 404; body: { ok: false; error: string } };

/** Check an answer and, only when it is valid, store the attempt. */
export function submitAnswer(db: Db, exerciseSlug: string, answer: unknown): SubmitResult {
  const ex = db.get<{
    slug: string; type: ExerciseKind; payload_json: string; answer_json: string; explanation: string;
  }>('SELECT slug, type, payload_json, answer_json, explanation FROM exercises WHERE slug = ?', [exerciseSlug]);
  if (!ex) return { status: 404, body: { ok: false, error: 'That exercise does not exist.' } };

  const result = checkAnswer(
    {
      slug: ex.slug,
      type: ex.type,
      payload: JSON.parse(ex.payload_json),
      answer: JSON.parse(ex.answer_json),
      explanation: ex.explanation,
    },
    answer,
  );
  if (!result.ok) return { status: 400, body: { ok: false, error: result.error } };

  db.run('INSERT INTO exercise_attempts (exercise_slug, answer_json, correct) VALUES (?, ?, ?)', [
    ex.slug,
    JSON.stringify(answer),
    result.correct === null ? null : result.correct ? 1 : 0,
  ]);
  return { status: 200, body: result };
}
