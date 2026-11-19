import fs from 'node:fs';
import path from 'node:path';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { loadContent } from '@/lib/content/load';
import { seedContent } from '@/lib/content/seed';
import { makeContentDir, CATEGORIES_YAML } from './helpers';

/** A valid expression written as real YAML, so a test can change one line and compare the bytes. */
export function yamlEntry(o: { slug: string; status?: 'draft' | 'published' | null; examples?: number; eol?: string; text?: string; relations?: { to: string; type: string }[] }): string {
  const eol = o.eol ?? '\n';
  const n = o.examples ?? 3;
  const lines = [
    `slug: ${o.slug}`,
    `text: ${o.text ?? o.slug}`,
    'kind: word',
    'simpleMeaning: A plain meaning.',
    'contextualMeaning: Shows something in a real situation.',
    'usageNotes: Use it when something specific happens.',
    'register: neutral',
    'level: intermediate',
    ...(o.status === null || o.status === undefined ? [] : [`status: ${o.status}`]),
    'categories:',
    '  - disappointment',
    'tags:',
    '  - emotion:disappointment',
    'searchPhrases:',
    '  - one way to say it',
    'examples:',
    ...Array.from({ length: n }, (_, i) => [`  - text: Example ${i + 1} with ${o.slug}.`, '    setting: narration']).flat(),
    ...(o.relations && o.relations.length ? ['relations:', ...o.relations.flatMap((r) => [`  - to: ${r.to}`, `    type: ${r.type}`])] : ['relations: []']),
    'mistakes: []',
  ];
  return lines.join(eol) + eol;
}

export const contrastYaml = (slug: string, members: string[]) =>
  [
    `slug: ${slug}`,
    'title: A pair',
    'explanation: How they differ.',
    'members:',
    ...members.flatMap((m) => [`  - expression: ${m}`, '    note: A note.', `    example: Example with ${m}.`]),
  ].join('\n') + '\n';

export type Lib = { dir: string; db: Db; file: (rel: string) => string; read: (rel: string) => string };

/** A temporary content folder, seeded into a fresh in-memory database. */
export function library(files: Record<string, string>): Lib {
  const dir = makeContentDir({ 'categories.yaml': CATEGORIES_YAML, ...files });
  const db = openDb(':memory:');
  migrate(db);
  const { bundle, errors } = loadContent(dir);
  if (errors.length) throw new Error(`fixture has errors: ${JSON.stringify(errors)}`);
  seedContent(db, bundle);
  return { dir, db, file: (rel) => path.join(dir, rel), read: (rel) => fs.readFileSync(path.join(dir, rel), 'utf8') };
}
