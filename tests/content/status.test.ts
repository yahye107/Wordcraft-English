import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { getExpression } from '@/lib/content/queries';
import { loadContent } from '@/lib/content/load';
import { indexContentFiles } from '@/lib/content/files';
import { setExpressionStatus } from '@/lib/content/status';
import { seedContent } from '@/lib/content/seed';
import { contrastYaml, library, yamlEntry } from './review-helpers';

const verdictOf = (db: ReturnType<typeof library>['db'], slug: string) =>
  db.get<{ verdict: string; fingerprint: string; note: string }>("SELECT verdict, fingerprint, note FROM content_reviews WHERE kind = 'expression' AND slug = ?", [slug]);

describe('setExpressionStatus: publishing', () => {
  it('changes only the status line, publishes into the database and records an approval', async () => {
    const lib = library({ 'expressions/sadness/alpha.yaml': yamlEntry({ slug: 'alpha', status: 'draft' }) });
    const before = lib.read('expressions/sadness/alpha.yaml');
    expect(getExpression(lib.db, 'alpha')).toBeUndefined();

    const r = await setExpressionStatus(lib.db, lib.dir, 'alpha', 'published');
    expect(r).toEqual({ ok: true, status: 'published' });
    expect(lib.read('expressions/sadness/alpha.yaml')).toBe(before.replace('status: draft', 'status: published'));
    expect(getExpression(lib.db, 'alpha')?.slug).toBe('alpha');

    const v = verdictOf(lib.db, 'alpha')!;
    expect(v.verdict).toBe('approved');
    expect(v.fingerprint).toBe(indexContentFiles(lib.dir).items[0].fingerprint);
  });

  it('keeps CRLF line endings and changes nothing else', async () => {
    const lib = library({ 'expressions/sadness/alpha.yaml': yamlEntry({ slug: 'alpha', status: 'draft', eol: '\r\n' }) });
    const before = lib.read('expressions/sadness/alpha.yaml');
    await setExpressionStatus(lib.db, lib.dir, 'alpha', 'published');
    const after = lib.read('expressions/sadness/alpha.yaml');
    expect(after).toBe(before.replace('status: draft', 'status: published'));
    expect(after.match(/\r\n/g)?.length).toBe(before.match(/\r\n/g)?.length);
    expect(after.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('keeps an existing note on the approval', async () => {
    const lib = library({ 'expressions/sadness/alpha.yaml': yamlEntry({ slug: 'alpha', status: 'draft' }) });
    lib.db.run("INSERT INTO content_reviews (kind, slug, verdict, note, fingerprint) VALUES ('expression', 'alpha', 'needs-work', 'check the second example', 'old')");
    await setExpressionStatus(lib.db, lib.dir, 'alpha', 'published');
    expect(verdictOf(lib.db, 'alpha')).toMatchObject({ verdict: 'approved', note: 'check the second example' });
  });

  it('refuses a draft with fewer than 3 examples and leaves the bytes unchanged', async () => {
    const lib = library({ 'expressions/sadness/short.yaml': yamlEntry({ slug: 'short', status: 'draft', examples: 2 }) });
    const before = lib.read('expressions/sadness/short.yaml');
    const r = await setExpressionStatus(lib.db, lib.dir, 'short', 'published');
    expect(r).toMatchObject({ ok: false, status: 409 });
    if (!r.ok) expect(r.error).toMatch(/at least 3 examples/);
    expect(lib.read('expressions/sadness/short.yaml')).toBe(before);
    expect(getExpression(lib.db, 'short')).toBeUndefined();
    expect(verdictOf(lib.db, 'short')).toBeUndefined();
  });

  it('is a no-op when the entry already has that status', async () => {
    const lib = library({ 'expressions/sadness/alpha.yaml': yamlEntry({ slug: 'alpha', status: 'published' }) });
    const before = lib.read('expressions/sadness/alpha.yaml');
    expect(await setExpressionStatus(lib.db, lib.dir, 'alpha', 'published')).toEqual({ ok: true, status: 'published' });
    expect(lib.read('expressions/sadness/alpha.yaml')).toBe(before);
  });
});

describe('setExpressionStatus: moving back to draft', () => {
  it('hides the entry, keeps the verdict, and the fingerprint is unchanged', async () => {
    const lib = library({ 'expressions/sadness/alpha.yaml': yamlEntry({ slug: 'alpha', status: 'draft' }) });
    await setExpressionStatus(lib.db, lib.dir, 'alpha', 'published');
    const v1 = verdictOf(lib.db, 'alpha')!;
    const r = await setExpressionStatus(lib.db, lib.dir, 'alpha', 'draft');
    expect(r).toEqual({ ok: true, status: 'draft' });
    expect(getExpression(lib.db, 'alpha')).toBeUndefined();
    expect(verdictOf(lib.db, 'alpha')).toEqual(v1);
    expect(indexContentFiles(lib.dir).items[0].fingerprint).toBe(v1.fingerprint);
  });

  it('inserts a status line after level when the file has none', async () => {
    const lib = library({ 'expressions/sadness/alpha.yaml': yamlEntry({ slug: 'alpha', status: null }) });
    const before = lib.read('expressions/sadness/alpha.yaml');
    await setExpressionStatus(lib.db, lib.dir, 'alpha', 'draft');
    expect(lib.read('expressions/sadness/alpha.yaml')).toBe(before.replace('level: intermediate\n', 'level: intermediate\nstatus: draft\n'));
    expect(loadContent(lib.dir).bundle.expressions[0].status).toBe('draft');
  });
});

describe('setExpressionStatus: safety', () => {
  const untouched = (lib: ReturnType<typeof library>, before: string) => expect(lib.read('expressions/sadness/alpha.yaml')).toBe(before);

  it('refuses bad slugs and statuses without touching any file', async () => {
    const lib = library({
      'expressions/sadness/alpha.yaml': yamlEntry({ slug: 'alpha', status: 'draft' }),
      'expressions/sadness/beta.yaml': yamlEntry({ slug: 'beta', status: 'published' }),
      'contrasts/pair.yaml': contrastYaml('pair', ['alpha', 'beta']),
    });
    const before = lib.read('expressions/sadness/alpha.yaml');
    for (const slug of ['../x', '../../package', 'Alpha', 'ALPHA', '', 'a/b', 'a\\b', undefined, null, 5, {}]) {
      const r = await setExpressionStatus(lib.db, lib.dir, slug, 'published');
      expect(r.ok, String(slug)).toBe(false);
    }
    expect(await setExpressionStatus(lib.db, lib.dir, 'alpha', 'archived')).toMatchObject({ ok: false, status: 400 });
    expect(await setExpressionStatus(lib.db, lib.dir, 'missing', 'published')).toMatchObject({ ok: false, status: 404 });
    expect(await setExpressionStatus(lib.db, lib.dir, 'pair', 'published')).toMatchObject({ ok: false, status: 404 }); // a contrast group, not an expression
    untouched(lib, before);
  });

  it('refuses while the library already has a content error', async () => {
    const lib = library({ 'expressions/sadness/alpha.yaml': yamlEntry({ slug: 'alpha', status: 'draft' }) });
    fs.writeFileSync(lib.file('expressions/sadness/broken.yaml'), yamlEntry({ slug: 'broken', status: 'published', examples: 1 }));
    const before = lib.read('expressions/sadness/alpha.yaml');
    const r = await setExpressionStatus(lib.db, lib.dir, 'alpha', 'published');
    expect(r).toMatchObject({ ok: false, status: 409 });
    if (!r.ok) expect(r.error).toMatch(/Fix these content errors first/);
    untouched(lib, before);
  });

  it('refuses a file written as JSON instead of guessing', async () => {
    const json = JSON.stringify({ slug: 'alpha', text: 'alpha', status: 'draft' });
    const lib = library({ 'expressions/sadness/alpha.yaml': yamlEntry({ slug: 'alpha', status: 'draft' }) });
    fs.writeFileSync(lib.file('expressions/sadness/alpha.yaml'), json);
    const r = await setExpressionStatus(lib.db, lib.dir, 'alpha', 'published');
    expect(r.ok).toBe(false);
    expect(lib.read('expressions/sadness/alpha.yaml')).toBe(json);
  });

  it('restores the file when the reseed fails', async () => {
    const lib = library({ 'expressions/sadness/alpha.yaml': yamlEntry({ slug: 'alpha', status: 'draft' }) });
    const before = lib.read('expressions/sadness/alpha.yaml');
    let calls = 0;
    const flaky: typeof seedContent = (db, bundle) => {
      calls++;
      if (calls === 1) throw new Error('disk full');
      return seedContent(db, bundle);
    };
    const r = await setExpressionStatus(lib.db, lib.dir, 'alpha', 'published', { seed: flaky });
    expect(r).toMatchObject({ ok: false, status: 500 });
    expect(lib.read('expressions/sadness/alpha.yaml')).toBe(before);
    expect(calls).toBe(2); // it tried to put the database back in step with the restored file
    expect(getExpression(lib.db, 'alpha')).toBeUndefined();
    expect(verdictOf(lib.db, 'alpha')).toBeUndefined();
  });

  it('runs concurrent changes one at a time and ends with a valid library', async () => {
    const lib = library({
      'expressions/sadness/alpha.yaml': yamlEntry({ slug: 'alpha', status: 'draft' }),
      'expressions/sadness/beta.yaml': yamlEntry({ slug: 'beta', status: 'draft' }),
    });
    const results = await Promise.all([
      setExpressionStatus(lib.db, lib.dir, 'alpha', 'published'),
      setExpressionStatus(lib.db, lib.dir, 'beta', 'published'),
      setExpressionStatus(lib.db, lib.dir, 'alpha', 'draft'),
      setExpressionStatus(lib.db, lib.dir, 'beta', 'draft'),
      setExpressionStatus(lib.db, lib.dir, 'alpha', 'published'),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    const { bundle, errors } = loadContent(lib.dir);
    expect(errors).toEqual([]);
    const status = Object.fromEntries(bundle.expressions.map((e) => [e.slug, e.status]));
    expect(status).toEqual({ alpha: 'published', beta: 'draft' });
    expect(Boolean(getExpression(lib.db, 'alpha'))).toBe(true);
    expect(Boolean(getExpression(lib.db, 'beta'))).toBe(false);
  });
});
