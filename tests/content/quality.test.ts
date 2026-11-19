import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { loadContent } from '@/lib/content/load';
import { lintBundle } from '@/lib/content/lint';

// The warning count of the library when the linter was added (starter set: 92). It may only go down: fix a
// warning, lower this number. New content is held to zero warnings by the expansion tests.
const BASELINE_WARNINGS = 92;

const { bundle, errors } = loadContent(path.resolve(__dirname, '../../content'));
const issues = lintBundle(bundle);

describe('library quality', () => {
  it('loads without schema errors', () => {
    expect(errors).toEqual([]);
  });

  it('has no lint errors', () => {
    expect(issues.filter((i) => i.severity === 'error').map((i) => `${i.kind} ${i.slug} [${i.rule}] ${i.message}`)).toEqual([]);
  });

  it('has no more lint warnings than the recorded baseline', () => {
    const warns = issues.filter((i) => i.severity === 'warn');
    expect(warns.length, 'fewer warnings is good: lower BASELINE_WARNINGS').toBeLessThanOrEqual(BASELINE_WARNINGS);
  });
});
