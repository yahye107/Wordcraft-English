import { describe, it, expect } from 'vitest';
import { lintBundle } from '@/lib/content/lint';
import { coverageReport } from '@/lib/content/report';
import type { ContentBundle, ExpressionFile } from '@/lib/content/schemas';

type Expr = ExpressionFile;

/** A clean, fully-filled expression; each test breaks one thing. */
function expr(over: Partial<Expr> & { slug: string }): Expr {
  const text = over.text ?? over.slug;
  return {
    text,
    kind: 'word',
    simpleMeaning: `A short, plain meaning of ${text}.`,
    contextualMeaning: `Shows what ${text} means when someone is in a real situation.`,
    usageNotes: `Use ${text} when you want to be exact about what happened, not only general.`,
    register: 'neutral',
    level: 'intermediate',
    status: 'published',
    categories: ['area-one'],
    tags: ['emotion:calm'],
    searchPhrases: [`how to say ${text}`, `another way to say ${text}`, `${text} meaning`],
    examples: [
      { text: `She felt ${text} after the long day number one.`, setting: 'narration' },
      { text: `He said he was ${text} when they asked him in the office.`, setting: 'dialogue' },
      { text: `They were ${text} for the whole of the third evening.`, setting: 'everyday' },
    ],
    relations: [],
    mistakes: [{ wrong: `I am very ${text}ing.`, right: `I am ${text}.`, explanation: 'Use the plain form here.' }],
    ...over,
  } as Expr;
}

const bundle = (expressions: Expr[], contrasts: ContentBundle['contrasts'] = []): ContentBundle => ({
  categories: [{ slug: 'area-one', name: 'Area one', description: 'd', children: [{ slug: 'sub-one', name: 'Sub one', description: 'd' }] }],
  expressions,
  contrasts,
  lessons: [],
  exercises: [],
  prompts: [],
});

const rules = (b: ContentBundle, severity?: 'error' | 'warn') =>
  lintBundle(b)
    .filter((i) => !severity || i.severity === severity)
    .map((i) => `${i.slug}:${i.rule}`)
    .sort();

describe('lintBundle: clean content', () => {
  it('gives no issues for a clean entry that has a relation', () => {
    const a = expr({ slug: 'alpha', relations: [{ to: 'beta', type: 'synonym' }] });
    const b = expr({ slug: 'beta', relations: [{ to: 'alpha', type: 'synonym' }] });
    expect(lintBundle(bundle([a, b]))).toEqual([]);
  });
});

describe('lintBundle: errors', () => {
  const linked = (e: Expr) => ({ ...e, relations: e.relations.length ? e.relations : [{ to: 'other', type: 'related' as const }] });
  const other = expr({ slug: 'other', relations: [{ to: 'alpha', type: 'related' }] });

  it('self-relation', () => {
    const a = expr({ slug: 'alpha', relations: [{ to: 'alpha', type: 'synonym' }] });
    expect(rules(bundle([a]), 'error')).toEqual(['alpha:self-relation']);
  });

  it('mistake-same', () => {
    const a = linked(expr({ slug: 'alpha', mistakes: [{ wrong: 'Same.', right: 'Same.', explanation: 'x' }] }));
    expect(rules(bundle([a, other]), 'error')).toEqual(['alpha:mistake-same']);
  });

  it('duplicate-example: the same example text in two entries, ignoring case and spacing', () => {
    const shared = { text: 'She   felt SHARED after the long day.', setting: 'narration' as const };
    const a = linked(expr({ slug: 'alpha' }));
    a.examples = [shared, ...a.examples.slice(1)];
    const b = { ...other, examples: [{ text: 'she felt shared after the long day.', setting: 'narration' as const }, ...other.examples.slice(1)] };
    expect(rules(bundle([a, b]), 'error')).toEqual(['other:duplicate-example']);
  });

  it('duplicate-text: two expressions with the same text', () => {
    const a = linked(expr({ slug: 'alpha', text: 'Big' }));
    const b = { ...other, text: 'big' };
    expect(rules(bundle([a, b]), 'error')).toEqual(['other:duplicate-text']);
  });

  it('passes the same checks when nothing is wrong', () => {
    expect(rules(bundle([linked(expr({ slug: 'alpha' })), other]), 'error')).toEqual([]);
  });
});

