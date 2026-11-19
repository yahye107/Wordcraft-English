import { test, expect, type Page } from '@playwright/test';

async function open(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState('networkidle');
}

async function startSentence(page: Page) {
  await open(page, '/studio/sentence');
  await page.getByRole('button', { name: 'Start writing' }).click();
  await expect(page).toHaveURL(/\/studio\/session\/\d+$/);
  await page.waitForLoadState('networkidle');
}

const write = async (page: Page, text: string) => page.getByLabel('Your writing').fill(text);

test.describe.serial('studio', () => {
  test('the studio lists six modes', async ({ page }) => {
    await open(page, '/studio');
    for (const name of ['Sentence improvement', 'Vocabulary replacement', 'Situations', 'Paragraphs', 'Creative writing', 'Professional writing']) {
      await expect(page.locator('.tiles').getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
    }
  });

  test('a prompt mode lists prompts and starts a session', async ({ page }) => {
    await open(page, '/studio/situation');
    const first = page.locator('.prompt-list li').first();
    const title = (await first.locator('h2').textContent()) ?? '';
    await first.getByRole('button', { name: 'Write about this' }).click();
    await expect(page).toHaveURL(/\/studio\/session\/\d+$/);
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    await expect(page.locator('.prompt-panel')).toBeVisible();
  });

  test('the privacy note is visible before tutor feedback', async ({ page }) => {
    await startSentence(page);
    await expect(page.getByTestId('privacy-note')).toContainText('sends your writing to Claude');
  });

  test('local checks flag "very" and show only level 1 hints first', async ({ page }) => {
    await startSentence(page);
    await write(page, 'She was very sad today.');
    await page.getByRole('button', { name: 'Check with local tools' }).click();
    const issue = page.locator('.issue', { hasText: 'very sad' });
    await expect(issue).toBeVisible();
    await expect(issue).toContainText('Is it as exact as it could be?');
    await expect(issue).not.toContainText('weak intensifier');
    await expect(page.getByTestId('ai-note')).toContainText('Local checks only');
  });

  test('Why? and Show directions reveal the next levels', async ({ page }) => {
    await startSentence(page);
    await write(page, 'She was very sad today.');
    await page.getByRole('button', { name: 'Check with local tools' }).click();
    const issue = page.locator('.issue', { hasText: 'very sad' });
    await issue.getByRole('button', { name: 'Why?' }).click();
    await expect(issue).toContainText('weak intensifier');
    await expect(issue).not.toContainText('Think about what you really mean');
    await issue.getByRole('button', { name: 'Show directions' }).click();
    await expect(issue).toContainText('Think about what you really mean');
  });

  test('tutor feedback shows an issue quoting the learner’s text', async ({ page }) => {
    await startSentence(page);
    await write(page, 'Yesterday she was very sad.');
    await page.getByRole('button', { name: 'Get tutor feedback' }).click();
    const tutor = page.locator('.issue', { has: page.getByText('Tutor', { exact: true }) });
    await expect(tutor.locator('mark.hl')).toHaveText('Yesterday');
    await expect(page.getByText('You wrote something real.')).toBeVisible();
  });

  test('revising and resubmitting shows progress', async ({ page }) => {
    await startSentence(page);
    await write(page, 'She was very sad today.');
    await page.getByRole('button', { name: 'Check with local tools' }).click();
    await expect(page.locator('.issue', { hasText: 'very sad' })).toBeVisible();
    await write(page, 'She was heartbroken today.');
    await page.getByRole('button', { name: /Check my revision/ }).click();
    await expect(page.getByTestId('progress')).toContainText('fixed');
    await expect(page.getByTestId('progress')).toContainText('1 fixed');
  });

  test('one possible version is hidden before a revision and appears after', async ({ page }) => {
    await startSentence(page);
    await write(page, 'She was very sad today.');
    await page.getByRole('button', { name: 'Check with local tools' }).click();
    await expect(page.getByTestId('feedback')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Show one possible version' })).toHaveCount(0);
    await write(page, 'She was sad today.');
    await page.getByRole('button', { name: /Check my revision/ }).first().click();
    await expect(page.getByText('Feedback on version 2')).toBeVisible();
    await page.getByRole('button', { name: 'Show one possible version' }).click();
    await expect(page.getByText('One possible version', { exact: true })).toBeVisible();
    await expect(page.getByText('Do not copy it')).toBeVisible();
  });

  test('identical resubmission does not add a revision', async ({ request }) => {
    const s = await request.post('/api/writing/sessions', { data: { mode: 'paragraph' } });
    const id = (await s.json()).id;
    const a = await request.post(`/api/writing/sessions/${id}/revisions`, { data: { text: 'It was very good.', useAi: false } });
    const b = await request.post(`/api/writing/sessions/${id}/revisions`, { data: { text: 'It was very good.', useAi: false } });
    expect((await a.json()).duplicate).toBe(false);
    const second = await b.json();
    expect(second.duplicate).toBe(true);
    expect(second.version).toBe(1);
  });

  test('unknown sessions and modes return 404', async ({ page }) => {
    expect((await page.goto('/studio/session/99999'))?.status()).toBe(404);
    expect((await page.goto('/studio/session/abc'))?.status()).toBe(404);
    expect((await page.goto('/studio/poetry'))?.status()).toBe(404);
  });

  test('over-long and empty text return 400 and the model version is refused on version 1', async ({ request }) => {
    const s = await request.post('/api/writing/sessions', { data: { mode: 'paragraph' } });
    const id = (await s.json()).id;
    expect((await request.post(`/api/writing/sessions/${id}/revisions`, { data: { text: 'x'.repeat(5001), useAi: false } })).status()).toBe(400);
    expect((await request.post(`/api/writing/sessions/${id}/revisions`, { data: { text: '   ', useAi: false } })).status()).toBe(400);
    const ok = await (await request.post(`/api/writing/sessions/${id}/revisions`, { data: { text: 'It was very good.', useAi: false } })).json();
    const mv = await request.post(`/api/writing/sessions/${id}/revisions/${ok.revisionId}/model-version`);
    expect(mv.status()).toBe(409);
  });

  test('the tutor page shows recurring weaknesses after several checks', async ({ page, request }) => {
    for (let i = 0; i < 3; i++) {
      const s = await request.post('/api/writing/sessions', { data: { mode: 'paragraph' } });
      const id = (await s.json()).id;
      await request.post(`/api/writing/sessions/${id}/revisions`, { data: { text: `Day ${i}: it was very good.`, useAi: false } });
    }
    await open(page, '/tutor');
    await expect(page.getByText(/Using “very”/).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Find better words' }).first()).toBeVisible();
  });

  test('the vocabulary finder groups near-synonyms', async ({ page }) => {
    await open(page, '/studio/vocabulary');
    await page.getByLabel('A word you use too often').fill('sad');
    await page.getByRole('button', { name: 'Find better words' }).click();
    await expect(page.getByRole('region').filter({ hasText: 'crestfallen' }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'crestfallen' }).first()).toBeVisible();
  });

  test('history lists a session and deletes it', async ({ page, request }, info) => {
    const title = `Delete me ${info.project.name}`;
    await request.post('/api/writing/sessions', { data: { mode: 'creative', title } });
    await open(page, '/history');
    const row = page.locator('li.panel', { hasText: title });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /^Delete/ }).click();
    await row.getByRole('button', { name: 'Yes, delete' }).click();
    await expect(page.locator('li.panel', { hasText: title })).toHaveCount(0);
  });
});
