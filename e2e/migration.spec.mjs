import { test, expect } from '@playwright/test';

for (const path of ['/index.html', '/index.amber.html']) {
  test(`${path} preserves and labels a legacy disk-backed API key`, async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem('tts_api_key_gemini', 'legacy-disk-key');
    });

    await page.goto(path);

    const storage = await page.evaluate(() => ({
      key: localStorage.getItem('tts_api_key_gemini'),
      persist: localStorage.getItem('tts_persist_gemini'),
    }));
    expect(storage).toEqual({ key: 'legacy-disk-key', persist: '1' });

    await page.locator('#apiSettings').evaluate((element) => { element.open = true; });
    await expect(page.locator('#apiPersist')).toBeChecked();
    await expect(page.locator('#apiMode')).toHaveAttribute('data-mode', 'persist');
  });
}