describe('lintBundle: warnings', () => {
  const partner = (slug: string, to: string) => expr({ slug, relations: [{ to, type: 'related' }] });
  const warns = (a: Expr) => rules(bundle([{ ...a, relations: a.relations.length ? a.relations : [{ to: 'pal', type: 'related' }] }, partner('pal', a.slug)]), 'warn').filter((r) => r.startsWith(`${a.slug}:`));

  it('example-missing-text: no example uses the expression (patterns are exempt)', () => {
    const a = expr({ slug: 'alpha', examples: [1, 2, 3].map((n) => ({ text: `Nothing relevant here number ${n}.`, setting: n === 1 ? ('narration' as const) : ('dialogue' as const) })) });
    expect(warns(a)).toEqual(['alpha:example-missing-text']);
    expect(warns({ ...a, kind: 'pattern' })).toEqual([]);
  });

  it('example-missing-text accepts an inflected single word', () => {
    const a = expr({ slug: 'whispered', examples: [
      { text: 'She whispers to him in the quiet hall.', setting: 'narration' },
      { text: 'He was whispering the answer quickly.', setting: 'dialogue' },
      { text: 'They whispered all through the film.', setting: 'everyday' },
    ] });
    expect(warns(a)).toEqual([]);
  });

  it('few-settings', () => {
    const a = expr({ slug: 'alpha' });
    a.examples = a.examples.map((e) => ({ ...e, setting: 'narration' as const }));
    expect(warns(a)).toEqual(['alpha:few-settings']);
  });

  it('few-search-phrases, no-mistakes, no-relations, no-tags', () => {
    expect(warns(expr({ slug: 'alpha', searchPhrases: ['one', 'two'] }))).toEqual(['alpha:few-search-phrases']);
    expect(warns(expr({ slug: 'alpha', mistakes: [] }))).toEqual(['alpha:no-mistakes']);
    expect(warns(expr({ slug: 'alpha', tags: [] }))).toEqual(['alpha:no-tags']);
    expect(rules(bundle([expr({ slug: 'alpha' })]), 'warn')).toEqual(['alpha:no-relations']);
  });

  it('long-meaning: over 160 characters or more than one sentence', () => {
    expect(warns(expr({ slug: 'alpha', simpleMeaning: `A ${'long '.repeat(40)}meaning.` }))).toEqual(['alpha:long-meaning']);
    expect(warns(expr({ slug: 'alpha', simpleMeaning: 'First idea. Second idea.' }))).toEqual(['alpha:long-meaning']);
  });

  it('short-notes and hard-words', () => {
    expect(warns(expr({ slug: 'alpha', usageNotes: 'Use it well.' }))).toEqual(['alpha:short-notes']);
    expect(warns(expr({ slug: 'alpha', simpleMeaning: 'Characteristically uncomplicated, straightforwardly understandable, internationally.' }))).toEqual(['alpha:hard-words']);
  });

  it('long-sentences: explanations averaging over 25 words a sentence', () => {
    const long = Array(30).fill('word').join(' ') + '.';
    expect(warns(expr({ slug: 'alpha', usageNotes: `${long} ${long}` }))).toEqual(['alpha:long-sentences']);
  });

  it('one-way-synonym: a synonym, antonym, stronger or weaker link that is not returned', () => {
    const a = expr({ slug: 'alpha', relations: [{ to: 'beta', type: 'synonym' }, { to: 'beta', type: 'stronger' }] });
    const b = expr({ slug: 'beta', relations: [{ to: 'alpha', type: 'related' }] });
    expect(rules(bundle([a, b]), 'warn')).toEqual(['alpha:one-way-synonym', 'alpha:one-way-synonym']);
    const good = [
      expr({ slug: 'alpha', relations: [{ to: 'beta', type: 'stronger' }, { to: 'gamma', type: 'antonym' }] }),
      expr({ slug: 'beta', relations: [{ to: 'alpha', type: 'weaker' }] }),
      expr({ slug: 'gamma', relations: [{ to: 'alpha', type: 'antonym' }] }),
    ];
    expect(rules(bundle(good), 'warn')).toEqual([]);
  });

  it('group-member-example and small-group', () => {
    const a = expr({ slug: 'alpha', relations: [{ to: 'beta', type: 'related' }] });
    const b = expr({ slug: 'beta', relations: [{ to: 'alpha', type: 'related' }] });
    const c = { slug: 'g', title: 'G', explanation: 'x', members: [
      { expression: 'alpha', note: 'n', example: 'This sentence does not use it at all.' },
      { expression: 'beta', note: 'n', example: 'She felt beta about it.' },
    ] };
    const out = lintBundle(bundle([a, b], [c]));
    expect(out.filter((i) => i.kind === 'contrast').map((i) => i.rule).sort()).toEqual(['group-member-example', 'small-group']);
  });
});

describe('coverageReport', () => {
  it('is all zeros for an empty bundle, with no NaN', () => {
    const r = coverageReport(bundle([]));
    expect(r).toMatchObject({ total: 0, relationCoverage: 0, mistakesPer: 0, noGroup: [] });
    expect(r.byArea.every((a) => a.total === 0)).toBe(true);
  });

  it('counts by area (including subcategories), status and level, and finds gaps', () => {
    const a = expr({ slug: 'alpha', categories: ['sub-one'], level: 'beginner', relations: [{ to: 'beta', type: 'stronger' }] });
    const b = expr({ slug: 'beta', status: 'draft', level: 'advanced', relations: [{ to: 'alpha', type: 'related' }] });
    const c = expr({ slug: 'gamma', level: 'beginner' });
    const g = { slug: 'g', title: 'G', explanation: 'x', members: [
      { expression: 'alpha', note: 'n', example: 'e' },
      { expression: 'beta', note: 'n', example: 'e' },
    ] };
    const r = coverageReport(bundle([a, b, c], [g]));
    expect(r.total).toBe(3);
    expect(r.byStatus).toEqual({ draft: 1, published: 2 });
    expect(r.byLevel).toMatchObject({ beginner: 2, advanced: 1, intermediate: 0, literary: 0 });
    expect(r.byArea[0]).toEqual({ slug: 'area-one', name: 'Area one', published: 2, draft: 1, total: 3 });
    expect(r.relationCoverage).toBeCloseTo(1 / 3, 5); // only alpha has a stronger/weaker/antonym link
    expect(r.noGroup).toEqual(['gamma']);
    expect(r.mistakesPer).toBe(1);
  });
});
