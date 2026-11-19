export type Grade = 'again' | 'hard' | 'good' | 'easy';

export type CardState = {
  ease: number;
  intervalDays: number;
  reps: number;
  lapses: number;
  dueAt: string;
  lastReviewedAt: string | null;
};

const DAY_MS = 86_400_000;
const QUALITY: Record<Grade, number> = { again: 1, hard: 3, good: 4, easy: 5 };

export const GRADES: readonly Grade[] = ['again', 'hard', 'good', 'easy'];

export function newCardState(now: Date): CardState {
  return { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0, dueAt: now.toISOString(), lastReviewedAt: null };
}

/** SM-2, adapted to four buttons. Returns a new state; the input is never changed. */
export function schedule(card: CardState, grade: Grade, now: Date): CardState {
  const q = QUALITY[grade];
  let { reps, lapses, intervalDays } = card;
  const previous = card.intervalDays;

  if (q < 3) {
    reps = 0;
    lapses += 1;
    intervalDays = 1;
  } else {
    reps += 1;
    if (grade === 'hard') {
      intervalDays = reps === 1 ? 1 : Math.max(previous + 1, Math.round(previous * 1.2));
    } else {
      const good = reps === 1 ? 1 : reps === 2 ? 6 : Math.round(previous * card.ease);
      intervalDays = grade === 'easy' ? Math.max(good + 1, Math.round(good * 1.3)) : good;
    }
  }

  const delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02);
  const ease = Math.max(1.3, card.ease + delta);
  intervalDays = Math.max(1, Math.round(intervalDays));

  return {
    ease,
    intervalDays,
    reps,
    lapses,
    dueAt: new Date(now.getTime() + intervalDays * DAY_MS).toISOString(),
    lastReviewedAt: now.toISOString(),
  };
}
