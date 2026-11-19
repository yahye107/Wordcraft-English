import { z } from 'zod';

export const Level = z.enum(['beginner', 'intermediate', 'advanced', 'literary']);
export const Register = z.enum(['formal', 'neutral', 'informal', 'conversational', 'literary']);
export const Kind = z.enum(['word', 'phrase', 'idiom', 'collocation', 'pattern']);
export const Status = z.enum(['draft', 'published']);
export const Setting = z.enum(['dialogue', 'narration', 'everyday', 'professional', 'academic']);
export const RelationType = z.enum(['synonym', 'antonym', 'related', 'stronger', 'weaker']);

export type Level = z.infer<typeof Level>;
export type Register = z.infer<typeof Register>;

const slug = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'slug must be lowercase-with-hyphens');
const tag = z.string().regex(/^(emotion|situation|technique):[a-z0-9]+(-[a-z0-9]+)*$/, 'tag must look like "emotion:disappointment"');
const text = z.string().min(1);

export const ExpressionFile = z
  .object({
    slug,
    text,
    kind: Kind,
    pos: z.string().optional(),
    simpleMeaning: text,
    contextualMeaning: text,
    usageNotes: text,
    intensity: z.number().int().min(1).max(5).optional(),
    register: Register,
    level: Level,
    status: Status.default('published'),
    categories: z.array(slug).min(1),
    tags: z.array(tag).default([]),
    searchPhrases: z.array(text).default([]),
    examples: z
      .array(z.object({ text, setting: Setting, contextNote: z.string().optional() }))
      .default([]),
    relations: z.array(z.object({ to: slug, type: RelationType, note: z.string().optional() })).default([]),
    mistakes: z.array(z.object({ wrong: text, right: text, explanation: text })).default([]),
  })
  .superRefine((e, ctx) => {
    if (e.status === 'published' && e.examples.length < 3) {
      ctx.addIssue({
        code: 'custom',
        path: ['examples'],
        message: `published entries need at least 3 examples (found ${e.examples.length})`,
      });
    }
  });
export type ExpressionFile = z.infer<typeof ExpressionFile>;

export const ContrastFile = z.object({
  slug,
  title: text,
  explanation: text,
  members: z.array(z.object({ expression: slug, note: text, example: text })).min(2),
});
export type ContrastFile = z.infer<typeof ContrastFile>;

export type CategoryNode = {
  slug: string;
  name: string;
  description: string;
  children?: CategoryNode[];
};

export const CategoryNode: z.ZodType<CategoryNode> = z.lazy(() =>
  z.object({
    slug,
    name: text,
    description: text,
    children: z.array(CategoryNode).optional(),
  }),
);

export const CategoriesFile = z.object({ categories: z.array(CategoryNode).min(1) });

export const LessonSection = z.object({
  heading: text,
  paragraphs: z.array(text).min(1),
  bullets: z.array(text).default([]),
  examples: z.array(z.object({ text, note: z.string().optional() })).default([]),
});
export type LessonSection = z.infer<typeof LessonSection>;

export const LessonFile = z.object({
  slug,
  lab: z.enum(['dialogue', 'sentence']),
  title: text,
  summary: text,
  level: Level,
  sort: z.number().int(),
  sections: z.array(LessonSection).min(2),
  related: z.array(slug).default([]),
});
export type LessonFile = z.infer<typeof LessonFile>;

const exerciseBase = { slug, lesson: slug, level: Level, prompt: text, explanation: text };

const ChooseExercise = z
  .object({
    ...exerciseBase,
    type: z.literal('choose'),
    options: z.array(text).min(2).max(6),
    answer: z.number().int().min(0),
  })
  .superRefine((e, ctx) => {
    if (e.answer >= e.options.length) {
      ctx.addIssue({ code: 'custom', path: ['answer'], message: `answer index ${e.answer} is outside the ${e.options.length} options` });
    }
  });

const FillBlankExercise = z
  .object({ ...exerciseBase, type: z.literal('fill_blank'), accepted: z.array(text).min(1) })
  .superRefine((e, ctx) => {
    if (!e.prompt.includes('___')) {
      ctx.addIssue({ code: 'custom', path: ['prompt'], message: 'fill_blank prompt must contain a blank written as ___' });
    }
  });

const IdentifyExercise = z
  .object({
    ...exerciseBase,
    type: z.literal('identify'),
    items: z.array(z.object({ text, answer: text })).min(2),
    choices: z.array(text).min(2),
  })
  .superRefine((e, ctx) => {
    e.items.forEach((item, i) => {
      if (!e.choices.includes(item.answer)) {
        ctx.addIssue({ code: 'custom', path: ['items', i, 'answer'], message: `answer "${item.answer}" is not one of the choices` });
      }
    });
  });

const FixPunctuationExercise = z.object({
  ...exerciseBase,
  type: z.literal('fix_punctuation'),
  broken: text,
  accepted: z.array(text).min(1),
});

const ReorderExercise = z
  .object({
    ...exerciseBase,
    type: z.literal('reorder'),
    fragments: z.array(text).min(3).max(8),
    accepted: z.array(z.array(z.number().int())).min(1),
  })
  .superRefine((e, ctx) => {
    const n = e.fragments.length;
    e.accepted.forEach((order, i) => {
      const ok = order.length === n && new Set(order).size === n && order.every((x) => x >= 0 && x < n);
      if (!ok) {
        ctx.addIssue({ code: 'custom', path: ['accepted', i], message: `an accepted ordering must use every fragment (0 to ${n - 1}) exactly once` });
      }
    });
  });

const FreeWriteExercise = z.object({
  ...exerciseBase,
  type: z.literal('free_write'),
  checklist: z.array(text).min(3).max(6),
  sample: z.string().optional(),
});

export const ExerciseFile = z.discriminatedUnion('type', [
  ChooseExercise,
  FillBlankExercise,
  IdentifyExercise,
  FixPunctuationExercise,
  ReorderExercise,
  FreeWriteExercise,
]);
export type ExerciseFile = z.infer<typeof ExerciseFile>;
export type ExerciseType = ExerciseFile['type'];

export type ContentBundle = {
  categories: CategoryNode[];
  expressions: ExpressionFile[];
  contrasts: ContrastFile[];
  lessons: LessonFile[];
  exercises: ExerciseFile[];
};
