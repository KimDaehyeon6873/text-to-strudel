import { test, expect } from '@playwright/test';

// PR #5 — persist-mode disclosure UX
// chromium-only is sufficient: pure DOM/JS logic, engine-independent.
test.describe('PR #5 persist disclosure UX', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'chromium-only deterministic check');

  for (const themeFile of ['/index.html', '/index.amber.html']) {
    test(`${themeFile}: default mode is session, toggle confirms once, second toggle skips confirm`, async ({ page }) => {
      // Wipe ack flag and any persisted state.
      await page.addInitScript(() => {
        try {
          localStorage.removeItem('tts_persist_acknowledged');
          localStorage.removeItem('tts_persist_gemini');
          localStorage.removeItem('tts_persist_openai');
          localStorage.removeItem('tts_persist_claude');
          localStorage.removeItem('tts_api_key_gemini');
          localStorage.removeItem('tts_api_key_openai');
          localStorage.removeItem('tts_api_key_claude');
        } catch (_) {}
      });

      await page.goto(themeFile, { waitUntil: 'load' });

      // Open the API panel so #apiMode is visible.
      await page.evaluate(() => { document.getElementById('apiSettings').open = true; });

      // Default: session mode rendered.
      const defaultMode = await page.evaluate(() => ({
        mode: document.getElementById('apiMode').getAttribute('data-mode'),
        text: document.getElementById('apiMode').textContent.trim().slice(0, 40),
      }));
      expect(defaultMode.mode).toBe('session');
      expect(defaultMode.text).toContain('Session only');

      // First toggle to persist: dialog must fire and we accept.
      let dialogCount = 0;
      const onDialog = async (dialog) => {
        dialogCount++;
        await dialog.accept();
      };
      page.on('dialog', onDialog);

      await page.click('#apiPersist');
      // Allow dialog handler to settle.
      await page.waitForFunction(() => document.getElementById('apiMode').getAttribute('data-mode') === 'persist');

      const afterFirst = await page.evaluate(() => ({
        mode: document.getElementById('apiMode').getAttribute('data-mode'),
        ack: localStorage.getItem('tts_persist_acknowledged'),
        text: document.getElementById('apiMode').textContent.trim().slice(0, 40),
        checked: document.getElementById('apiPersist').checked,
      }));
      expect(afterFirst.mode).toBe('persist');
      expect(afterFirst.ack).toBe('1');
      expect(afterFirst.text).toContain('Persisted on disk');
      expect(afterFirst.checked).toBe(true);
      expect(dialogCount).toBe(1);

      // Uncheck: no confirm should fire (we still have the listener attached).
      await page.click('#apiPersist');
      await page.waitForFunction(() => document.getElementById('apiMode').getAttribute('data-mode') === 'session');
      const afterUncheck = await page.evaluate(() => ({
        mode: document.getElementById('apiMode').getAttribute('data-mode'),
        text: document.getElementById('apiMode').textContent.trim().slice(0, 40),
        checked: document.getElementById('apiPersist').checked,
      }));
      expect(afterUncheck.mode).toBe('session');
      expect(afterUncheck.text).toContain('Session only');
      expect(afterUncheck.checked).toBe(false);
      expect(dialogCount).toBe(1); // unchanged

      // Re-check: confirm must NOT fire again because ack flag is set.
      await page.click('#apiPersist');
      await page.waitForFunction(() => document.getElementById('apiMode').getAttribute('data-mode') === 'persist');
      const afterRecheck = await page.evaluate(() => ({
        mode: document.getElementById('apiMode').getAttribute('data-mode'),
        checked: document.getElementById('apiPersist').checked,
      }));
      expect(afterRecheck.mode).toBe('persist');
      expect(afterRecheck.checked).toBe(true);
      expect(dialogCount).toBe(1); // STILL 1 — no second confirm

      page.off('dialog', onDialog);
    });
  }
});
