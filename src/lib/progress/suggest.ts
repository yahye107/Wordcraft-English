export type Suggestion = { id: 'review' | 'practise' | 'lesson' | 'write' | 'passage' | 'explore'; title: string; text: string; href: string };

export type SuggestInput = {
  dueCards: number;
  weakness: { label: string; href: string } | null;
  nextLesson: { title: string; href: string; started: boolean } | null;
  /** Whole days since the last piece of writing, or null when there has been none. */
  daysSinceWriting: number | null;
  passages: number;
  hasActivity: boolean;
};

const MAX = 3;
const WRITE_AFTER_DAYS = 7;

/** What to do next, most useful first. Pure: the same input always gives the same list. */
export function suggestNext(input: SuggestInput): Suggestion[] {
  const out: Suggestion[] = [];

  if (input.dueCards > 0) {
    const n = input.dueCards;
    out.push({
      id: 'review',
      title: `Review ${n} ${n === 1 ? 'card' : 'cards'}`,
      text: 'A few minutes keeps your words fresh.',
      href: '/notebook/review',
    });
  }
  if (input.weakness) {
    out.push({
      id: 'practise',
      title: `Practise: ${input.weakness.label}`,
      text: 'You have met this more than once. A little practice helps it stick.',
      href: input.weakness.href,
    });
  }
  if (input.nextLesson) {
    const { title, href, started } = input.nextLesson;
    out.push({
      id: 'lesson',
      title: `${started ? 'Continue' : 'Start'}: ${title}`,
      text: started ? 'Pick up where you left off.' : 'A short lesson with exercises you can check.',
      href,
    });
  }
  if (input.daysSinceWriting === null || input.daysSinceWriting >= WRITE_AFTER_DAYS) {
    out.push({
      id: 'write',
      title: 'Write something short',
      text:
        input.daysSinceWriting === null
          ? 'One sentence is enough to start. The tutor shows what to look at.'
          : `You last wrote ${input.daysSinceWriting} days ago. One sentence is enough.`,
      href: '/studio/sentence',
    });
  }
  if (input.passages === 0 && input.hasActivity) {
    out.push({
      id: 'passage',
      title: 'Try the Novel lab',
      text: 'Paste a short passage from a book and see how it is written.',
      href: '/novel',
    });
  }

  const list = out.slice(0, MAX);
  if (list.length < 2) list.push({ id: 'explore', title: 'Explore expressions', text: 'Browse by feeling, action or situation.', href: '/explore' });
  return list;
}
