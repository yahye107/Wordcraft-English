export type ExerciseKind = 'choose' | 'fill_blank' | 'identify' | 'fix_punctuation' | 'reorder' | 'free_write';

export type StoredExercise = {
  slug: string;
  type: ExerciseKind;
  payload: unknown;
  answer: unknown;
  explanation: string;
};

export type CheckResult =
  | { ok: true; correct: boolean | null; feedback: string; expected?: string; sample?: string }
  | { ok: false; error: string };

const MAX_TEXT = 4000;

const straighten = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** For fill_blank: ignores case, spacing, curly quotes and trailing punctuation. */
export function normaliseLoose(s: string): string {
  return squash(straighten(s)).toLowerCase().replace(/[.,!?;:]+$/, '');
}

/** For fix_punctuation: only quote style and spacing are ignored; capitals and punctuation count. */
export function normaliseStrict(s: string): string {
  return squash(straighten(s));
}

const bad = (error: string): CheckResult => ({ ok: false, error });
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function readText(answer: unknown): string | CheckResult {
  if (!isObject(answer) || typeof answer.text !== 'string') return bad('Send the answer as { "text": "..." }.');
  if (answer.text.trim() === '') return bad('Write an answer first.');
  if (answer.text.length > MAX_TEXT) return bad(`The answer is too long (limit ${MAX_TEXT} characters).`);
  return answer.text;
}

function verdict(correct: boolean, explanation: string, expected?: string): CheckResult {
  return {
    ok: true,
    correct,
    feedback: `${correct ? 'Correct.' : 'Not quite.'} ${explanation}`,
    ...(correct || expected === undefined ? {} : { expected }),
  };
}

export function checkAnswer(ex: StoredExercise, answer: unknown): CheckResult {
  const key = (isObject(ex.answer) ? ex.answer : {}) as Record<string, unknown>;
  const payload = (isObject(ex.payload) ? ex.payload : {}) as Record<string, unknown>;

  switch (ex.type) {
    case 'choose': {
      const options = (payload.options as string[]) ?? [];
      if (!isObject(answer) || !Number.isInteger(answer.choice)) return bad('Send the answer as { "choice": number }.');
      const choice = answer.choice as number;
      if (choice < 0 || choice >= options.length) return bad('That choice does not exist.');
      return verdict(choice === key.answer, ex.explanation, options[key.answer as number]);
    }

    case 'fill_blank': {
      const text = readText(answer);
      if (typeof text !== 'string') return text;
      const accepted = (key.accepted as string[]) ?? [];
      return verdict(accepted.map(normaliseLoose).includes(normaliseLoose(text)), ex.explanation, accepted[0]);
    }

    case 'fix_punctuation': {
      const text = readText(answer);
      if (typeof text !== 'string') return text;
      const accepted = (key.accepted as string[]) ?? [];
      return verdict(accepted.map(normaliseStrict).includes(normaliseStrict(text)), ex.explanation, accepted[0]);
    }

    case 'identify': {
      const items = (payload.items as string[]) ?? [];
      const expected = (key.answers as string[]) ?? [];
      if (!isObject(answer) || !Array.isArray(answer.labels) || answer.labels.length !== items.length) {
        return bad(`Label every item: send { "labels": [...] } with ${items.length} entries.`);
      }
      if (!answer.labels.every((l) => typeof l === 'string')) return bad('Every label must be text.');
      const wrong = answer.labels.flatMap((l, i) => (l === expected[i] ? [] : [i + 1]));
      if (wrong.length === 0) return verdict(true, ex.explanation);
      const list = wrong.length === 1 ? `item ${wrong[0]}` : `items ${wrong.slice(0, -1).join(', ')} and ${wrong[wrong.length - 1]}`;
      return { ok: true, correct: false, feedback: `Not quite. Look again at ${list}. ${ex.explanation}` };
    }

    case 'reorder': {
      const fragments = (payload.fragments as string[]) ?? [];
      const accepted = (key.accepted as number[][]) ?? [];
      const n = fragments.length;
      const order = isObject(answer) ? answer.order : undefined;
      const valid =
        Array.isArray(order) &&
        order.length === n &&
        order.every((x) => Number.isInteger(x) && x >= 0 && x < n) &&
        new Set(order).size === n;
      if (!valid) return bad(`Use every fragment once: send { "order": [...] } with ${n} different numbers.`);
      const given = order as number[];
      const right = accepted.some((a) => a.length === given.length && a.every((x, i) => x === given[i]));
      const expected = accepted[0]?.map((i) => fragments[i]).join(' ');
      return verdict(right, ex.explanation, expected);
    }

    case 'free_write': {
      const text = readText(answer);
      if (typeof text !== 'string') return text;
      const sample = typeof key.sample === 'string' ? key.sample : undefined;
      return { ok: true, correct: null, feedback: ex.explanation, ...(sample ? { sample } : {}) };
    }

    default:
      return bad('Unknown exercise type.');
  }
}
