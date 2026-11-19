import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { loadContent } from '@/lib/content/load';
import { seedContent } from '@/lib/content/seed';
import { getCategoryTree, listExpressions, getExpression, getContrastGroup } from '@/lib/content/queries';
import { makeContentDir, CATEGORIES_YAML, expressionYaml } from './helpers';

function seeded(): Db {
  const dir = makeContentDir({
    'categories.yaml': CATEGORIES_YAML,
    'expressions/sadness/crestfallen.yaml': expressionYaml({
      relations: [{ to: 'deflated', type: 'synonym', note: 'close' }],
      mistakes: [{ wrong: 'He crestfallen.', right: 'He was crestfallen.', explanation: 'Needs a verb.' }],
    }),
    'expressions/sadness/deflated.yaml': expressionYaml({
      slug: 'deflated', text: 'deflated', level: 'intermediate', register: 'conversational',
      intensity: undefined, mistakes: [], relations: [], categories: ['sadness'],
    }),
    'expressions/sadness/hidden.yaml': expressionYaml({ slug: 'hidden', text: 'hidden', status: 'draft', examples: [] }),
    'contrasts/pair.yaml': JSON.stringify({
      slug: 'pair', title: 'Crestfallen or deflated', explanation: 'Face versus energy.',
      members: [
        { expression: 'crestfallen', note: 'face', example: 'x' },
        { expression: 'deflated', note: 'energy', example: 'y' },
      ],
    }),
  });
  const { bundle, errors } = loadContent(dir);
  expect(errors).toEqual([]);
  const db = openDb(':memory:');
  migrate(db);
  seedContent(db, bundle);
  return db;
}

describe('getCategoryTree', () => {
  it('counts published expressions including descendants and nests children', () => {
    const tree = getCategoryTree(seeded());
    const sadness = tree.find((c) => c.slug === 'sadness')!;
    expect(sadness.expressionCount).toBe(2); // crestfallen (child) + deflated (self); draft excluded
    expect(sadness.children[0].slug).toBe('disappointment');
    expect(sadness.children[0].expressionCount).toBe(1);
  });
});

describe('listExpressions', () => {
  it('filters by category including descendants', () => {
    const rows = listExpressions(seeded(), { categorySlug: 'sadness' });
    expect(rows.map((r) => r.slug).sort()).toEqual(['crestfallen', 'deflated']);
  });

  it('filters by level and register', () => {
    const db = seeded();
    expect(listExpressions(db, { level: 'advanced' }).map((r) => r.slug)).toEqual(['crestfallen']);
    expect(listExpressions(db, { register: 'conversational' }).map((r) => r.slug)).toEqual(['deflated']);
  });

  it('never returns draft expressions', () => {
    expect(listExpressions(seeded(), {}).map((r) => r.slug)).not.toContain('hidden');
  });

  it('respects limit and offset', () => {
    const rows = listExpressions(seeded(), { limit: 1, offset: 1 });
    expect(rows).toHaveLength(1);
  });
});

describe('getExpression', () => {
  it('returns examples, relations, contrast groups and mistakes', () => {
    const e = getExpression(seeded(), 'crestfallen')!;
    expect(e.examples).toHaveLength(3);
    expect(e.relations[0]).toMatchObject({ slug: 'deflated', text: 'deflated', type: 'synonym' });
    expect(e.contrastGroups[0].slug).toBe('pair');
    expect(e.contrastGroups[0].members.map((m) => m.slug)).toEqual(['crestfallen', 'deflated']);
    expect(e.mistakes[0].wrong).toBe('He crestfallen.');
    expect(e.categories[0].slug).toBe('disappointment');
    expect(e.tags).toContainEqual({ kind: 'emotion', slug: 'emotion:disappointment' });
  });

  it('returns undefined for an unknown slug and for a draft', () => {
    const db = seeded();
    expect(getExpression(db, 'nope')).toBeUndefined();
    expect(getExpression(db, 'hidden')).toBeUndefined();
  });

  it('returns null intensity and empty lists when optional fields are absent', () => {
    const e = getExpression(seeded(), 'deflated')!;
    expect(e.intensity).toBeNull();
    expect(e.mistakes).toEqual([]);
    expect(e.relations).toEqual([]);
  });
});

describe('getContrastGroup', () => {
  it('returns members with their notes in order', () => {
    const g = getContrastGroup(seeded(), 'pair')!;
    expect(g.members[0]).toMatchObject({ slug: 'crestfallen', note: 'face' });
    expect(getContrastGroup(seeded(), 'nope')).toBeUndefined();
  });
});
