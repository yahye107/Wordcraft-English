import type { CategoryNode, ContentBundle } from './schemas';

export type AreaCount = { slug: string; name: string; published: number; draft: number; total: number };

export type CoverageReport = {
  total: number;
  byStatus: { draft: number; published: number };
  byLevel: Record<'beginner' | 'intermediate' | 'advanced' | 'literary', number>;
  byArea: AreaCount[];
  /** Share of expressions with at least one antonym, stronger or weaker link, from 0 to 1. */
  relationCoverage: number;
  /** Expressions that are in no contrast group. */
  noGroup: string[];
  mistakesPer: number;
};

/** Map every category slug (including subcategories) to its top-level area slug. */
function areaOf(nodes: CategoryNode[]): Map<string, string> {
  const map = new Map<string, string>();
  const visit = (n: CategoryNode, top: string) => {
    map.set(n.slug, top);
    for (const c of n.children ?? []) visit(c, top);
  };
  for (const n of nodes) visit(n, n.slug);
  return map;
}

/** Counts that show where the library is thin. Pure; an empty library gives zeros, never NaN. */
export function coverageReport(bundle: ContentBundle): CoverageReport {
  const area = areaOf(bundle.categories);
  const byArea: AreaCount[] = bundle.categories.map((c) => ({ slug: c.slug, name: c.name, published: 0, draft: 0, total: 0 }));
  const index = new Map(byArea.map((a) => [a.slug, a]));
  const byLevel = { beginner: 0, intermediate: 0, advanced: 0, literary: 0 };
  const byStatus = { draft: 0, published: 0 };
  let linked = 0;
  let mistakes = 0;

  for (const e of bundle.expressions) {
    byLevel[e.level]++;
    byStatus[e.status]++;
    mistakes += e.mistakes.length;
    if (e.relations.some((r) => r.type === 'antonym' || r.type === 'stronger' || r.type === 'weaker')) linked++;
    const top = index.get(area.get(e.categories[0]) ?? '');
    if (top) {
      top[e.status]++;
      top.total++;
    }
  }

  const grouped = new Set(bundle.contrasts.flatMap((c) => c.members.map((m) => m.expression)));
  const total = bundle.expressions.length;
  return {
    total,
    byStatus,
    byLevel,
    byArea,
    relationCoverage: total > 0 ? linked / total : 0,
    noGroup: bundle.expressions.filter((e) => !grouped.has(e.slug)).map((e) => e.slug),
    mistakesPer: total > 0 ? mistakes / total : 0,
  };
}
