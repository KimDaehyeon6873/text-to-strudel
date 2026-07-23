import { test, expect } from '@playwright/test';

for (const path of ['/index.html', '/index.amber.html']) {
  test(`${path} generates, evaluates, plays, and stops successfully`, async ({ page }) => {
    const cspErrors = [];
    const pageErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error' &&
          /content security policy|refused to (?:load|execute|connect)|eval(?:uation)? error/i.test(message.text())) {
        cspErrors.push(message.text());
      }
    });
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(path);
    await expect(page.locator('#strudelFrame')).toHaveAttribute('sandbox', 'allow-scripts');

    await page.locator('#input').fill('warm summer rain over a quiet city');
    await page.locator('#playBtn').click();

    const status = page.locator('#status');
    await expect(status).toHaveClass(/playing/, { timeout: 45_000 });
    await expect(status).toContainText(/^Playing/);
    await expect(status).not.toHaveClass(/error/);
    await page.waitForTimeout(500);
    await expect(status).toHaveClass(/playing/);
    expect(cspErrors).toEqual([]);
    expect(pageErrors).toEqual([]);

    await page.locator('#stopBtn').click();
    await expect(status).toHaveText('Stopped');
  });
}
