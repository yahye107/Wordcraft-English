import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadContent } from '@/lib/content/load';
import type { CategoryNode } from '@/lib/content/schemas';

const { bundle, errors } = loadContent(path.join(process.cwd(), 'content'));

function descendants(node: CategoryNode): string[] {
  return [node.slug, ...(node.children ?? []).flatMap(descendants)];
}

// The 26 areas of the starter set. Later phases add more areas (see expansion.test.ts); these must stay well covered
// by published entries, because they are what learners see until the new drafts are approved.
const STARTER_AREAS = [
  'emotions-and-feelings', 'anger-and-frustration', 'happiness-and-joy', 'sadness-and-disappointment', 'fear-and-anxiety',
  'love-and-admiration', 'facial-expressions', 'body-language-and-gestures', 'speaking-styles-and-dialogue-tags',
  'thinking-and-decision-making', 'movement-and-actions', 'physical-sensations', 'weather-and-environment',
  'nature-and-landscapes', 'personality-and-character', 'relationships-and-social', 'conflict-and-arguments',
  'agreement-disagreement-persuasion', 'confidence-and-hesitation', 'intelligence-and-understanding',
  'literary-devices-imagery', 'transitions-and-connectors', 'descriptive-adjectives-adverbs', 'professional-and-academic',
  'everyday-conversation', 'narrative-and-storytelling',
];

describe('starter content coverage', () => {
  it('has no content validation errors', () => {
    expect(errors).toEqual([]);
  });

  it('has all 26 starter top-level categories (and may have more)', () => {
    const have = new Set(bundle.categories.map((c) => c.slug));
    expect(STARTER_AREAS.filter((a) => !have.has(a))).toEqual([]);
    expect(bundle.categories.length).toBeGreaterThanOrEqual(26);
  });

  it('has at least 4 published expressions in every starter top-level category', () => {
    const published = bundle.expressions.filter((e) => e.status === 'published');
    const short: string[] = [];
    for (const top of bundle.categories.filter((c) => STARTER_AREAS.includes(c.slug))) {
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
