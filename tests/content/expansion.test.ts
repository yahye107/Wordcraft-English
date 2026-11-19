import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadContent } from '@/lib/content/load';
import { lintBundle } from '@/lib/content/lint';
import { coverageReport } from '@/lib/content/report';
import type { CategoryNode, ExpressionFile } from '@/lib/content/schemas';

// The content-expansion phase: what the library must contain. Counts use published plus draft entries, so
// approving drafts later never breaks these checks.
const { bundle, errors } = loadContent(path.resolve(__dirname, '../../content'));

const NEW_AREAS = [
  'sound-and-silence',
  'light-colour-and-shadow',
  'time-pace-and-waiting',
  'humour-irony-and-sarcasm',
  'honesty-lies-and-secrets',
  'memory-and-nostalgia',
];

function areaOf(slug: string): string | undefined {
  const find = (nodes: CategoryNode[], top: string): string | undefined => {
    for (const n of nodes) {
      if (n.slug === slug) return top;
      const hit = n.children ? find(n.children, top) : undefined;
      if (hit) return hit;
    }
    return undefined;
  };
  for (const a of bundle.categories) {
    if (a.slug === slug) return a.slug;
    const hit = a.children ? find(a.children, a.slug) : undefined;
    if (hit) return hit;
  }
  return undefined;
}
const inNewAreas = (e: ExpressionFile) => NEW_AREAS.includes(areaOf(e.categories[0]) ?? '');
const fresh = bundle.expressions.filter(inNewAreas);

describe('the six new areas', () => {
  it('loads without errors', () => expect(errors).toEqual([]));

  it('exist, each with at least 2 subcategories', () => {
    for (const slug of NEW_AREAS) {
      const area = bundle.categories.find((c) => c.slug === slug);
      expect(area, slug).toBeDefined();
      expect((area?.children ?? []).length, slug).toBeGreaterThanOrEqual(2);
    }
  });

  it('each have at least 8 expressions in total (published plus draft)', () => {
    const counts = Object.fromEntries(coverageReport(bundle).byArea.map((a) => [a.slug, a.total]));
    for (const slug of NEW_AREAS) expect(counts[slug], slug).toBeGreaterThanOrEqual(8);
  });

  it('every entry meets the batch rules', () => {
    const bad: string[] = [];
    for (const e of fresh) {
      const settings = new Set(e.examples.map((x) => x.setting));
      if (e.examples.length < 3 || e.examples.length > 5) bad.push(`${e.slug}: ${e.examples.length} examples`);
      if (settings.size < 2) bad.push(`${e.slug}: examples in one setting`);
      if (e.searchPhrases.length < 3) bad.push(`${e.slug}: few search phrases`);
      if (e.mistakes.length < 1) bad.push(`${e.slug}: no mistake`);
      if (e.relations.length < 1) bad.push(`${e.slug}: no relation`);
      if (e.tags.length < 1) bad.push(`${e.slug}: no tag`);
    }
    expect(bad).toEqual([]);
  });

  it('have no lint errors and no lint warnings', () => {
    const slugs = new Set(fresh.map((e) => e.slug));
    const issues = lintBundle(bundle).filter((i) => (i.kind === 'expression' && slugs.has(i.slug)) || (i.kind === 'contrast' && NEW_GROUPS.has(i.slug)));
    expect(issues.map((i) => `${i.kind} ${i.slug} [${i.rule}] ${i.message}`)).toEqual([]);
  });

  it('keep the level mix: at least 25% beginner and 40% intermediate, at most 25% advanced and 5% literary', () => {
    const n = fresh.length;
    const share = (level: string) => fresh.filter((e) => e.level === level).length / n;
    expect(share('beginner')).toBeGreaterThanOrEqual(0.25);
    expect(share('intermediate')).toBeGreaterThanOrEqual(0.4);
    expect(share('advanced')).toBeLessThanOrEqual(0.25);
    expect(share('literary')).toBeLessThanOrEqual(0.05);
  });

  it('are the only places the new entries use text or examples that appear elsewhere (no duplicates)', () => {
    const seen = new Map<string, string>();
    const dupes: string[] = [];
    for (const e of bundle.expressions) {
      for (const x of e.examples) {
        const k = x.text.toLowerCase().replace(/\s+/g, ' ').trim();
        const prior = seen.get(k);
        if (prior && prior !== e.slug) dupes.push(`${e.slug} / ${prior}: ${x.text}`);
        seen.set(k, e.slug);
      }
    }
    expect(dupes).toEqual([]);
  });
});

// Contrast groups added with the new areas (grows as batches are written).
const NEW_GROUPS = new Set([
  'hushed-muffled-shrill-deafening',
  'flickered-glinted-gleaming-dazzling',
  'dragged-on-flew-by-little-by-little-all-of-a-sudden',
  'joked-teased-poked-fun-at-mocked',
  'confessed-came-clean-blurted-out-let-it-slip',
  'recalled-rang-a-bell-jogged-her-memory-came-flooding-back',
]);

describe('contrast groups for the new areas', () => {
  it('exist, with at least 3 members each and every member present', () => {
    const slugs = new Set(bundle.expressions.map((e) => e.slug));
    for (const g of NEW_GROUPS) {
      const c = bundle.contrasts.find((x) => x.slug === g);
      expect(c, g).toBeDefined();
      expect(c!.members.length, g).toBeGreaterThanOrEqual(3);
      for (const m of c!.members) expect(slugs.has(m.expression), `${g}: ${m.expression}`).toBe(true);
    }
  });

  it('there is one group per new area', () => {
    const groupAreas = new Set<string>();
    for (const c of bundle.contrasts) {
      const first = bundle.expressions.find((e) => e.slug === c.members[0].expression);
      const area = first ? areaOf(first.categories[0]) : undefined;
      if (area && NEW_AREAS.includes(area)) groupAreas.add(area);
    }
    expect([...groupAreas].sort()).toEqual([...NEW_AREAS].sort());
  });
});
