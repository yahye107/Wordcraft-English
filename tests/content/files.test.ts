import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '@/lib/db';
import { migrate } from '@/lib/db/migrate';
import { loadContent } from '@/lib/content/load';
import { indexContentFiles, fingerprintOf } from '@/lib/content/files';
import { makeContentDir, CATEGORIES_YAML, expressionYaml } from './helpers';

const yamlExpr = (slug: string, extra = '') => `slug: ${slug}\ntext: ${slug}\nlevel: beginner\n${extra}examples: []\n`;

describe('indexContentFiles', () => {
  it('finds kind, slug, status and a 40-character fingerprint for each file', () => {
    const dir = makeContentDir({
      'expressions/a/one.yaml': yamlExpr('one', 'status: draft\n'),
      'expressions/a/two.yaml': yamlExpr('two', 'status: published\n'),
      'expressions/b/three.yaml': yamlExpr('three'), // no status line: published by default
      'contrasts/pair.yaml': 'slug: pair\ntitle: Pair\n',
      'lessons/dialogue/tags.yaml': 'slug: tags\nlab: dialogue\n',
      'prompts/situation/bus.yaml': 'slug: bus\nmode: situation\n',
    });
    const { items, problems } = indexContentFiles(dir);
    expect(problems).toEqual([]);
    expect(items.map((i) => [i.kind, i.slug, i.status])).toEqual([
      ['expression', 'one', 'draft'],
      ['expression', 'three', 'published'],
      ['expression', 'two', 'published'],
      ['contrast', 'pair', null],
      ['lesson', 'tags', null],
      ['prompt', 'bus', null],
    ]);
    expect(items[0].file).toBe('expressions/a/one.yaml');
    expect(items.every((i) => /^[0-9a-f]{40}$/.test(i.fingerprint))).toBe(true);
  });

  it('reads quoted slugs and statuses, trailing comments, and ignores nested slug lines', () => {
    const dir = makeContentDir({
      'expressions/a/q.yaml': 'slug: "quoted"   # a comment\nstatus: \'draft\'\nrelations:\n  - slug: other\n',
    });
    const { items } = indexContentFiles(dir);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ slug: 'quoted', status: 'draft' });
  });

  it('reads a file written as one line of JSON', () => {
    const dir = makeContentDir({ 'expressions/a/j.yaml': expressionYaml({ slug: 'jay', text: 'jay', status: 'draft' }) });
    expect(indexContentFiles(dir).items[0]).toMatchObject({ slug: 'jay', status: 'draft' });
  });

  it('gives a CRLF copy the same fingerprint and changes it for a one-word edit', () => {
    const text = yamlExpr('same', 'simpleMeaning: One thing.\n');
    const lf = makeContentDir({ 'expressions/a/same.yaml': text });
    const crlf = makeContentDir({ 'expressions/a/same.yaml': text.replace(/\n/g, '\r\n') });
    const edited = makeContentDir({ 'expressions/a/same.yaml': text.replace('One', 'Two') });
    const f = (d: string) => indexContentFiles(d).items[0].fingerprint;
    expect(f(crlf)).toBe(f(lf));
    expect(f(edited)).not.toBe(f(lf));
    expect(fingerprintOf('a\r\nb')).toBe(fingerprintOf('a\nb'));
  });

  it('reports a missing slug, a duplicate slug and invalid YAML as problems, not items', () => {
    const dir = makeContentDir({
      'expressions/a/noslug.yaml': 'text: hello\n',
      'expressions/a/dup1.yaml': yamlExpr('dup'),
      'expressions/b/dup2.yaml': yamlExpr('dup'),
      'expressions/a/bad.yaml': 'slug: [unclosed\n  - : :\n',
    });
    const { items, problems } = indexContentFiles(dir);
    expect(items.map((i) => i.slug)).toEqual(['dup']);
    expect(problems.map((p) => p.file).sort()).toEqual(['expressions/a/bad.yaml', 'expressions/a/noslug.yaml', 'expressions/b/dup2.yaml']);
  });

  it('allows the same slug in different kinds', () => {
    const dir = makeContentDir({ 'expressions/a/x.yaml': yamlExpr('x'), 'contrasts/x.yaml': 'slug: x\ntitle: X\n' });
    expect(indexContentFiles(dir).items.map((i) => i.kind)).toEqual(['expression', 'contrast']);
  });

  it('gives empty results for a missing directory', () => {
    expect(indexContentFiles(path.join(makeContentDir({}), 'nope'))).toEqual({ items: [], problems: [] });
  });

  it('matches loadContent on the real library and is fast', () => {
    const dir = path.resolve(__dirname, '../../content');
    const t0 = performance.now();
    const { items, problems } = indexContentFiles(dir);
    const ms = performance.now() - t0;
    const { bundle } = loadContent(dir);
    const count = (k: string) => items.filter((i) => i.kind === k).length;
    expect(problems).toEqual([]);
    expect(count('expression')).toBe(bundle.expressions.length);
    expect(count('contrast')).toBe(bundle.contrasts.length);
    expect(count('lesson')).toBe(bundle.lessons.length);
    expect(count('prompt')).toBe(bundle.prompts.length);
    expect(ms).toBeLessThan(1500); // about 100 ms on its own; the margin is for a busy machine
    // Every status the index reports matches the loaded bundle.
    const status = new Map(bundle.expressions.map((e) => [e.slug, e.status]));
    for (const i of items.filter((x) => x.kind === 'expression')) expect(i.status).toBe(status.get(i.slug));
    expect(fs.existsSync(path.join(dir, items[0].file))).toBe(true);
  });
});

describe('migration 10 (content_reviews)', () => {
  it('creates the table and rejects an unknown verdict', () => {
    const db = openDb(':memory:');
    migrate(db);
    db.run("INSERT INTO content_reviews (kind, slug, verdict, fingerprint) VALUES ('expression', 'a', 'approved', 'f')");
    expect(() => db.run("INSERT INTO content_reviews (kind, slug, verdict, fingerprint) VALUES ('expression', 'b', 'maybe', 'f')")).toThrow();
    expect(() => db.run("INSERT INTO content_reviews (kind, slug, verdict, fingerprint) VALUES ('expression', 'a', 'needs-work', 'g')")).toThrow(); // one verdict per item
    db.run("INSERT INTO content_reviews (kind, slug, verdict, fingerprint) VALUES ('contrast', 'a', 'needs-work', 'g')"); // another kind is fine
  });
});

// Keep the helper import used even if the categories fixture changes.
void CATEGORIES_YAML;
