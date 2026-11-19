import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadContent } from '@/lib/content/load';
import { parseAnnotated } from '@/lib/annotate';

const { bundle, errors } = loadContent(path.join(process.cwd(), 'content'));

const SLUGS = [
  'what-dialogue-tags-do',
  'tags-and-action-beats',
  'where-beats-go',
  'dialogue-without-tags',
  'showing-emotion-in-dialogue',
  'faces-and-bodies-with-speech',
  'hesitation-and-uncertainty',
  'sarcasm-and-subtext',
  'confidence-and-frustration',
  'inner-thoughts-and-reactions',
  'avoiding-repeated-tags',
  'a-short-scene',
];

const dialogue = bundle.lessons.filter((l) => l.lab === 'dialogue');
const dialogueSlugs = new Set(dialogue.map((l) => l.slug));
const exercises = bundle.exercises.filter((x) => dialogueSlugs.has(x.lesson));

/** Every piece of text in the lab that could carry annotation markup. */
function allTexts(): string[] {
  const out: string[] = [];
  for (const l of dialogue) {
    for (const s of l.sections) {
      out.push(...s.paragraphs, ...s.bullets, ...s.examples.map((e) => e.text));
    }
  }
  for (const x of exercises) {
    out.push(x.prompt);
    if (x.type === 'choose') out.push(...x.options);
    if (x.type === 'identify') out.push(...x.items.map((i) => i.text));
    if (x.type === 'fix_punctuation') out.push(x.broken);
    if (x.type === 'free_write' && x.sample) out.push(x.sample);
  }
  return out;
}

describe('dialogue lab coverage', () => {
  it('content has no validation errors', () => {
    expect(errors).toEqual([]);
  });

  it('has exactly the 12 planned lessons in order', () => {
    const ordered = [...dialogue].sort((a, b) => a.sort - b.sort);
    expect(ordered.map((l) => l.slug)).toEqual(SLUGS);
    expect(ordered.map((l) => l.sort)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('every lesson has at least 3 sections', () => {
    const short = dialogue.filter((l) => l.sections.length < 3).map((l) => l.slug);
    expect(short).toEqual([]);
  });

  it('every lesson has at least 4 annotated examples', () => {
    const few = dialogue
      .filter((l) => {
        const annotated = l.sections.flatMap((s) => s.examples).filter((e) => parseAnnotated(e.text).some((seg) => seg.kind !== 'plain'));
        return annotated.length < 4;
      })
      .map((l) => l.slug);
    expect(few).toEqual([]);
  });

  it('every lesson has at least 4 exercises, including at least one free_write', () => {
    const bad = dialogue
      .filter((l) => {
        const own = exercises.filter((x) => x.lesson === l.slug);
        return own.length < 4 || !own.some((x) => x.type === 'free_write');
      })
      .map((l) => l.slug);
    expect(bad).toEqual([]);
  });

  it('has at least 55 exercises overall and uses all five types', () => {
    expect(exercises.length).toBeGreaterThanOrEqual(55);
    const types = new Set(exercises.map((x) => x.type));
    for (const t of ['choose', 'fill_blank', 'identify', 'fix_punctuation', 'free_write']) expect(types.has(t as never)).toBe(true);
  });

  it('every annotation parses with no leftover braces', () => {
    const bad = allTexts().filter((t) => parseAnnotated(t).some((s) => s.kind === 'plain' && /[{}]/.test(s.text)));
    expect(bad).toEqual([]);
  });

  it('no two exercises share a prompt', () => {
    const seen = new Map<string, string>();
    const dup: string[] = [];
    for (const x of exercises) {
      if (seen.has(x.prompt)) dup.push(`${x.slug} / ${seen.get(x.prompt)}`);
      seen.set(x.prompt, x.slug);
    }
    expect(dup).toEqual([]);
  });

});
