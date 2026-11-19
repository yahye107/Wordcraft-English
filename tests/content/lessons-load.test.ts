import { describe, it, expect } from 'vitest';
import { loadContent } from '@/lib/content/load';
import { makeContentDir, CATEGORIES_YAML, expressionYaml } from './helpers';

export const lessonYaml = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    slug: 'what-tags-do',
    lab: 'dialogue',
    title: 'What tags do',
    summary: 'Tags tell the reader who is speaking.',
    level: 'beginner',
    sort: 1,
    sections: [
      { heading: 'The invisible tag', paragraphs: ['Said is almost invisible.'], examples: [{ text: '{speech|“Hi,”} {tag|she said.}', note: 'A plain tag.' }] },
      { heading: 'When to skip it', paragraphs: ['Skip a tag when context is clear.'] },
    ],
    related: [],
    ...over,
  });

export const exerciseYaml = (type: string, over: Record<string, unknown> = {}) => {
  const base: Record<string, unknown> = { slug: `ex-${type.replace(/_/g, "-")}`, lesson: 'what-tags-do', level: 'beginner', explanation: 'Because.' };
  const byType: Record<string, Record<string, unknown>> = {
    choose: { type: 'choose', prompt: 'Pick the tag.', options: ['she said', 'she smiled'], answer: 0 },
    fill_blank: { type: 'fill_blank', prompt: '“Go,” she ___.', accepted: ['said'] },
    identify: { type: 'identify', prompt: 'Label each.', items: [{ text: 'She said.', answer: 'tag' }, { text: 'She smiled.', answer: 'beat' }], choices: ['tag', 'beat'] },
    fix_punctuation: { type: 'fix_punctuation', prompt: 'Fix it.', broken: '“Go” she said', accepted: ['“Go,” she said.'] },
    free_write: { type: 'free_write', prompt: 'Write a line.', checklist: ['a', 'b', 'c'], sample: 'Sample.' },
  };
  return JSON.stringify({ ...base, ...byType[type], ...over });
};

const BASE = {
  'categories.yaml': CATEGORIES_YAML,
  'expressions/sadness/crestfallen.yaml': expressionYaml(),
  'lessons/dialogue/what-tags-do.yaml': lessonYaml(),
  'exercises/dialogue/ex-choose.yaml': exerciseYaml('choose'),
  'exercises/dialogue/ex-fill.yaml': exerciseYaml('fill_blank', { slug: 'ex-fill' }),
  'exercises/dialogue/ex-identify.yaml': exerciseYaml('identify'),
  'exercises/dialogue/ex-fix.yaml': exerciseYaml('fix_punctuation'),
  'exercises/dialogue/ex-free.yaml': exerciseYaml('free_write'),
};

const errorsOf = (files: Record<string, string>) => loadContent(makeContentDir({ ...BASE, ...files })).errors;

describe('lessons and exercises', () => {
  it('valid lesson and exercises load with no errors', () => {
    const { bundle, errors } = loadContent(makeContentDir(BASE));
    expect(errors).toEqual([]);
    expect(bundle.lessons).toHaveLength(1);
    expect(bundle.exercises).toHaveLength(5);
  });

  it('a lesson with one section is an error', () => {
    const one = lessonYaml({ sections: [{ heading: 'Only', paragraphs: ['x'] }] });
    expect(errorsOf({ 'lessons/dialogue/what-tags-do.yaml': one }).some((e) => /sections/.test(e.message))).toBe(true);
  });

  it('an exercise for a missing lesson is an error naming the slug', () => {
    const e = errorsOf({ 'exercises/dialogue/ex-choose.yaml': exerciseYaml('choose', { lesson: 'ghost-lesson' }) });
    expect(e.some((x) => x.message.includes('ghost-lesson'))).toBe(true);
  });

  it('a related expression that does not exist is an error', () => {
    const e = errorsOf({ 'lessons/dialogue/what-tags-do.yaml': lessonYaml({ related: ['nonexistent-word'] }) });
    expect(e.some((x) => /unknown expression/i.test(x.message) && x.message.includes('nonexistent-word'))).toBe(true);
  });

  it('a choose answer index outside the options is an error', () => {
    const e = errorsOf({ 'exercises/dialogue/ex-choose.yaml': exerciseYaml('choose', { answer: 5 }) });
    expect(e.length).toBeGreaterThan(0);
  });

  it('a fill_blank prompt without ___ is an error', () => {
    const e = errorsOf({ 'exercises/dialogue/ex-fill.yaml': exerciseYaml('fill_blank', { slug: 'ex-fill', prompt: 'No blank here.' }) });
    expect(e.some((x) => /___/.test(x.message))).toBe(true);
  });

  it('an identify answer that is not in choices is an error', () => {
    const items = [{ text: 'A', answer: 'tag' }, { text: 'B', answer: 'thought' }];
    const e = errorsOf({ 'exercises/dialogue/ex-identify.yaml': exerciseYaml('identify', { items }) });
    expect(e.length).toBeGreaterThan(0);
  });

  it('a free_write with 2 checklist items is an error', () => {
    const e = errorsOf({ 'exercises/dialogue/ex-free.yaml': exerciseYaml('free_write', { checklist: ['a', 'b'] }) });
    expect(e.length).toBeGreaterThan(0);
  });

  it('a duplicate exercise slug names both files', () => {
    const e = errorsOf({ 'exercises/dialogue/copy.yaml': exerciseYaml('choose') });
    const dup = e.find((x) => /duplicate/i.test(x.message));
    expect(dup?.message).toContain('ex-choose.yaml');
    expect(dup?.message).toContain('copy.yaml');
  });

  it('a duplicate lesson slug is an error', () => {
    const e = errorsOf({ 'lessons/dialogue/copy.yaml': lessonYaml() });
    expect(e.some((x) => /duplicate lesson/i.test(x.message))).toBe(true);
  });
});
