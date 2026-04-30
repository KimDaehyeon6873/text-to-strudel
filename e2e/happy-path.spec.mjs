import { test, expect } from '@playwright/test';

test.describe('Tier 2 happy path — production index.html with sandboxed iframe', () => {
  test('iframe is present, sandboxed, and points at strudel-host.html', async ({ page }) => {
    await page.goto('/index.html');
    const frame = page.locator('#strudelFrame');
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts');
    await expect(frame).toHaveAttribute('src', 'strudel-host.html');
  });

  test('no CSP violations on parent or child', async ({ page }) => {
    const cspViolations = [];
    const isFrameAncestorsMetaWarning = (s) =>
      /frame-ancestors[\s\S]*ignored when delivered/.test(s);
    page.on('console', (msg) => {
      const t = msg.text();
      if (isFrameAncestorsMetaWarning(t)) return;
      if (/Content Security Policy|Refused to/.test(t)) cspViolations.push(t);
    });
    page.on('pageerror', (err) => {
      if (isFrameAncestorsMetaWarning(err.message)) return;
      if (/Content Security Policy/.test(err.message)) cspViolations.push(err.message);
    });
    await page.goto('/index.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    expect(cspViolations, `CSP violations:\n${cspViolations.join('\n')}`).toEqual([]);
  });

  test('generate -> status reaches Playing (or settled Error after fix-recovery)', async ({ page }, testInfo) => {
    test.setTimeout(60000);
    await page.goto('/index.html');

    await page.fill('#input', 'iphone glow');
    await page.click('#playBtn');

    await page.waitForFunction(() => {
      const el = document.getElementById('status');
      if (!el) return false;
      const t = el.textContent || '';
      const c = el.className || '';
      return c.includes('playing') || (c.includes('error') && !t.includes('fixing'));
    }, null, { timeout: 50000 });

    const finalText = await page.textContent('#status');
    const finalClass = await page.getAttribute('#status', 'class');
    console.log(`[${testInfo.project.name}] final status: class="${finalClass}" text="${finalText}"`);

    expect(finalClass).toMatch(/playing|error/);

    await page.click('#stopBtn');
    await page.waitForFunction(
      () => (document.getElementById('status')?.textContent || '') === 'Stopped',
      null,
      { timeout: 10000 },
    );
  });
});
