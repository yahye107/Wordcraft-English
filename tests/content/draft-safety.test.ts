import { describe, it, expect } from 'vitest';
import { openDb, type Db } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { loadContent } from '@/lib/content/load';
import { seedContent } from '@/lib/content/seed';
import { getCategoryTree, listExpressions, getExpression, getContrastGroup } from '@/lib/content/queries';
import { parseQuery } from '@/lib/search/parse';
import { searchExpressions } from '@/lib/search/search';
import { getLesson } from '@/lib/lessons/queries';
import { getPrompt } from '@/lib/writing/prompts';
import { findAlternatives } from '@/lib/writing/vocab';
import { importNotes } from '@/lib/notebook/importer';
import { saveFromLibrary, getEntry } from '@/lib/notebook/entries';
import { getDueCards } from '@/lib/notebook/review';
import { findExpressionsIn } from '@/lib/text/match';
import { analyseLocalPassage } from '@/lib/novel/local';
import { makeContentDir, CATEGORIES_YAML, expressionYaml } from './helpers';
import { lessonYaml } from './lesson-helpers';

const GHOST = 'ghost-draft';

const promptYaml = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    slug: 'late-train',
    mode: 'situation',
    kind: 'scene',
    title: 'The late train',
    situation: 'You are standing on a cold platform. The train is forty minutes late and nobody has said why.',
    constraints: ['Use at least one sensory detail.'],
    try: ['crestfallen'],
    level: 'intermediate',
    ...over,
  });

const files = (ghostStatus: 'draft' | 'published') => ({
  'categories.yaml': CATEGORIES_YAML,
  'expressions/sadness/crestfallen.yaml': expressionYaml({
    slug: 'crestfallen',
    text: 'crestfallen',
    relations: [{ to: GHOST, type: 'synonym' }],
  }),
  'expressions/sadness/deflated.yaml': expressionYaml({ slug: 'deflated', text: 'deflated', searchPhrases: ['lost his spark'], relations: [] }),
  'expressions/sadness/heartbroken.yaml': expressionYaml({ slug: 'heartbroken', text: 'heartbroken', searchPhrases: ['broken heart'], relations: [] }),
  'expressions/sadness/ghost-draft.yaml': expressionYaml({
    slug: GHOST,
    text: 'spectral',
    status: ghostStatus,
    searchPhrases: ['haunting whisper of sorrow', 'sad ghostly feeling'],
    tags: ['emotion:disappointment'],
    relations: [{ to: 'crestfallen', type: 'synonym' }],
    examples: [
      { text: 'A spectral hush fell over the room.', setting: 'narration' },
      { text: 'Her voice was spectral and thin.', setting: 'narration' },
      { text: 'The spectral light faded at dawn.', setting: 'narration' },
    ],
  }),
  'contrasts/trio.yaml': JSON.stringify({
    slug: 'trio',
    title: 'Trio',
    explanation: 'x',
    members: [
      { expression: 'crestfallen', note: 'a', example: 'He looked crestfallen.' },
      { expression: 'deflated', note: 'b', example: 'He felt deflated.' },
      { expression: GHOST, note: 'c', example: 'A spectral hush.' },
    ],
  }),
  'contrasts/duo.yaml': JSON.stringify({
    slug: 'duo',
    title: 'Duo',
    explanation: 'x',
    members: [
      { expression: 'crestfallen', note: 'a', example: 'He looked crestfallen.' },
      { expression: GHOST, note: 'c', example: 'A spectral hush.' },
    ],
  }),
  'lessons/dialogue/what-tags-do.yaml': lessonYaml({ related: ['crestfallen', GHOST] }),
  'prompts/situation/late-train.yaml': promptYaml({ try: ['crestfallen', GHOST] }),
});

function build(ghostStatus: 'draft' | 'published', db?: Db): Db {
  const { bundle, errors } = loadContent(makeContentDir(files(ghostStatus)));
  expect(errors).toEqual([]);
  const d = db ?? openDb(':memory:');
  if (!db) migrate(d);
  seedContent(d, bundle);
  return d;
}

