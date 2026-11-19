export const WRITING_LIMITS = { text: 5000, sentence: 500, revisions: 20, title: 100 } as const;

export const MODES = ['sentence', 'vocabulary', 'situation', 'paragraph', 'creative', 'professional'] as const;
export type Mode = (typeof MODES)[number];

export const MODE_LABEL: Record<Mode, string> = {
  sentence: 'Sentence improvement',
  vocabulary: 'Vocabulary replacement',
  situation: 'Situations',
  paragraph: 'Paragraphs',
  creative: 'Creative writing',
  professional: 'Professional writing',
};

export const isMode = (v: unknown): v is Mode => typeof v === 'string' && (MODES as readonly string[]).includes(v);

export type Category = 'grammar' | 'spelling' | 'vocabulary' | 'naturalness' | 'structure' | 'tone' | 'punctuation';
export const CATEGORIES: readonly Category[] = ['grammar', 'spelling', 'vocabulary', 'naturalness', 'structure', 'tone', 'punctuation'];

export type Issue = {
  category: Category;
  key: string;
  quote: string;
  why: string;
  hints: [string, string, string];
  alternatives: { slug: string; text: string; why: string }[];
  source: 'local' | 'ai';
};

export type StoredIssue = Issue & { id: number; hintLevelShown: number; resolved: boolean };
