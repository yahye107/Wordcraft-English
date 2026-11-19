import { describe, it, expect } from 'vitest';
import { getCategory, getCategoryTree, getExpression, getContrastGroup } from '@/lib/content/queries';
import { getAreaCoverage } from '@/lib/content/review';
import { contrastYaml, library, yamlEntry } from './review-helpers';

const lib = () =>
  library({
    'expressions/sadness/live.yaml': yamlEntry({ slug: 'live', status: 'published', relations: [{ to: 'ghost', type: 'synonym' }, { to: 'friend', type: 'related' }] }),
    'expressions/sadness/friend.yaml': yamlEntry({ slug: 'friend', status: 'published' }),
    'expressions/sadness/ghost.yaml': yamlEntry({ slug: 'ghost', status: 'draft', relations: [{ to: 'live', type: 'synonym' }] }),
    'contrasts/trio.yaml': contrastYaml('trio', ['live', 'friend', 'ghost']),
    'contrasts/duo.yaml': contrastYaml('duo', ['live', 'ghost']),
  });

describe('getExpression with includeDraft (the review preview)', () => {
  const { db } = lib();

  it('is unchanged for learners', () => {
    expect(getExpression(db, 'ghost')).toBeUndefined();
    const live = getExpression(db, 'live')!;
    expect(live.status).toBe('published');
    expect(live.relations.map((r) => [r.slug, r.draft])).toEqual([['friend', false]]);
    expect(live.contrastGroups.map((g) => g.slug)).toEqual(['trio']);
    expect(live.contrastGroups[0].members.map((m) => [m.slug, m.draft])).toEqual([['live', false], ['friend', false]]);
  });

  it('returns a draft, with draft neighbours flagged', () => {
    const ghost = getExpression(db, 'ghost', { includeDraft: true })!;
    expect(ghost).toMatchObject({ slug: 'ghost', status: 'draft' });
    expect(ghost.relations.map((r) => [r.slug, r.draft])).toEqual([['live', false]]);
    const live = getExpression(db, 'live', { includeDraft: true })!;
    expect(live.relations.map((r) => [r.slug, r.draft])).toEqual([['ghost', true], ['friend', false]]);
    expect(live.contrastGroups.map((g) => g.slug).sort()).toEqual(['duo', 'trio']);
    expect(live.contrastGroups.find((g) => g.slug === 'trio')!.members.map((m) => [m.slug, m.draft])).toEqual([['live', false], ['friend', false], ['ghost', true]]);
  });

  it('shows a group in the preview that learners cannot see yet', () => {
    expect(getContrastGroup(db, 'duo')).toBeUndefined();
    expect(getContrastGroup(db, 'duo', { includeDraft: true })?.members).toHaveLength(2);
    expect(getContrastGroup(db, 'missing', { includeDraft: true })).toBeUndefined();
  });
});

describe('getAreaCoverage', () => {
  it('counts published and draft entries per top-level area, including subcategories', () => {
    const { db } = lib();
    expect(getAreaCoverage(db)).toEqual([{ slug: 'sadness', name: 'Sadness', published: 2, draft: 1, total: 3 }]);
  });

  it('is empty for an empty library', () => {
    expect(getAreaCoverage(library({}).db)).toEqual([{ slug: 'sadness', name: 'Sadness', published: 0, draft: 0, total: 0 }]);
  });
});

describe('categories with nothing a learner can see', () => {
  const CATEGORIES = `categories:
  - slug: sadness
    name: Sadness
    description: Feelings of loss.
    children:
      - slug: disappointment
        name: Disappointment
        description: When hopes are not met.
      - slug: loneliness
        name: Loneliness
        description: Being alone.
  - slug: ghosts
    name: Ghosts
    description: Things that haunt.
    children:
      - slug: haunting
        name: Haunting
        description: Ghostly goings-on.
`;
  const lib = () =>
    library({
      'categories.yaml': CATEGORIES,
      'expressions/sadness/live.yaml': yamlEntry({ slug: 'live', status: 'published' }),
      'expressions/ghosts/ghost.yaml': yamlEntry({ slug: 'ghost', status: 'draft' }).replace('  - disappointment', '  - haunting'),
    });

  it('are left out of the explore tree, top level and sub level', () => {
    const { db } = lib();
    const tree = getCategoryTree(db);
    expect(tree.map((c) => c.slug)).toEqual(['sadness']);
    expect(tree[0].children.map((c) => c.slug)).toEqual(['disappointment']);
  });

  it('have no category page for learners, and drop out of a visible parent’s subcategory list', () => {
    const { db } = lib();
    expect(getCategory(db, 'ghosts')).toBeUndefined();
    expect(getCategory(db, 'haunting')).toBeUndefined();
    expect(getCategory(db, 'sadness')!.children.map((c) => c.slug)).toEqual(['disappointment']);
  });

  it('show up again, as a category, once an entry is published', () => {
    const { db } = lib();
    db.run("UPDATE expressions SET status = 'published' WHERE slug = 'ghost'");
    expect(getCategoryTree(db).map((c) => c.slug)).toEqual(['sadness', 'ghosts']);
    expect(getCategory(db, 'haunting')?.slug).toBe('haunting');
  });
});
