export type LabInfo = {
  lab: 'dialogue' | 'sentence';
  /** URL segment under /labs */
  path: 'dialogue' | 'sentences';
  title: string;
  intro: string;
};

export const DIALOGUE_LAB: LabInfo = {
  lab: 'dialogue',
  path: 'dialogue',
  title: 'Dialogue and narration',
  intro:
    'Learn how professional writers build dialogue: who is speaking, what the body does, and how feeling shows without being announced. Work through the lessons in order.',
};

export const SENTENCE_LAB: LabInfo = {
  lab: 'sentence',
  path: 'sentences',
  title: 'Sentence construction',
  intro:
    'Learn the patterns that make sentences natural and vivid: how clauses join, how to show cause and contrast, how to describe movement and places, and how to control rhythm. Work through the lessons in order.',
};
