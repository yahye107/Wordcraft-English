import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

// The desktop and phone projects share one database, and other specs add data too, so these tests look for
// their own uniquely titled items and use "at least" for counts.

async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

async function newSession(request: APIRequestContext, title: string, mode = 'paragraph', text?: string) {
  const r = await request.post('/api/writing/sessions', { data: { mode, title } });
  const id = (await r.json()).id as number;
  if (text) await request.post(`/api/writing/sessions/${id}/revisions`, { data: { text, useAi: false } });
  return id;
}
const removeSession = (request: APIRequestContext, id: number) => request.delete(`/api/writing/sessions/${id}`);

test.describe.serial('dashboard, progress and history', () => {
  test('the dashboard shows a Today panel with a main suggestion and a streak line', async ({ page }) => {
    await open(page, '/');
    await expect(page.getByTestId('today')).toBeVisible();
    await expect(page.getByTestId('today-main')).toBeVisible();
    await expect(page.getByTestId('streak')).toHaveText(/^(No streak yet|\d+ days? in a row)$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('plain thought');
  });

  test('finishing an exercise starts a streak and the history lists the lesson', async ({ page, request }) => {
    const r = await request.post('/api/exercises/l1-1-which-is-a-tag/check', { data: { answer: { choice: 0 } } });
    expect(r.status()).toBe(200);
    await open(page, '/');
    await expect(page.getByTestId('streak')).toHaveText(/^[1-9]\d* days? in a row$/);
    await open(page, '/history?type=lessons');
    const row = page.locator('li.panel', { hasText: 'What dialogue tags do' }).first();
    await expect(row).toContainText('Practised');
    await row.getByRole('link').click();
    await expect(page).toHaveURL(/\/labs\/dialogue\/what-dialogue-tags-do$/);
  });

  test('a writing session shows in the history and on the progress page, and can be deleted', async ({ page, request }, info) => {
    const title = `Progress piece ${info.project.name}`;
    const id = await newSession(request, title, 'paragraph', 'It was a very good day and a very nice walk.');
    await open(page, '/history?type=writing');
    const row = page.locator('li.panel', { hasText: title });
    await expect(row).toBeVisible();

    await open(page, '/progress');
    await page.getByText('Your pieces').click();
    await expect(page.getByRole('link', { name: title })).toBeVisible();

    await open(page, '/history?type=writing');
    await row.getByRole('button', { name: /^Delete/ }).click();
    await row.getByRole('button', { name: 'Yes, delete' }).click();
    await expect(page.locator('li.panel', { hasText: title })).toHaveCount(0);
    await open(page, '/progress'); // with no other writing this is the empty state, so do not look for the list
    await expect(page.getByRole('link', { name: title })).toHaveCount(0);
    await removeSession(request, id); // already gone: a 404 is fine
  });

  test('the progress page shows every section', async ({ page, request }, info) => {
    const id = await newSession(request, `Sections ${info.project.name}`, 'paragraph', 'The day was bright and the walk was pleasant.');
    await open(page, '/progress');
    for (const [testid, name] of [
      ['section-activity', 'Activity'],
      ['section-writing', 'Writing'],
      ['section-words', 'Words you use'],
      ['section-review', 'Review'],
      ['section-labs', 'Labs'],
    ] as const) {
      const section = page.getByTestId(testid);
      await expect(section).toBeVisible();
      await expect(section.getByRole('heading', { level: 2, name })).toBeVisible();
    }
    await expect(page.getByTestId('trend')).not.toBeEmpty();
    await removeSession(request, id);
  });

  test('the Show the numbers table matches the chart summary', async ({ page, request }, info) => {
    const id = await newSession(request, `Numbers ${info.project.name}`, 'paragraph', 'It was a very good day and a very nice walk.');
    await open(page, '/progress');
    const chart = page.locator('figure.chart', { has: page.locator('svg.chart-svg') }).first();
    const label = (await chart.locator('svg.chart-svg').getAttribute('aria-label')) ?? '';
    await chart.getByText('Show the numbers').click();
    const lastRow = chart.locator('tbody tr').last();
    const first = (await lastRow.locator('td').nth(0).textContent())?.trim();
    const final = (await lastRow.locator('td').nth(1).textContent())?.trim();
    expect(label).toContain(`First draft: `);
    // With one piece the summary says "one value"; with more it says "ends at".
    expect(label).toMatch(new RegExp(`(ends at|one value,) ${first} problems per 100 words`));
    expect(label).toMatch(new RegExp(`(ends at|one value,) ${final} problems per 100 words`));
    await removeSession(request, id);
  });

  test('the history type filter limits the list and the old mode link still works', async ({ page, request }, info) => {
    const title = `Creative ${info.project.name}`;
    const id = await newSession(request, title, 'creative');
    await open(page, '/history?type=lessons');
    await expect(page.locator('li.panel', { hasText: title })).toHaveCount(0);
    await open(page, '/history?mode=creative');
    await expect(page.locator('li.panel', { hasText: title })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Writing', exact: true })).toHaveAttribute('aria-current', 'true');
    await expect(page.getByRole('link', { name: 'Creative writing', exact: true })).toHaveAttribute('aria-current', 'true');
    await removeSession(request, id);
  });

  test('Show more reveals older items', async ({ page, request }, info) => {
    test.setTimeout(90_000);
    const ids: number[] = [];
    for (let i = 0; i < 62; i++) ids.push(await newSession(request, `Bulk ${info.project.name} ${i}`));
    try {
      await open(page, '/history?type=writing');
      await expect(page.locator('li.panel')).toHaveCount(60);
      await page.getByRole('link', { name: 'Show more' }).click();
      await expect(page).toHaveURL(/limit=120/);
      expect(await page.locator('li.panel').count()).toBeGreaterThan(60);
    } finally {
      for (const id of ids) await removeSession(request, id);
    }
  });

  test('a title containing HTML is shown as text', async ({ page, request }) => {
    const title = '<img src=x onerror=alert(1)>';
    let dialog = false;
    page.on('dialog', (d) => {
      dialog = true;
      void d.dismiss();
    });
    const id = await newSession(request, title);
    await open(page, '/history?type=writing');
    await expect(page.locator('li.panel', { hasText: title }).first()).toBeVisible();
    await expect(page.locator('li.panel img')).toHaveCount(0);
    expect(dialog).toBe(false);
    await removeSession(request, id);
  });

  test('a saved notebook word used in writing appears under Words you use', async ({ page, request }, info) => {
    const word = info.project.name === 'desktop' ? 'whispered' : 'murmured';
    await request.post('/api/notebook', { data: { slug: word } });
    const id = await newSession(request, `Words ${info.project.name}`, 'paragraph', `He ${word} the answer to her.`);
    await open(page, '/progress');
    const section = page.getByTestId('section-words');
    await expect(section.getByRole('link', { name: word, exact: true })).toBeVisible();
    await expect(section).toContainText(/\d+ of \d+ saved library words/);
    await removeSession(request, id);
  });

  test('there are no console errors on the dashboard, progress and history', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    for (const url of ['/', '/progress', '/history']) await open(page, url);
    expect(errors).toEqual([]);
  });

  test('the pages do not scroll sideways on a phone', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'phone only');
    for (const url of ['/', '/progress', '/history']) {
      await open(page, url);
      const [sw, cw] = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
      expect(sw, url).toBeLessThanOrEqual(cw);
    }
  });
});
