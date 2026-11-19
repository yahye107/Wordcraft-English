import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { ZodType } from 'zod';
import {
  CategoriesFile,
  ContrastFile,
  ExpressionFile,
  LessonFile,
  ExerciseFile,
  PromptFile,
  type CategoryNode,
  type ContentBundle,
} from './schemas';

export type ContentError = { file: string; message: string };

function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.yaml')) out.push(full);
  }
  return out.sort();
}

function parseFile<T>(root: string, file: string, schema: ZodType<T>, errors: ContentError[]): T | undefined {
  const rel = path.relative(root, file).split(path.sep).join('/');
  let raw: unknown;
  try {
    raw = YAML.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    errors.push({ file: rel, message: `invalid YAML: ${(e as Error).message.split('\n')[0]}` });
    return undefined;
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues) {
      errors.push({ file: rel, message: `${issue.path.join('.') || '(root)'}: ${issue.message}` });
    }
    return undefined;
  }
  return result.data;
}

function collectCategorySlugs(nodes: CategoryNode[], seen: Set<string>, errors: ContentError[]): void {
  for (const n of nodes) {
    if (seen.has(n.slug)) errors.push({ file: 'categories.yaml', message: `duplicate category slug "${n.slug}"` });
    seen.add(n.slug);
    if (n.children) collectCategorySlugs(n.children, seen, errors);
  }
}

/** Read and validate everything under a content directory. Collects every error. */
export function loadContent(dir: string): { bundle: ContentBundle; errors: ContentError[] } {
  const errors: ContentError[] = [];
  const bundle: ContentBundle = { categories: [], expressions: [], contrasts: [], lessons: [], exercises: [], prompts: [] };

  const catFile = path.join(dir, 'categories.yaml');
  if (fs.existsSync(catFile)) {
    const cats = parseFile(dir, catFile, CategoriesFile, errors);
    if (cats) bundle.categories = cats.categories;
  } else {
    errors.push({ file: 'categories.yaml', message: 'file not found' });
  }

  const exprFiles = new Map<string, string>(); // slug -> rel file
  for (const file of walk(path.join(dir, 'expressions'))) {
    const e = parseFile(dir, file, ExpressionFile, errors);
    if (!e) continue;
    const rel = path.relative(dir, file).split(path.sep).join('/');
    const prior = exprFiles.get(e.slug);
    if (prior) {
      errors.push({ file: rel, message: `duplicate expression slug "${e.slug}" (also in ${prior}, ${rel})` });
      continue;
    }
    exprFiles.set(e.slug, rel);
    bundle.expressions.push(e);
  }

  const contrastFiles = new Map<string, string>();
  for (const file of walk(path.join(dir, 'contrasts'))) {
    const c = parseFile(dir, file, ContrastFile, errors);
    if (!c) continue;
    const rel = path.relative(dir, file).split(path.sep).join('/');
    const prior = contrastFiles.get(c.slug);
    if (prior) {
      errors.push({ file: rel, message: `duplicate contrast slug "${c.slug}" (also in ${prior}, ${rel})` });
      continue;
    }
    contrastFiles.set(c.slug, rel);
    bundle.contrasts.push(c);
  }

  const lessonFiles = new Map<string, string>();
  for (const file of walk(path.join(dir, 'lessons'))) {
    const l = parseFile(dir, file, LessonFile, errors);
    if (!l) continue;
    const rel = path.relative(dir, file).split(path.sep).join('/');
    const prior = lessonFiles.get(l.slug);
    if (prior) {
      errors.push({ file: rel, message: `duplicate lesson slug "${l.slug}" (also in ${prior}, ${rel})` });
      continue;
    }
    lessonFiles.set(l.slug, rel);
    bundle.lessons.push(l);
  }

  const exerciseFiles = new Map<string, string>();
  for (const file of walk(path.join(dir, 'exercises'))) {
    const x = parseFile(dir, file, ExerciseFile, errors);
    if (!x) continue;
    const rel = path.relative(dir, file).split(path.sep).join('/');
    const prior = exerciseFiles.get(x.slug);
    if (prior) {
      errors.push({ file: rel, message: `duplicate exercise slug "${x.slug}" (also in ${prior}, ${rel})` });
      continue;
    }
    exerciseFiles.set(x.slug, rel);
    bundle.exercises.push(x);
  }

  const promptFiles = new Map<string, string>();
  for (const file of walk(path.join(dir, 'prompts'))) {
    const x = parseFile(dir, file, PromptFile, errors);
    if (!x) continue;
    const rel = path.relative(dir, file).split(path.sep).join('/');
    const prior = promptFiles.get(x.slug);
    if (prior) {
      errors.push({ file: rel, message: `duplicate prompt slug "${x.slug}" (also in ${prior}, ${rel})` });
      continue;
    }
    promptFiles.set(x.slug, rel);
    bundle.prompts.push(x);
  }

  // Cross-reference checks
  const categorySlugs = new Set<string>();
  collectCategorySlugs(bundle.categories, categorySlugs, errors);
  const expressionSlugs = new Set(bundle.expressions.map((e) => e.slug));

  for (const e of bundle.expressions) {
    const rel = exprFiles.get(e.slug)!;
    for (const c of e.categories) {
      if (!categorySlugs.has(c)) errors.push({ file: rel, message: `unknown category "${c}"` });
    }
    for (const r of e.relations) {
      if (!expressionSlugs.has(r.to)) errors.push({ file: rel, message: `relation to unknown expression "${r.to}"` });
    }
  }
  for (const x of bundle.prompts) {
    for (const t of x.try) {
      if (!expressionSlugs.has(t)) errors.push({ file: promptFiles.get(x.slug)!, message: `try is an unknown expression "${t}"` });
    }
  }
  const lessonSlugs = new Set(bundle.lessons.map((l) => l.slug));
  for (const l of bundle.lessons) {
    const rel = lessonFiles.get(l.slug)!;
    for (const r of l.related) {
      if (!expressionSlugs.has(r)) errors.push({ file: rel, message: `related is an unknown expression "${r}"` });
    }
  }
  for (const x of bundle.exercises) {
    if (!lessonSlugs.has(x.lesson)) {
      errors.push({ file: exerciseFiles.get(x.slug)!, message: `exercise belongs to unknown lesson "${x.lesson}"` });
    }
  }
  for (const c of bundle.contrasts) {
    const rel = contrastFiles.get(c.slug)!;
    for (const m of c.members) {
      if (!expressionSlugs.has(m.expression)) {
        errors.push({ file: rel, message: `contrast member is an unknown expression "${m.expression}"` });
      }
    }
  }

  return { bundle, errors };
}
