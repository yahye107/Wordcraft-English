export type TechniqueInfo = {
  name: string;
  /** One plain sentence: what the technique is and why a writer uses it. */
  note: string;
  /** A lesson in the labs that teaches it, when there is one. */
  lessonHref: string | null;
};

/** Techniques the local analysis can name. The order here is the order they are listed in. */
export const TECHNIQUES: readonly TechniqueInfo[] = [
  {
    name: 'Dialogue tag',
    note: 'A short phrase such as “she whispered” that tells the reader who is speaking and how.',
    lessonHref: '/labs/dialogue/what-dialogue-tags-do',
  },
  {
    name: 'Action beat',
    note: 'A small action beside the speech. It shows who is speaking and what they feel without a speech verb.',
    lessonHref: '/labs/dialogue/tags-and-action-beats',
  },
  {
    name: 'Participial phrase',
    note: 'An -ing or -ed phrase set off by a comma. It adds a second action or detail to the same sentence.',
    lessonHref: '/labs/sentences/participial-phrases',
  },
  {
    name: 'Subordinate clause',
    note: 'A clause that cannot stand alone, such as one starting with because or although. It adds a reason, a time or a contrast.',
    lessonHref: '/labs/sentences/subordinate-clauses',
  },
  {
    name: 'Linking word',
    note: 'A word at the start of a sentence that joins it to the one before: however, but, so.',
    lessonHref: '/labs/sentences/improving-flow',
  },
  {
    name: 'Short sentence for effect',
    note: 'A very short sentence after a long one. The change of pace makes the idea land.',
    lessonHref: '/labs/sentences/sentence-length-and-rhythm',
  },
  {
    name: 'Simile',
    note: 'A comparison with like or as. It lets the reader see one thing through another.',
    lessonHref: null,
  },
  {
    name: 'Repetition',
    note: 'The same word used again and again. Used on purpose, it builds rhythm or stresses an idea.',
    lessonHref: null,
  },
  {
    name: 'List of three',
    note: 'Three items in a row. Three feels complete and gives a natural rhythm.',
    lessonHref: '/labs/sentences/sentence-length-and-rhythm',
  },
  {
    name: 'Sensory detail',
    note: 'Words for what can be seen, heard, smelled, tasted or touched. They put the reader inside the scene.',
    lessonHref: '/labs/sentences/describing-environments',
  },
];

export const techniqueInfo = (name: string): TechniqueInfo => {
  const t = TECHNIQUES.find((x) => x.name === name);
  if (!t) throw new Error(`Unknown technique: ${name}`);
  return t;
};
