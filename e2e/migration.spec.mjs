import { test, expect } from '@playwright/test';

test.describe('PR #4 migration v1 — legacy session-only key moves to splitStore', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'chromium-only deterministic check');

  test('pre-seeded legacy api key migrates on page load', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('tts_api_key_gemini', 'AIza-fake-test-key');
        localStorage.removeItem('tts_persist_gemini');
        localStorage.removeItem('tts_migrated_v1');
        localStorage.removeItem('tts_verified_at_gemini');
        localStorage.removeItem('tts_split_gemini');
        sessionStorage.removeItem('tts_split_gemini');
      } catch (e) {}
    });

    await page.goto('/index.html', { waitUntil: 'load' });

    const state = await page.evaluate(() => ({
      lsApiKey: localStorage.getItem('tts_api_key_gemini'),
      migratedFlag: localStorage.getItem('tts_migrated_v1'),
      ssSplit: sessionStorage.getItem('tts_split_gemini'),
      windowNameShare: (() => {
        try { return JSON.parse(window.name || '{}').tts?.k_gemini || null; }
        catch (_) { return null; }
      })(),
    }));

    expect(state.lsApiKey).toBeNull();
    expect(state.migratedFlag).toBe('1');
    expect(state.ssSplit).not.toBeNull();
    expect(state.windowNameShare).not.toBeNull();
  });
});
