import { test, expect, type Page } from '@playwright/test';

// The two projects (desktop and phone) share one database, so each uses its own words.
const mine = (project: string) => ({
  slug: project === 'desktop' ? 'whispered' : 'murmured',
  word: `quixotic-${project}`,
  collection: `Test ${project}`,
  imports: [`alpha${project}`, `beta${project}`],
});

async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

const IMPORT_TEXT = (words: string[]) =>
  words.map((w, i) => `> [!PDF|note] [[Book.pdf#page=${i + 1}|Book, p.${i + 1}]]\n> > ${w}\n> a meaning for ${w}\n`).join('');

test.describe.serial('notebook', () => {
  test('saving an expression adds it to the notebook and shows Saved', async ({ page }, info) => {
    const m = mine(info.project.name);
    await open(page, `/e/${m.slug}`);
    await page.getByRole('button', { name: 'Save to notebook' }).click();
    await expect(page.getByRole('link', { name: /Saved/ })).toBeVisible();
    await open(page, '/notebook');
    await expect(page.locator('.entry-row .xcard-text', { hasText: m.slug })).toHaveCount(1);
  });

  test('saving twice shows one entry', async ({ page, request }, info) => {
    const m = mine(info.project.name);
    const again = await request.post('/api/notebook', { data: { slug: m.slug } });
    expect((await again.json()).created).toBe(false);
    await open(page, '/notebook');
    await expect(page.locator('.entry-row .xcard-text', { hasText: m.slug })).toHaveCount(1);
  });

  test('adding a custom word and editing its meaning', async ({ page }, info) => {
    const m = mine(info.project.name);
    await open(page, '/notebook');
    await page.getByLabel('Word or expression').fill(m.word);
    await page.getByRole('button', { name: 'Add to notebook' }).click();
    await expect(page.locator('.entry-row .xcard-text', { hasText: m.word })).toBeVisible();
    await page.locator('.entry-row', { hasText: m.word }).click();
    await page.getByLabel('My meaning').fill('idealistic in an impractical way');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('My meaning')).toHaveValue('idealistic in an impractical way');
  });

  test('adding an example sentence and deleting it', async ({ page }, info) => {
    const m = mine(info.project.name);
    await open(page, '/notebook');
    await page.locator('.entry-row', { hasText: m.word }).click();
    await page.getByLabel('Add a sentence').fill('Her quixotic plan to repaint the town took years.');
    await page.getByRole('button', { name: 'Add sentence' }).click();
    await expect(page.getByText('Her quixotic plan to repaint the town took years.')).toBeVisible();
    await page.getByRole('button', { name: /^Remove:/ }).click();
    await expect(page.getByText('Her quixotic plan to repaint the town took years.')).toHaveCount(0);
  });

  test('creating a collection and filtering by it', async ({ page }, info) => {
    const m = mine(info.project.name);
    await open(page, '/notebook');
    await page.locator('.entry-row', { hasText: m.word }).click();
    await page.getByLabel('New collection').fill(m.collection);
    await page.getByRole('button', { name: 'Create and add' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Collections saved.' })).toBeVisible();
    await open(page, '/notebook');
    await page.getByLabel('Collections').getByRole('link', { name: new RegExp(m.collection) }).click();
    await expect(page.locator('.entry-row .xcard-text')).toHaveText([m.word]);
  });

  test('importing pasted Obsidian notes shows counts and re-importing adds nothing', async ({ page }, info) => {
    const m = mine(info.project.name);
    await open(page, '/notebook/import');
    await page.getByLabel('Or paste the notes').fill(IMPORT_TEXT(m.imports));
    await page.getByRole('button', { name: 'Find notes' }).click();
    await expect(page.getByText('Found 2 notes.')).toBeVisible();
    await page.getByRole('button', { name: 'Import 2 notes' }).click();
    await expect(page.getByTestId('import-result')).toContainText('Added 2');
    await page.getByRole('button', { name: 'Import 2 notes' }).click();
    await expect(page.getByTestId('import-result')).toContainText('Added 0, skipped 2');
  });

  test('a review session grades cards with the keyboard and the queue empties', async ({ page }) => {
    await open(page, '/notebook');
    await page.getByTestId('review-link').click();
    await expect(page).toHaveURL(/\/notebook\/review$/);
    // grade every card with the key 3 (good)
    for (let guard = 0; guard < 20; guard++) {
      const show = page.getByRole('button', { name: 'Show answer' });
      if (!(await show.isVisible().catch(() => false))) break;
      await show.click();
      await expect(page.getByRole('group', { name: /How well did you remember it/ })).toBeVisible();
      await page.keyboard.press('3');
      await expect(show.or(page.getByTestId('review-done'))).toBeVisible();
    }
    await expect(page.getByTestId('review-done')).toBeVisible();
    await open(page, '/notebook');
    await expect(page.getByText('Nothing due today')).toBeVisible();
  });

  test('an unknown notebook id returns 404', async ({ page }) => {
    const a = await page.goto('/notebook/99999');
    expect(a?.status()).toBe(404);
    const b = await page.goto('/notebook/abc');
    expect(b?.status()).toBe(404);
  });

  test('over-long text returns 400 and stores nothing', async ({ request }, info) => {
    const m = mine(info.project.name);
    const long = await request.post('/api/notebook', { data: { text: 'x'.repeat(101) } });
    expect(long.status()).toBe(400);
    const created = await request.post('/api/notebook', { data: { text: `${m.word}-notes` } });
    const id = (await created.json()).entry.id;
    const notes = await request.patch(`/api/notebook/${id}`, { data: { myNotes: 'n'.repeat(2001) } });
    expect(notes.status()).toBe(400);
    const bad = await request.post('/api/notebook/import', { data: { nothing: true } });
    expect(bad.status()).toBe(400);
  });
});
