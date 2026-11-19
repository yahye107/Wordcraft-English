import { test, expect, type Page } from '@playwright/test';

const SLUGS = [
  'subordinate-clauses',
  'participial-phrases',
  'cause-and-effect',
  'expressing-contrast',
  'describing-movement',
  'describing-environments',
  'emotion-through-physical-reaction',
  'thoughts-and-realisations',
  'creating-suspense',
  'combining-actions-and-dialogue',
  'sentence-length-and-rhythm',
  'improving-flow',
];

const LESSON = '/labs/sentences/subordinate-clauses';

async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

test('the labs page links to both labs', async ({ page }) => {
  await open(page, '/labs');
  await expect(page.getByRole('link', { name: /Dialogue and narration/ })).toBeVisible();
  await page.getByRole('link', { name: /Sentence construction/ }).click();
  await expect(page).toHaveURL(/\/labs\/sentences$/);
});

test('the sentence lesson list shows 12 lessons in order', async ({ page }) => {
  await open(page, '/labs/sentences');
  const titles = await page.locator('.lesson-title').allTextContents();
  expect(titles).toHaveLength(12);
  expect(titles[0]).toBe('Subordinate clauses');
  expect(titles[11]).toBe('Improving flow');
});

test('a sentence lesson page shows the sentence legend and structure marks', async ({ page }) => {
  await open(page, LESSON);
  await expect(page.getByLabel('How examples are marked')).toContainText('main clause');
  await expect(page.locator('.example-text .ann-main').first()).toBeVisible();
  await expect(page.locator('.example-text .ann-sub').first()).toBeVisible();
});

test('a reorder exercise rejects a wrong order and accepts a right one, using buttons only', async ({ page }) => {
  await open(page, LESSON);
  const ex = page.locator('article.exercise', { hasText: 'Put the pieces in order to make one sentence.' });
  // wrong: "she kept walking." first
  await ex.getByRole('button', { name: 'she kept walking.' }).click();
  await ex.getByRole('button', { name: 'Although' }).click();
  await ex.getByRole('button', { name: 'she was tired,' }).click();
  await ex.getByRole('button', { name: 'Check' }).click();
  await expect(ex.getByRole('status')).toContainText('Not quite');
  await expect(ex.getByRole('status')).toContainText('Although she was tired, she kept walking.');
  await ex.getByRole('button', { name: 'Start again' }).click();
  await ex.getByRole('button', { name: 'Although' }).click();
  await ex.getByRole('button', { name: 'she was tired,' }).click();
  await ex.getByRole('button', { name: 'she kept walking.' }).click();
  await ex.getByRole('button', { name: 'Check' }).click();
  await expect(ex.getByRole('status')).toContainText('Correct');
});

test('progress survives a reload in the sentence lab', async ({ page }) => {
  await open(page, LESSON);
  const ex = page.locator('article.exercise', { hasText: 'Is each group of words a main clause' });
  await ex.getByRole('radio', { name: 'main clause' }).nth(0).check();
  await ex.getByRole('radio', { name: 'subordinate clause' }).nth(1).check();
  await ex.getByRole('radio', { name: 'subordinate clause' }).nth(2).check();
  await ex.getByRole('radio', { name: 'main clause' }).nth(3).check();
  await ex.getByRole('button', { name: 'Check' }).click();
  await expect(ex.getByRole('status')).toContainText('Correct');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('article.exercise', { hasText: 'Is each group of words a main clause' }).locator('.badge.done')).toBeVisible();
});

test('a dialogue slug under /labs/sentences returns 404 and the reverse', async ({ page }) => {
  const a = await page.goto('/labs/sentences/what-dialogue-tags-do');
  expect(a?.status()).toBe(404);
  const b = await page.goto('/labs/dialogue/subordinate-clauses');
  expect(b?.status()).toBe(404);
});

test('previous and next links stay inside the lab', async ({ page }) => {
  await open(page, '/labs/sentences/subordinate-clauses');
  await expect(page.getByRole('link', { name: /Previous/ })).toHaveCount(0);
  await page.getByRole('link', { name: /Next: Participial phrases/ }).click();
  await expect(page).toHaveURL(/\/labs\/sentences\/participial-phrases$/);
  await open(page, '/labs/sentences/improving-flow');
  await expect(page.getByRole('link', { name: /Next:/ })).toHaveCount(0);
  await open(page, '/labs/dialogue/what-dialogue-tags-do');
  await expect(page.getByRole('link', { name: /Previous/ })).toHaveCount(0);
});

test('posting a bad reorder answer returns 400', async ({ request }) => {
  const dup = await request.post('/api/exercises/s1-3-build-the-sentence/check', { data: { answer: { order: [0, 0, 1] } } });
  expect(dup.status()).toBe(400);
  const shortOrder = await request.post('/api/exercises/s1-3-build-the-sentence/check', { data: { answer: { order: [0, 1] } } });
  expect(shortOrder.status()).toBe(400);
  const good = await request.post('/api/exercises/s1-3-build-the-sentence/check', { data: { answer: { order: [1, 2, 0] } } });
  expect(good.status()).toBe(200);
  expect((await good.json()).correct).toBe(true);
});

test('every sentence lesson loads without a console error', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  for (const slug of SLUGS) {
    const res = await page.goto(`/labs/sentences/${slug}`);
    expect(res?.status(), slug).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
