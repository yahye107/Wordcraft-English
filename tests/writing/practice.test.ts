import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadContent } from '@/lib/content/load';
import { CATEGORIES } from '@/lib/writing/limits';
import { practiceFor } from '@/lib/writing/practice';

const { bundle } = loadContent(path.join(process.cwd(), 'content'));
const lessonSlugs = new Set(bundle.lessons.map((l) => `${l.lab === 'sentence' ? 'sentences' : 'dialogue'}/${l.slug}`));
const STATIC = new Set(['/studio', '/studio/vocabulary', '/explore', '/search', '/labs', '/notebook']);

function resolves(href: string): boolean {
  if (STATIC.has(href)) return true;
  const lesson = /^\/labs\/(dialogue|sentences)\/(.+)$/.exec(href);
  if (lesson) return lessonSlugs.has(`${lesson[1]}/${lesson[2]}`);
  const mode = /^\/studio\/(\w+)$/.exec(href);
  if (mode) return ['sentence', 'vocabulary', 'situation', 'paragraph', 'creative', 'professional'].includes(mode[1]);
  return false;
}

describe('practiceFor', () => {
  it('returns at least one link for every category and every key shape', () => {
    for (const c of CATEGORIES) {
      for (const key of [`${c}:other`, `${c}:something-else`, `${c}:very`]) {
        const p = practiceFor(c, key);
        expect(p.links.length).toBeGreaterThan(0);
        expect(p.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('every link resolves to a real lesson or route', () => {
    const keys = [
      'vocabulary:very', 'vocabulary:good', 'naturalness:repeat:garden', 'structure:same-start:then', 'structure:long-sentence',
      'structure:same-length', 'punctuation:capital', 'grammar:doubled-word', 'grammar:missing-article', 'punctuation:dialogue-comma',
    ];
    for (const key of keys) {
      const category = key.split(':')[0] as (typeof CATEGORIES)[number];
      for (const l of practiceFor(category, key).links) expect(resolves(l.href), `${key} -> ${l.href}`).toBe(true);
    }
  });

  it('falls back to the studio for unknown keys', () => {
    const p = practiceFor('tone', 'tone:unheard-of');
    expect(p.links.some((l) => l.href.startsWith('/studio'))).toBe(true);
  });

  it('points rhythm problems at the sentence lab lessons', () => {
    const hrefs = practiceFor('structure', 'structure:same-length').links.map((l) => l.href);
    expect(hrefs).toContain('/labs/sentences/sentence-length-and-rhythm');
  });
});
