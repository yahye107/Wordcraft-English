export type SentenceInfo = { text: string; kind: 'dialogue' | 'narration' | 'mixed'; words: number };

export type PassageStats = { sentences: number; averageWords: number; longest: number; shortest: number };

export type VocabHit = { slug: string; text: string; simpleMeaning: string; level: string; quote: string };

export type TechniqueHit = { name: string; quote: string; note: string; lessonHref: string | null };

export type LocalAnalysis = {
  markup: string;
  sentences: SentenceInfo[];
  stats: PassageStats;
  vocabulary: VocabHit[];
  unfamiliar: string[];
  techniques: TechniqueHit[];
};

export type AiAnalysis = {
  vocabulary: { quote: string; meaning: string }[];
  structure: string;
  grammar: { quote: string; explanation: string }[];
  dialogue: string | null;
  descriptive: string | null;
  emotion: string | null;
  whyNatural: string;
  technique: { name: string; how: string };
  example: { situation: string; text: string };
  tryIt: string;
};

export type AnalysisResult = { local: LocalAnalysis; ai: AiAnalysis | null };
