import { describe, it, expect } from 'vitest';
import { handleVerdict, handleStatus } from '@/lib/content/handlers';
import { sameOrigin } from '@/lib/content/origin';
import { library, yamlEntry } from './review-helpers';

const files = () => ({
  'expressions/sadness/alpha.yaml': yamlEntry({ slug: 'alpha', status: 'draft' }),
  'expressions/sadness/short.yaml': yamlEntry({ slug: 'short', status: 'draft', examples: 2 }),
});

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('http://localhost:3000/api/content/x', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', Host: 'localhost:3000', ...headers },
  });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const json = async (r: Response) => (await r.json()) as Record<string, any>;

describe('sameOrigin', () => {
  const req = (h: Record<string, string>) => new Request('http://localhost:3000/api/x', { method: 'POST', headers: h });
  it('allows requests with no origin headers (tools and tests)', () => expect(sameOrigin(req({}))).toBe(true));
  it('allows the same host', () => expect(sameOrigin(req({ Origin: 'http://localhost:3000' }))).toBe(true));
  it('refuses another host', () => {
    expect(sameOrigin(req({ Origin: 'http://evil.example' }))).toBe(false);
    expect(sameOrigin(req({ Origin: 'http://localhost:3001' }))).toBe(false);
    expect(sameOrigin(req({ Origin: 'null' }))).toBe(false);
  });
  it('refuses a cross-site fetch even without an Origin', () => {
    expect(sameOrigin(req({ 'Sec-Fetch-Site': 'cross-site' }))).toBe(false);
    expect(sameOrigin(req({ 'Sec-Fetch-Site': 'same-origin' }))).toBe(true);
  });
});

describe('handleVerdict', () => {
  it('saves a verdict', async () => {
    const lib = library(files());
    const r = await handleVerdict(lib.db, lib.dir, post({ kind: 'expression', slug: 'alpha', verdict: 'needs-work', note: 'fix it' }));
    expect(r.status).toBe(200);
    expect(await json(r)).toEqual({ ok: true });
  });

  it('answers 400, 403, 404 and 413', async () => {
    const lib = library(files());
    expect((await handleVerdict(lib.db, lib.dir, post('not json {'))).status).toBe(400);
    expect((await handleVerdict(lib.db, lib.dir, post('[1]'))).status).toBe(400);
    expect((await handleVerdict(lib.db, lib.dir, post({ kind: 'expression', slug: 'alpha', verdict: 'needs-work' }))).status).toBe(400);
    expect((await handleVerdict(lib.db, lib.dir, post({ kind: 'expression', slug: 'nope', verdict: 'approved' }))).status).toBe(404);
    expect((await handleVerdict(lib.db, lib.dir, post({ kind: 'expression', slug: 'alpha', verdict: 'approved' }, { Origin: 'http://evil.example' }))).status).toBe(403);
    expect((await handleVerdict(lib.db, lib.dir, post({ note: 'x'.repeat(30_000) }))).status).toBe(413);
    expect(lib.db.get<{ n: number }>('SELECT COUNT(*) n FROM content_reviews')!.n).toBe(0);
  });
});

describe('handleStatus', () => {
  it('publishes and moves back to draft', async () => {
    const lib = library(files());
    const up = await handleStatus(lib.db, lib.dir, post({ slug: 'alpha', status: 'published' }));
    expect(up.status).toBe(200);
    expect(await json(up)).toEqual({ ok: true, status: 'published' });
    expect(lib.read('expressions/sadness/alpha.yaml')).toContain('status: published');
    const down = await handleStatus(lib.db, lib.dir, post({ slug: 'alpha', status: 'draft' }));
    expect((await json(down)).status).toBe('draft');
  });

  it('answers 400, 403, 404, 409 and 413 and leaves the file alone', async () => {
    const lib = library(files());
    const before = lib.read('expressions/sadness/alpha.yaml');
    expect((await handleStatus(lib.db, lib.dir, post('nope'))).status).toBe(400);
    expect((await handleStatus(lib.db, lib.dir, post({ slug: 'alpha', status: 'archived' }))).status).toBe(400);
    expect((await handleStatus(lib.db, lib.dir, post({ slug: '../alpha', status: 'published' }))).status).toBe(400);
    expect((await handleStatus(lib.db, lib.dir, post({ slug: 'missing', status: 'published' }))).status).toBe(404);
    expect((await handleStatus(lib.db, lib.dir, post({ slug: 'alpha', status: 'published' }, { 'Sec-Fetch-Site': 'cross-site' }))).status).toBe(403);
    const short = await handleStatus(lib.db, lib.dir, post({ slug: 'short', status: 'published' }));
    expect(short.status).toBe(409);
    expect((await json(short)).error).toMatch(/3 examples/);
    expect((await handleStatus(lib.db, lib.dir, post({ slug: 'x'.repeat(30_000), status: 'published' }))).status).toBe(413);
    expect(lib.read('expressions/sadness/alpha.yaml')).toBe(before);
  });
});
