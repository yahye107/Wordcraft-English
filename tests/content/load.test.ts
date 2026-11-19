import { describe, it, expect } from 'vitest';
import { loadContent } from '@/lib/content/load';
import { makeContentDir, CATEGORIES_YAML, expressionYaml } from './helpers';

const OK = {
  'categories.yaml': CATEGORIES_YAML,
  'expressions/sadness/crestfallen.yaml': expressionYaml(),
};

describe('loadContent', () => {
  it('loads a valid directory with no errors', () => {
    const { bundle, errors } = loadContent(makeContentDir(OK));
    expect(errors).toEqual([]);
    expect(bundle.expressions).toHaveLength(1);
    expect(bundle.categories[0].children?.[0].slug).toBe('disappointment');
  });

  it('reports the file path for malformed YAML', () => {
    const dir = makeContentDir({ ...OK, 'expressions/sadness/broken.yaml': 'slug: [unclosed' });
    const { errors } = loadContent(dir);
    expect(errors.some((e) => e.file.endsWith('broken.yaml'))).toBe(true);
  });

  it('flags a published entry with only 2 examples', () => {
    const two = expressionYaml({
      examples: [
        { text: 'One.', setting: 'everyday' },
        { text: 'Two.', setting: 'everyday' },
      ],
    });
    const { errors } = loadContent(makeContentDir({ ...OK, 'expressions/sadness/crestfallen.yaml': two }));
    expect(errors.some((e) => /examples/i.test(e.message))).toBe(true);
  });

  it('allows a draft entry with fewer than 3 examples', () => {
    const draft = expressionYaml({ status: 'draft', examples: [] });
    const { errors } = loadContent(makeContentDir({ ...OK, 'expressions/sadness/crestfallen.yaml': draft }));
    expect(errors).toEqual([]);
  });

  it('flags a duplicate slug and names both files', () => {
    const dir = makeContentDir({ ...OK, 'expressions/sadness/copy.yaml': expressionYaml() });
    const { errors } = loadContent(dir);
    const dup = errors.find((e) => /duplicate/i.test(e.message));
    expect(dup).toBeDefined();
    expect(dup!.message).toContain('crestfallen.yaml');
    expect(dup!.message).toContain('copy.yaml');
  });

  it('flags an unknown category slug', () => {
    const bad = expressionYaml({ categories: ['nonexistent'] });
    const { errors } = loadContent(makeContentDir({ ...OK, 'expressions/sadness/crestfallen.yaml': bad }));
    expect(errors.some((e) => /unknown category/i.test(e.message))).toBe(true);
  });

  it('flags a relation to a missing expression', () => {
    const bad = expressionYaml({ relations: [{ to: 'ghost', type: 'synonym' }] });
    const { errors } = loadContent(makeContentDir({ ...OK, 'expressions/sadness/crestfallen.yaml': bad }));
    expect(errors.some((e) => /unknown expression/i.test(e.message) && e.message.includes('ghost'))).toBe(true);
  });

  it('flags a contrast member that does not exist', () => {
    const contrast = JSON.stringify({
      slug: 'sad-family',
      title: 'Sad family',
      explanation: 'How they differ.',
      members: [
        { expression: 'crestfallen', note: 'n', example: 'e' },
        { expression: 'ghost', note: 'n', example: 'e' },
      ],
    });
    const { errors } = loadContent(makeContentDir({ ...OK, 'contrasts/sad-family.yaml': contrast }));
    expect(errors.some((e) => /unknown expression/i.test(e.message) && e.message.includes('ghost'))).toBe(true);
  });

  it('keeps curly quotes and em dashes unchanged', () => {
    const { bundle } = loadContent(makeContentDir(OK));
    const texts = bundle.expressions[0].examples.map((e) => e.text);
    expect(texts).toContain('He looked crestfallen—it was not the news he had hoped for.');
    expect(texts).toContain('“Don’t be so crestfallen,” she said, “there’s always next year.”');
  });

  it('rejects a tag without a kind prefix', () => {
    const bad = expressionYaml({ tags: ['disappointment'] });
    const { errors } = loadContent(makeContentDir({ ...OK, 'expressions/sadness/crestfallen.yaml': bad }));
    expect(errors.length).toBeGreaterThan(0);
  });
});
