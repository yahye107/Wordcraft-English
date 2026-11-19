import { describe, it, expect } from 'vitest';
import { loadContent } from '@/lib/content/load';
import { makeContentDir, CATEGORIES_YAML, expressionYaml } from './helpers';
import { lessonYaml, exerciseYaml } from './lesson-helpers';

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
