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

export type ContentBundle = {
  categories: CategoryNode[];
  expressions: ExpressionFile[];
  contrasts: ContrastFile[];
};
