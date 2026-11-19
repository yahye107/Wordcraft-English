import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadContent } from '@/lib/content/load';

const { bundle, errors } = loadContent(path.join(process.cwd(), 'content'));
const byMode = (mode: string) => bundle.prompts.filter((p) => p.mode === mode);

describe('writing prompts coverage', () => {
  it('content has no validation errors', () => {
    expect(errors).toEqual([]);
  });

  it('has at least 8 prompts for each of the four modes', () => {
    for (const mode of ['situation', 'paragraph', 'creative', 'professional']) {
      expect(byMode(mode).length, mode).toBeGreaterThanOrEqual(8);
    }
  });

  it('every try expression exists in the library', () => {
    const slugs = new Set(bundle.expressions.map((e) => e.slug));
    const missing = bundle.prompts.flatMap((p) => p.try.filter((t) => !slugs.has(t)).map((t) => `${p.slug}: ${t}`));
    expect(missing).toEqual([]);
  });

  it('every situation is specific (at least 60 characters) and has 2 to 4 try words', () => {
    const bad = bundle.prompts.filter((p) => p.situation.length < 60 || p.try.length < 2 || p.try.length > 4).map((p) => p.slug);
    expect(bad).toEqual([]);
  });

  it('creative prompts cover story, character, dialogue scene and fictional scene', () => {
    const kinds = new Set(byMode('creative').map((p) => p.kind));
    for (const k of ['story', 'character', 'dialogue scene', 'fictional scene']) expect(kinds.has(k), k).toBe(true);
  });

  it('professional prompts cover email, report, article and academic', () => {
    const kinds = new Set(byMode('professional').map((p) => p.kind));
    for (const k of ['email', 'report', 'article', 'academic paragraph']) expect(kinds.has(k), k).toBe(true);
  });

  it('has no duplicate titles and covers beginner to advanced', () => {
    const titles = bundle.prompts.map((p) => p.title);
    expect(new Set(titles).size).toBe(titles.length);
    const levels = new Set(bundle.prompts.map((p) => p.level));
    for (const l of ['beginner', 'intermediate', 'advanced']) expect(levels.has(l as never)).toBe(true);
  });
});
