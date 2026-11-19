import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadContent } from '@/lib/content/load';
import type { CategoryNode } from '@/lib/content/schemas';

const { bundle, errors } = loadContent(path.join(process.cwd(), 'content'));

function descendants(node: CategoryNode): string[] {
  return [node.slug, ...(node.children ?? []).flatMap(descendants)];
}

describe('starter content coverage', () => {
  it('has no content validation errors', () => {
    expect(errors).toEqual([]);
  });

  it('has all 26 top-level categories', () => {
    expect(bundle.categories).toHaveLength(26);
  });

  it('has at least 4 published expressions in every top-level category', () => {
    const published = bundle.expressions.filter((e) => e.status === 'published');
    const short: string[] = [];
    for (const top of bundle.categories) {
      const slugs = new Set(descendants(top));
      const n = published.filter((e) => e.categories.some((c) => slugs.has(c))).length;
      if (n < 4) short.push(`${top.slug}: ${n}`);
    }
    expect(short).toEqual([]);
  });

  it('has at least 12 contrast groups', () => {
    expect(bundle.contrasts.length).toBeGreaterThanOrEqual(12);
  });

  it('every published expression has 3+ examples and non-empty explanations', () => {
    const bad = bundle.expressions
      .filter((e) => e.status === 'published')
      .filter(
        (e) =>
          e.examples.length < 3 ||
          !e.simpleMeaning.trim() ||
          !e.contextualMeaning.trim() ||
          !e.usageNotes.trim(),
      )
      .map((e) => e.slug);
    expect(bad).toEqual([]);
  });

  it('covers beginner, intermediate and advanced levels', () => {
    const levels = new Set(bundle.expressions.map((e) => e.level));
    for (const l of ['beginner', 'intermediate', 'advanced']) expect(levels.has(l as never)).toBe(true);
  });
});
