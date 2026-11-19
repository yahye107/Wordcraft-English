import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadContent } from '@/lib/content/load';
import { parseAnnotated, type AnnotationKind } from '@/lib/annotate';

const { bundle, errors } = loadContent(path.join(process.cwd(), 'content'));

const SLUGS = [
  'subordinate-clauses',
  'participial-phrases',
  'cause-and-effect',
  'expressing-contrast',
  'describing-movement',
  'describing-environments',
  'emotion-through-physical-reaction',
  'thoughts-and-realisations',
  'creating-suspense',
  'combining-actions-and-dialogue',
  'sentence-length-and-rhythm',
  'improving-flow',
];

const lessons = bundle.lessons.filter((l) => l.lab === 'sentence');
const slugs = new Set(lessons.map((l) => l.slug));
const exercises = bundle.exercises.filter((x) => slugs.has(x.lesson));

function textsOf(): string[] {
  const out: string[] = [];
  for (const l of lessons) for (const s of l.sections) out.push(...s.paragraphs, ...s.bullets, ...s.examples.map((e) => e.text));
  for (const x of exercises) {
    out.push(x.prompt);
    if (x.type === 'choose') out.push(...x.options);
    if (x.type === 'identify') out.push(...x.items.map((i) => i.text));
    if (x.type === 'fix_punctuation') out.push(x.broken);
    if (x.type === 'reorder') out.push(...x.fragments);
    if (x.type === 'free_write' && x.sample) out.push(x.sample);
  }
  return out;
}

describe('sentence lab coverage', () => {
  it('content has no validation errors', () => {
    expect(errors).toEqual([]);
  });

  it('has exactly the 12 planned lessons in order', () => {
    const ordered = [...lessons].sort((a, b) => a.sort - b.sort);
    expect(ordered.map((l) => l.slug)).toEqual(SLUGS);
    expect(ordered.map((l) => l.sort)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('every lesson has at least 3 sections', () => {
    expect(lessons.filter((l) => l.sections.length < 3).map((l) => l.slug)).toEqual([]);
  });

  it('every lesson has at least 4 annotated examples', () => {
    const few = lessons
      .filter((l) => l.sections.flatMap((s) => s.examples).filter((e) => parseAnnotated(e.text).some((g) => g.kind !== 'plain')).length < 4)
      .map((l) => l.slug);
    expect(few).toEqual([]);
  });

  it('every lesson has at least 4 exercises including one free_write', () => {
    const bad = lessons
      .filter((l) => {
        const own = exercises.filter((x) => x.lesson === l.slug);
        return own.length < 4 || !own.some((x) => x.type === 'free_write');
      })
      .map((l) => l.slug);
    expect(bad).toEqual([]);
  });

  it('has at least 55 exercises and uses reorder at least 6 times', () => {
    expect(exercises.length).toBeGreaterThanOrEqual(55);
    expect(exercises.filter((x) => x.type === 'reorder').length).toBeGreaterThanOrEqual(6);
  });

  it('uses every sentence-structure annotation kind somewhere', () => {
    const used = new Set<AnnotationKind>();
    for (const l of lessons) for (const s of l.sections) for (const e of s.examples) for (const g of parseAnnotated(e.text)) used.add(g.kind);
    for (const k of ['main', 'sub', 'part', 'link', 'detail'] as const) expect(used.has(k)).toBe(true);
  });

  it('every annotation parses with no leftover braces', () => {
    const bad = textsOf().filter((t) => parseAnnotated(t).some((s) => s.kind === 'plain' && /[{}]/.test(s.text)));
    expect(bad).toEqual([]);
  });

  it('each lesson ends with a "Use it in a new situation" section', () => {
    const bad = lessons.filter((l) => !l.sections[l.sections.length - 1].heading.startsWith('Use it in a new situation')).map((l) => l.slug);
    expect(bad).toEqual([]);
  });

  it('no two non-reorder exercises share a prompt across both labs', () => {
    const seen = new Map<string, string>();
    const dup: string[] = [];
    for (const x of bundle.exercises.filter((e) => e.type !== 'reorder')) {
      if (seen.has(x.prompt)) dup.push(`${x.slug} / ${seen.get(x.prompt)}`);
      seen.set(x.prompt, x.slug);
    }
    expect(dup).toEqual([]);
  });

  it('every reorder exercise has different fragments from every other', () => {
    const keys = bundle.exercises.filter((e) => e.type === 'reorder').map((e) => (e.type === 'reorder' ? e.fragments.join('|') : ''));
    expect(new Set(keys).size).toBe(keys.length);
  });
});