describe('a draft expression never reaches a learner', () => {
  const db = build('draft');

  it('is not counted or listed in categories', () => {
    const sadness = getCategoryTree(db)[0];
    expect(sadness.children[0].expressionCount).toBe(3);
    expect(listExpressions(db, { categorySlug: 'disappointment' }).map((e) => e.slug)).not.toContain(GHOST);
    expect(listExpressions(db).map((e) => e.slug)).not.toContain(GHOST);
  });

  it('is not found by search, by text, phrase, tag or full-text only words', () => {
    for (const q of ['spectral', 'haunting whisper of sorrow', 'sad ghostly feeling', 'ghostly', 'hush', 'ways to show disappointment']) {
      expect(searchExpressions(db, parseQuery(q)).map((r) => r.slug), q).not.toContain(GHOST);
    }
  });

  it('has no page, and is hidden from relations and contrast groups on other pages', () => {
    expect(getExpression(db, GHOST)).toBeUndefined();
    const c = getExpression(db, 'crestfallen')!;
    expect(c.relations.map((r) => r.slug)).not.toContain(GHOST);
    const trio = c.contrastGroups.find((g) => g.slug === 'trio')!;
    expect(trio.members.map((m) => m.slug)).toEqual(['crestfallen', 'deflated']);
    expect(getContrastGroup(db, 'trio')!.members.map((m) => m.slug)).not.toContain(GHOST);
  });

  it('hides a contrast group that has fewer than 2 published members', () => {
    const c = getExpression(db, 'crestfallen')!;
    expect(c.contrastGroups.map((g) => g.slug)).toEqual(['trio']); // "duo" has one published member
  });

  it('is left out of lesson related words and prompt try-words', () => {
    expect(getLesson(db, 'what-tags-do')!.related.map((r) => r.slug)).toEqual(['crestfallen']);
    expect(getPrompt(db, 'late-train')!.try.map((t) => t.slug)).toEqual(['crestfallen']);
  });

  it('cannot be saved to the notebook by slug', () => {
    expect(saveFromLibrary(db, GHOST)).toBeUndefined();
  });

  it('is not offered by the vocabulary finder', () => {
    for (const word of ['sad', 'spectral', 'ghostly']) {
      const r = findAlternatives(db, word);
      const slugs = [...r.groups.flatMap((g) => g.items), ...r.loose].map((i) => i.slug);
      expect(slugs, word).not.toContain(GHOST);
    }
  });

  it('is not linked by the importer', () => {
    importNotes(db, [{ text: 'spectral', meaning: 'ghostlike', source: null }]);
    const row = db.get<{ expression_slug: string | null }>("SELECT expression_slug FROM notebook_entries WHERE text = 'spectral'");
    expect(row?.expression_slug).toBeNull();
  });

  it('is not matched in a passage or in writing', () => {
    expect(findExpressionsIn(db, 'A spectral hush fell.').map((m) => m.slug)).not.toContain(GHOST);
    expect(analyseLocalPassage(db, 'A spectral hush fell.').vocabulary.map((v) => v.slug)).not.toContain(GHOST);
  });
});

describe('a published expression that goes back to draft', () => {
  it('keeps the notebook entry but shows no library data for it', () => {
    const db = build('published');
    expect(getExpression(db, GHOST)).toBeDefined();
    const saved = saveFromLibrary(db, GHOST, new Date('2026-11-20T10:00:00Z'))!;
    expect(saved.entry.library?.slug).toBe(GHOST);

    build('draft', db); // the same database, reseeded with the entry back as a draft
    const entry = getEntry(db, saved.entry.id)!;
    expect(entry.text).toBe('spectral');
    expect(entry.library).toBeNull();
    const due = getDueCards(db, new Date('2026-11-21T10:00:00Z')).find((c) => c.entryId === saved.entry.id);
    expect(due?.library).toBeNull();
  });
});
