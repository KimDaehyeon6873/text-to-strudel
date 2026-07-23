import { test, expect } from '@playwright/test';

for (const path of ['/index.html', '/index.amber.html']) {
  test(`${path} persists an API key only after explicit opt-in`, async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await page.route('https://generativelanguage.googleapis.com/**', (route) => {
      route.fulfill({ status: 200, contentType: 'application/json', body: '{"models":[]}' });
    });
    await page.goto(path);
    await page.locator('#apiSettings').evaluate((element) => { element.open = true; });

    await page.locator('#apiKey').fill('explicit-persistence-key');
    expect(await page.evaluate(() => localStorage.getItem('tts_api_key_gemini'))).toBeNull();

    page.once('dialog', (dialog) => dialog.accept());
    await page.locator('#apiPersist').check();
    await expect(page.locator('#apiMode')).toHaveAttribute('data-mode', 'pending');
    await page.locator('#apiSave').click();
    await expect(page.locator('#apiHint')).toContainText('verified');
    await expect(page.locator('#apiMode')).toHaveAttribute('data-mode', 'persist');

    expect(await page.evaluate(() => ({
      key: localStorage.getItem('tts_api_key_gemini'),
      persist: localStorage.getItem('tts_persist_gemini'),
    }))).toEqual({ key: 'explicit-persistence-key', persist: '1' });
  });

  test(`${path} never labels a disk-backed key as session-only`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('tts_api_key_gemini', 'disk-key');
      localStorage.setItem('tts_persist_gemini', '1');
    });
    await page.goto(path);
    await page.locator('#apiSettings').evaluate((element) => { element.open = true; });
    await expect(page.locator('#apiPersist')).toBeChecked();
    await expect(page.locator('#apiMode')).toHaveAttribute('data-mode', 'persist');

    await page.locator('#apiPersist').uncheck();

    const state = await page.evaluate(() => ({
      key: localStorage.getItem('tts_api_key_gemini'),
      persist: localStorage.getItem('tts_persist_gemini'),
      copyMode: document.querySelector('#apiMode')?.getAttribute('data-mode'),
    }));
    expect(
      state.key === null
        ? state.copyMode === 'session' && state.persist === null
        : state.copyMode === 'persist' && state.persist === '1',
      'storage and visible persistence copy must describe the same truth',
    ).toBe(true);
  });

  test(`${path} clearing a persisted key through the UI clears storage and shows session mode`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('tts_api_key_gemini', 'persisted-key');
      localStorage.setItem('tts_persist_gemini', '1');
      localStorage.setItem('tts_verified_at_gemini', String(Date.now()));
    });
    await page.goto(path);
    await page.locator('#apiSettings').evaluate((element) => { element.open = true; });
    await expect(page.locator('#apiPersist')).toBeChecked();
    await page.locator('#apiKey').fill('');
    await page.locator('#apiSave').click();

    expect(await page.evaluate(() => ({
      key: localStorage.getItem('tts_api_key_gemini'),
      persist: localStorage.getItem('tts_persist_gemini'),
      verified: localStorage.getItem('tts_verified_at_gemini'),
    }))).toEqual({ key: null, persist: null, verified: null });
    await expect(page.locator('#apiPersist')).not.toBeChecked();
    await expect(page.locator('#apiMode')).toHaveAttribute('data-mode', 'session');
    await expect(page.locator('#apiMode')).toContainText(/Session only/i);
  });

  for (const provider of [
    {
      id: 'gemini',
      url: 'https://generativelanguage.googleapis.com/**',
      malformed: {},
      valid: { models: [] },
    },
    {
      id: 'openai',
      url: 'https://api.openai.com/**',
      malformed: {},
      valid: { data: [] },
    },
    {
      id: 'claude',
      url: 'https://api.anthropic.com/**',
      malformed: {},
      valid: { data: [] },
    },
  ]) {
    test(`${path} saves ${provider.id} only after a schema-valid verification response`, async ({ page }) => {
      await page.addInitScript(() => localStorage.clear());
      let responseBody = provider.malformed;
      await page.route(provider.url, (route) => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(responseBody),
        });
      });
      await page.goto(path);
      await page.locator('#apiSettings').evaluate((element) => { element.open = true; });
      await page.locator('#apiProvider').selectOption(provider.id);
      await page.locator('#apiKey').fill(`${provider.id}-schema-key`);
      await page.locator('#apiSave').click();
      await expect(page.locator('#apiHint')).toContainText('Invalid');
      expect(await page.evaluate((id) => localStorage.getItem(`tts_verified_at_${id}`), provider.id)).toBeNull();

      responseBody = provider.valid;
      await page.locator('#apiSave').click();
      await expect(page.locator('#apiHint')).toContainText('verified');
      expect(Number(await page.evaluate(
        (id) => localStorage.getItem(`tts_verified_at_${id}`),
        provider.id,
      ))).toBeGreaterThan(0);
    });
  }
}
