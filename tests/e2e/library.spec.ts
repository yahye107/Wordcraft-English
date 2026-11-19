import { test, expect } from '@playwright/test';

test('dashboard loads and the nav reaches Explore', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('plain thought');
  await page.getByRole('link', { name: 'Explore', exact: true }).click();
  await expect(page).toHaveURL(/\/explore$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Explore expressions' })).toBeVisible();
});

test('a category page lists expressions and filters by level', async ({ page }) => {
  await page.goto('/explore/sadness-and-disappointment');
  await expect(page.locator('.xcard-text', { hasText: 'crestfallen' })).toBeVisible();
  await page.getByRole('link', { name: 'Intermediate', exact: true }).click();
  await expect(page).toHaveURL(/level=intermediate/);
  await expect(page.locator('.xcard-text', { hasText: 'heartbroken' })).toBeVisible();
  await expect(page.locator('.xcard-text', { hasText: 'crestfallen' })).toHaveCount(0);
});

test('an expression page shows its contrast group and common mistakes', async ({ page }) => {
  await page.goto('/e/whispered');
  await expect(page.getByRole('heading', { level: 1, name: 'whispered' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Whispered, murmured, muttered, mumbled' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Common mistakes' })).toBeVisible();
  await expect(page.locator('.mistake .wrong').first()).toBeVisible();
  await expect(page.locator('mark.hl').first()).toBeVisible();
});

test('searching for disappointment without the word shows results and no form of "disappointed"', async ({ page }) => {
  await page.goto('/search');
  await page.getByRole('searchbox').fill('ways to express disappointment without saying disappointed');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.locator('.xcard-text', { hasText: 'crestfallen' })).toBeVisible();
  const titles = await page.locator('.xcard-text').allTextContents();
  expect(titles.length).toBeGreaterThan(2);
  for (const t of titles) expect(t.toLowerCase()).not.toMatch(/^disappoint/);
  await expect(page.getByTestId('intent')).toContainText('Leaving out');
});

test('searching with special characters renders without an error', async ({ page }) => {
  for (const q of ['"unbalanced', 'a*b', '---', '(((', "' OR 1=1 --", 'x'.repeat(600)]) {
    const res = await page.goto(`/search?q=${encodeURIComponent(q)}`);
    expect(res?.status(), q.slice(0, 10)).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: 'Search by what you mean' })).toBeVisible();
  }
});

test('smart search with an unusable key falls back to normal search without an error', async ({ page }) => {
  // The test server has a fake key, so the AI call fails and the page must still answer.
  const res = await page.goto('/search?q=crestfallen&smart=1');
  expect(res?.status()).toBe(200);
  await expect(page.locator('.xcard-text', { hasText: 'crestfallen' })).toBeVisible();
});

test('an empty search shows suggestions, not an error', async ({ page }) => {
  await page.goto('/search?q=%20%20');
  await expect(page.getByText('Try describing a feeling or a situation.')).toBeVisible();
});

test('an unknown expression slug shows a 404 page', async ({ page }) => {
  const res = await page.goto('/e/does-not-exist');
  expect(res?.status()).toBe(404);
  await expect(page.getByText('We could not find that page')).toBeVisible();
});

test('the settings page shows key status and never the key itself', async ({ page }) => {
  const res = await page.goto('/settings');
  const html = await res!.text();
  expect(html).not.toContain('sk-ant-e2e-fake-key-for-tests-only');
  await expect(page.getByTestId('key-status')).toContainText('A key is set');
});
