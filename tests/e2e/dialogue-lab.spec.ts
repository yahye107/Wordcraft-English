import { test, expect, type Page } from '@playwright/test';

const SLUGS = [
  'what-dialogue-tags-do',
  'tags-and-action-beats',
  'where-beats-go',
  'dialogue-without-tags',
  'showing-emotion-in-dialogue',
  'faces-and-bodies-with-speech',
  'hesitation-and-uncertainty',
  'sarcasm-and-subtext',
  'confidence-and-frustration',
  'inner-thoughts-and-reactions',
  'avoiding-repeated-tags',
  'a-short-scene',
];

const LESSON = '/labs/dialogue/tags-and-action-beats';

/** Wait until the page's scripts have attached, so clicks reach React handlers. */
async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

test('the labs page links to the dialogue lab', async ({ page }) => {
  await open(page, '/labs');
  await page.getByRole('link', { name: /Dialogue and narration/ }).first().click();
  await expect(page).toHaveURL(/\/labs\/dialogue$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Dialogue and narration' })).toBeVisible();
});

test('the lesson list shows 12 lessons in order', async ({ page }) => {
  await open(page, '/labs/dialogue');
  const titles = await page.locator('.lesson-title').allTextContents();
  expect(titles).toHaveLength(12);
  expect(titles[0]).toBe('What dialogue tags do');
  expect(titles[11]).toBe('A short scene');
});

test('a lesson page shows the legend and a coloured tag and beat', async ({ page }) => {
  await open(page, LESSON);
  await expect(page.getByLabel('How examples are marked')).toBeVisible();
  await expect(page.locator('.example-text .ann-tag').first()).toBeVisible();
  await expect(page.locator('.example-text .ann-beat').first()).toBeVisible();
});

test('a correct choose answer says correct and a wrong one shows the explanation', async ({ page }) => {
  await open(page, LESSON);
  const ex = page.locator('article.exercise', { hasText: 'Which line is punctuated correctly?' });
  await ex.getByRole('radio').nth(1).check();
  await ex.getByRole('button', { name: 'Check' }).click();
  await expect(ex.getByRole('status')).toContainText('Not quite');
  await expect(ex.getByRole('status')).toContainText('question mark replaces the comma');
  await ex.getByRole('button', { name: 'Try again' }).click();
  await ex.getByRole('radio').nth(0).check();
  await ex.getByRole('button', { name: 'Check' }).click();
  await expect(ex.getByRole('status')).toContainText('Correct');
});

test('fix_punctuation accepts a correct fix and rejects a missing capital rule', async ({ page }) => {
  await open(page, LESSON);
  const ex = page.locator('article.exercise', { hasText: 'Correct the punctuation.' });
  const box = ex.getByRole('textbox');
  await box.fill('“Come inside,” She said.');
  await ex.getByRole('button', { name: 'Check' }).click();
  await expect(ex.getByRole('status')).toContainText('Not quite');
  await box.fill('“Come inside,” she said.');
  await ex.getByRole('button', { name: 'Check' }).click();
  await expect(ex.getByRole('status')).toContainText('Correct');
});

test('progress survives a page reload', async ({ page }) => {
  await open(page, LESSON);
  const ex = page.locator('article.exercise', { hasText: 'Which line is punctuated correctly?' });
  await ex.getByRole('radio').nth(0).check();
  await ex.getByRole('button', { name: 'Check' }).click();
  await expect(ex.getByRole('status')).toContainText('Correct');
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('article.exercise', { hasText: 'Which line is punctuated correctly?' }).locator('.badge.done')).toBeVisible();
  await expect(page.getByText(/[1-9] of 5 exercises done/).first()).toBeVisible();
});

test('free writing shows the sample only after saving', async ({ page }) => {
  await open(page, LESSON);
  const ex = page.locator('article.exercise', { hasText: 'surprise gift' });
  await expect(ex.locator('.sample')).toHaveCount(0);
  await ex.getByRole('textbox').fill('“Open it,” Mum said. Lila tore at the paper. “A telescope!”');
  await ex.getByRole('button', { name: 'Save my writing' }).click();
  await expect(ex.locator('.sample')).toContainText('One possible version');
});

test('an unknown lesson slug returns 404', async ({ page }) => {
  const res = await page.goto('/labs/dialogue/not-a-lesson');
  expect(res?.status()).toBe(404);
  await expect(page.getByText('We could not find that page')).toBeVisible();
});

test('posting an invalid answer to the check route returns 400, and an unknown exercise 404', async ({ request }) => {
  const bad = await request.post('/api/exercises/l2-4-pick-the-correct-one/check', { data: { answer: { choice: 99 } } });
  expect(bad.status()).toBe(400);
  const noAnswer = await request.post('/api/exercises/l2-4-pick-the-correct-one/check', { data: { nothing: 1 } });
  expect(noAnswer.status()).toBe(400);
  const missing = await request.post('/api/exercises/ghost/check', { data: { answer: { choice: 0 } } });
  expect(missing.status()).toBe(404);
});

test('the lesson page data never contains an answer key', async ({ request }) => {
  const res = await request.get(LESSON);
  const html = await res.text();
  expect(html).not.toContain('"accepted"');
  expect(html).not.toContain('One possible version');
});

test('every lesson page loads without a console error', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  for (const slug of SLUGS) {
    const res = await page.goto(`/labs/dialogue/${slug}`);
    expect(res?.status(), slug).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
