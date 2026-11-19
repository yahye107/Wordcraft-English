import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// The server runs on a copy of the content (data/e2e-content), so approving and un-publishing here never touches the
// real files. The desktop and phone projects share that copy, so each uses its own drafts and puts them back.
const SLUGS = {
  desktop: { publish: 'tiptoed', note: 'torn', key: 'limped', short: 'wept' },
  phone: { publish: 'shuffled', note: 'numb', key: 'wondered', short: 'sobbed' },
} as const;
const pick = (project: string) => (project === 'desktop' ? SLUGS.desktop : SLUGS.phone);

async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

const status = (request: APIRequestContext, slug: string, to: 'draft' | 'published') =>
  request.post('/api/content/status', { data: { slug, status: to } });

function fileFor(slug: string): string {
  const root = path.resolve('data/e2e-content/expressions');
  const find = (d: string): string | undefined => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        const hit = find(p);
        if (hit) return hit;
      } else if (e.name === `${slug}.yaml`) return p;
    }
    return undefined;
  };
  const found = find(root);
  if (!found) throw new Error(`no content file for ${slug}`);
  return found;
}

const reviewUrl = (slug: string) => `/content/expression/${slug}?state=draft&kind=expression`;

test.describe.serial('library review', () => {
  test('the review page counts the drafts and lists them first', async ({ page }) => {
    await open(page, '/content');
    await expect(page.getByRole('heading', { level: 1, name: 'Library review' })).toBeVisible();
    const draftTile = page.getByTestId('tile-draft');
    await expect(draftTile).toHaveAttribute('aria-current', 'true');
    const n = Number((await draftTile.locator('.review-count').textContent()) ?? '0');
    expect(n).toBeGreaterThanOrEqual(100);
    await expect(page.getByTestId('showing')).toContainText('of');
    await expect(page.locator('.review-list .badge.state-draft').first()).toBeVisible();
    await expect(page.getByTestId('coverage')).toContainText('Sound and silence');
  });

  test('a draft is not visible to learners', async ({ page, request }, info) => {
    const s = pick(info.project.name);
    expect((await page.goto(`/e/${s.publish}`))?.status()).toBe(404);
    expect((await page.goto('/explore/sound-and-silence'))?.status()).toBe(404);
    await open(page, '/explore');
    await expect(page.getByText('Sound and silence')).toHaveCount(0);
    await open(page, `/search?q=${s.publish}`);
    await expect(page.locator('.xcard-text', { hasText: s.publish })).toHaveCount(0);
    expect((await request.get(`/e/${s.publish}`)).status()).toBe(404);
  });

  test('opening a draft shows the banner, the entry as learners see it and its quality notes', async ({ page }, info) => {
    const s = pick(info.project.name);
    await open(page, reviewUrl(s.publish));
    await expect(page.getByTestId('draft-banner')).toContainText('Learners cannot see this yet');
    const preview = page.getByTestId('preview');
    await expect(preview.getByRole('heading', { name: 'What it means' })).toBeVisible();
    await expect(preview.getByRole('heading', { name: 'Examples' })).toBeVisible();
    await expect(page.getByTestId('lint')).toContainText('Quality notes');
    await expect(page.getByRole('button', { name: /Approve and publish/ })).toBeVisible();
  });

  test('approve and publish shows the entry to learners and moves on; moving back to draft hides it and keeps a saved word', async ({ page, request }, info) => {
    const s = pick(info.project.name);
    await open(page, reviewUrl(s.publish));
    await page.getByRole('button', { name: /Approve and publish/ }).click();
    await expect(page).not.toHaveURL(new RegExp(`/content/expression/${s.publish}`));
    await expect(page).toHaveURL(/\/content\/expression\/[a-z-]+/); // the next item in the queue

    expect((await request.get(`/e/${s.publish}`)).status()).toBe(200);
    await open(page, `/e/${s.publish}`);
    await expect(page.getByRole('heading', { level: 1, name: s.publish })).toBeVisible();
    await open(page, `/search?q=${s.publish}`);
    await expect(page.locator('.xcard-text', { hasText: s.publish }).first()).toBeVisible();
    await open(page, '/explore/movement-and-actions');
    await expect(page.locator('.xcard-text', { hasText: s.publish }).first()).toBeVisible();

    // save it to the notebook, then un-publish
    expect((await request.post('/api/notebook', { data: { slug: s.publish } })).status()).toBe(200);
    await open(page, `/content/expression/${s.publish}`);
    await page.getByRole('button', { name: 'Move back to draft' }).click();
    await expect(page.getByTestId('review-status')).toContainText('Moved back to draft');
    expect((await request.get(`/e/${s.publish}`)).status()).toBe(404);
    await open(page, '/notebook');
    await expect(page.locator('.entry-row .xcard-text', { hasText: s.publish })).toHaveCount(1);
  });

  test('needs work requires a note, then moves the entry to the Needs work list', async ({ page }, info) => {
    const s = pick(info.project.name);
    await open(page, reviewUrl(s.note));
    const button = page.getByRole('button', { name: /^Needs work/ });
    await button.click();
    const field = page.getByLabel('What needs work?');
    await expect(field).toBeFocused();
    await button.click(); // still no note
    await expect(page.getByTestId('review-status')).toContainText('Say what needs work');
    await field.fill('The second example sounds stiff.');
    await button.click();
    await expect(page).not.toHaveURL(new RegExp(`/content/expression/${s.note}`));

    await open(page, '/content?state=needs-work&kind=expression');
    const row = page.locator('.review-row', { hasText: s.note });
    await expect(row).toContainText('Needs work');
    await expect(row).toContainText('The second example sounds stiff.');
  });

  test('a draft with fewer than 3 examples cannot be published, and the file is left as it was', async ({ request }, info) => {
    const s = pick(info.project.name);
    const file = fileFor(s.short);
    const original = fs.readFileSync(file, 'utf8');
    // Remove the last example from the file on disk, as a hand edit would.
    const lines = original.split('\n');
    const last = lines.map((l, i) => (l.startsWith('  - text:') ? i : -1)).filter((i) => i >= 0).pop()!;
    const edited = [...lines.slice(0, last), ...lines.slice(last + 2)].join('\n');
    fs.writeFileSync(file, edited);
    try {
      const r = await status(request, s.short, 'published');
      expect(r.status()).toBe(409);
      expect((await r.json()).error).toMatch(/at least 3 examples/);
      expect(fs.readFileSync(file, 'utf8')).toBe(edited);
      expect((await request.get(`/e/${s.short}`)).status()).toBe(404);
    } finally {
      fs.writeFileSync(file, original);
    }
  });

  test('the N key goes to the note, letters typed in the note do not trigger shortcuts, and A approves', async ({ page, request }, info) => {
    const s = pick(info.project.name);
    await open(page, reviewUrl(s.key));
    await page.keyboard.press('n');
    const field = page.getByLabel('What needs work?');
    await expect(field).toBeFocused();
    await field.pressSequentially('a note with an a in it');
    await expect(field).toHaveValue('a note with an a in it');
    expect((await request.get(`/e/${s.key}`)).status()).toBe(404); // typing "a" did not approve

    await open(page, reviewUrl(s.key)); // a fresh page, nothing focused
    await page.keyboard.press('a');
    await expect(page).not.toHaveURL(new RegExp(`/content/expression/${s.key}`));
    expect((await request.get(`/e/${s.key}`)).status()).toBe(200);
    expect((await status(request, s.key, 'draft')).status()).toBe(200); // put it back
    expect((await request.get(`/e/${s.key}`)).status()).toBe(404);
  });

  test('a cross-site request to change content is refused and changes nothing', async ({ request }, info) => {
    const s = pick(info.project.name);
    const file = fileFor(s.publish);
    const before = fs.readFileSync(file, 'utf8');
    const a = await request.post('/api/content/status', { data: { slug: s.publish, status: 'published' }, headers: { Origin: 'http://evil.example' } });
    expect(a.status()).toBe(403);
    const b = await request.post('/api/content/status', { data: { slug: s.publish, status: 'published' }, headers: { 'Sec-Fetch-Site': 'cross-site' } });
    expect(b.status()).toBe(403);
    const c = await request.post('/api/content/verdict', { data: { kind: 'expression', slug: s.publish, verdict: 'approved' }, headers: { Origin: 'http://evil.example' } });
    expect(c.status()).toBe(403);
    expect(fs.readFileSync(file, 'utf8')).toBe(before);
  });

  test('bad requests to the review routes are refused with a clear status', async ({ request }) => {
    expect((await request.post('/api/content/status', { data: { slug: '../package', status: 'published' } })).status()).toBe(400);
    expect((await request.post('/api/content/status', { data: { slug: 'not-a-real-entry', status: 'published' } })).status()).toBe(404);
    expect((await request.post('/api/content/verdict', { data: { kind: 'expression', slug: 'torn', verdict: 'needs-work' } })).status()).toBe(400);
    expect((await request.post('/api/content/verdict', { data: { note: 'x'.repeat(30_000) } })).status()).toBe(413);
  });

  test('the dashboard says how many drafts are waiting and links to the review page', async ({ page }) => {
    await open(page, '/');
    const note = page.getByTestId('drafts-note');
    await expect(note).toContainText('waiting for your review');
    await note.getByRole('link').click();
    await expect(page).toHaveURL(/\/content$/);
  });

  test('there are no console errors on the review pages and no sideways scroll on a phone', async ({ page }, info) => {
    const s = pick(info.project.name);
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    for (const url of ['/content', reviewUrl(s.publish), '/content?state=needs-work&kind=expression']) {
      await open(page, url);
      if (info.project.name === 'phone') {
        const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
        expect(sw, url).toBeLessThanOrEqual(cw);
      }
    }
    expect(errors).toEqual([]);
  });
});
