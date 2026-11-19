import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

// Passages are invented for these tests (no book text). The desktop and phone projects share one database,
// so each uses its own passages.
const MAIN = (p: string) =>
  `“Come closer,” Mara whispered to the boy. He slammed the door and stared at the weathered pier. She hesitated because the tide was rising. However, nobody moved in the labyrinthine dark, ${p}.`;
const OTHER = (p: string, n: number) => `The lamp ${p} number ${n} flickered over the empty square, and the night felt very long.`;

async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

async function analyseViaUi(page: Page, text: string, button: 'local' | 'tutor' = 'local') {
  await open(page, '/novel');
  await page.getByLabel('Passage', { exact: true }).fill(text);
  await page.getByRole('button', { name: button === 'local' ? 'Analyse with local tools' : 'Analyse with the tutor' }).click();
  await expect(page).toHaveURL(/\/novel\/\d+$/);
  await page.waitForLoadState('networkidle');
}

async function analyseViaApi(request: APIRequestContext, excerpt: string, useAi = false) {
  const r = await request.post('/api/novel/analyses', { data: { excerpt, useAi } });
  return (await r.json()) as { ok: boolean; id: number; existing: boolean; aiUsed: boolean; error?: string };
}

test.describe.serial('novel lab', () => {
  test('the page shows the notice, the form and the privacy sentence before the tutor button', async ({ page }) => {
    await open(page, '/novel');
    await expect(page.getByTestId('notice')).toContainText('stored only on this computer');
    const note = page.getByTestId('privacy-note');
    await expect(note).toContainText('sends the passage to Claude');
    const tutor = page.getByRole('button', { name: 'Analyse with the tutor' });
    await expect(tutor).toBeVisible();
    const [n, t] = [await note.boundingBox(), await tutor.boundingBox()];
    expect(n!.y).toBeLessThan(t!.y);
  });

  test('a passage over 120 words is refused with a message and nothing is stored', async ({ page }) => {
    await open(page, '/novel');
    const before = await page.locator('.entry-list > li').count();
    await page.getByLabel('Passage', { exact: true }).fill(Array(130).fill('word').join(' '));
    await expect(page.getByText('130 of 120 words')).toBeVisible();
    await page.getByRole('button', { name: 'Analyse with local tools' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'too long' }).first()).toBeVisible();
    await expect(page).toHaveURL(/\/novel$/);
    await open(page, '/novel');
    await expect(page.locator('.entry-list > li')).toHaveCount(before);
  });

  test('local analysis shows colour-coded speech, a tag and a beat, labelled as an automatic guess', async ({ page }, info) => {
    await analyseViaUi(page, MAIN(info.project.name));
    const passage = page.getByTestId('passage');
    await expect(passage.locator('.ann-speech').first()).toContainText('Come closer');
    await expect(passage.locator('.ann-tag').first()).toContainText('Mara whispered');
    await expect(passage.locator('.ann-beat').first()).toContainText('slammed the door');
    await expect(page.getByText('Automatic guess').first()).toBeVisible();
    await expect(page.getByTestId('ai-note')).toContainText('Nothing was sent');
    await expect(page.getByTestId('sentence-stats')).toContainText('sentences');
  });

  test('a library word is listed with its meaning and can be saved', async ({ page, request }, info) => {
    const { id } = await analyseViaApi(request, MAIN(info.project.name));
    await open(page, `/novel/${id}`);
    const item = page.getByTestId('library-words').locator('.word-item', { hasText: 'weathered' });
    await expect(item).toContainText('Changed and made rough');
    await item.getByRole('button', { name: /Save to notebook/ }).click();
    await expect(item.getByRole('button', { name: /Saved/ })).toBeVisible();
  });

  test('an unfamiliar word can be added to the notebook', async ({ page, request }, info) => {
    const { id } = await analyseViaApi(request, MAIN(info.project.name));
    await open(page, `/novel/${id}`);
    const item = page.getByTestId('lookup-words').locator('.word-item', { hasText: 'labyrinthine' });
    await expect(item.getByRole('link', { name: 'Search the library' })).toBeVisible();
    await item.getByRole('button', { name: /Add to my notebook/ }).click();
    await expect(item.getByRole('button', { name: /Saved/ })).toBeVisible();
    await open(page, '/notebook');
    await expect(page.locator('.entry-row .xcard-text', { hasText: 'labyrinthine' })).toHaveCount(1);
  });

  test('a technique links to its lesson and the lesson loads', async ({ page, request }, info) => {
    const { id } = await analyseViaApi(request, MAIN(info.project.name));
    await open(page, `/novel/${id}`);
    await page.getByTestId('techniques').getByRole('link', { name: /dialogue tag lesson/ }).click();
    await expect(page).toHaveURL(/\/labs\/dialogue\/what-dialogue-tags-do$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('tutor analysis with the fixture shows the original example in its own section', async ({ page }, info) => {
    await analyseViaUi(page, OTHER(info.project.name, 1), 'tutor');
    const ex = page.getByTestId('ai-example');
    await expect(ex).toContainText('An original example in a different situation');
    await expect(ex).toContainText('baker');
    await expect(page.getByTestId('tutor-section')).toContainText('Fixture technique');
    await expect(page.getByTestId('ai-note')).toHaveCount(0);
  });

  test('analysing the same passage again returns the existing analysis', async ({ request }, info) => {
    const text = OTHER(info.project.name, 2);
    const a = await analyseViaApi(request, text);
    const b = await analyseViaApi(request, `  ${text}\n`);
    expect(b.existing).toBe(true);
    expect(b.id).toBe(a.id);
  });

  test('adding tutor analysis to a local-only result updates it', async ({ page, request }, info) => {
    const { id } = await analyseViaApi(request, OTHER(info.project.name, 3));
    await open(page, `/novel/${id}`);
    await expect(page.getByTestId('ai-example')).toHaveCount(0);
    await page.getByRole('button', { name: 'Add tutor analysis' }).click();
    await expect(page.getByTestId('ai-example')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add tutor analysis' })).toHaveCount(0);
  });

  test('braces in a passage do not create marks', async ({ page, request }, info) => {
    const { id } = await analyseViaApi(request, `He wrote {tag|hello} in the wet sand near the ${info.project.name} pier.`);
    await open(page, `/novel/${id}`);
    await expect(page.getByTestId('passage')).toContainText('(tag|hello)');
    await expect(page.getByTestId('passage').locator('.ann-tag')).toHaveCount(0);
  });

  test('delete removes the analysis and the stored passage', async ({ page, request }, info) => {
    const text = OTHER(info.project.name, 4);
    const { id } = await analyseViaApi(request, text);
    await open(page, `/novel/${id}`);
    await page.getByRole('button', { name: /^Delete/ }).click();
    await page.getByRole('button', { name: 'Yes, delete' }).click();
    await expect(page).toHaveURL(/\/novel$/);
    await expect(page.getByText(text.slice(0, 40))).toHaveCount(0);
    expect((await page.goto(`/novel/${id}`))?.status()).toBe(404);
  });

  test('unknown ids return 404 and bad requests are refused', async ({ page, request }) => {
    expect((await page.goto('/novel/99999'))?.status()).toBe(404);
    expect((await page.goto('/novel/abc'))?.status()).toBe(404);
    expect((await request.post('/api/novel/analyses', { data: { excerpt: 'x'.repeat(801) } })).status()).toBe(400);
    expect((await request.post('/api/novel/analyses', { data: { excerpt: 'x'.repeat(30_000) } })).status()).toBe(413);
    expect((await request.delete('/api/novel/analyses/99999')).status()).toBe(404);
    expect((await request.post('/api/novel/analyses/99999/ai')).status()).toBe(404);
  });
});
