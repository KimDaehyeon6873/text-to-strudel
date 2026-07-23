import { test, expect } from '@playwright/test';

const themes = ['/index.html', '/index.amber.html'];
const viewports = [
  { name: '320px portrait', width: 320, height: 640 },
  { name: '320px landscape', width: 640, height: 320 },
];

for (const path of themes) {
  for (const viewport of viewports) {
    test(`${path} has reachable controls and no overflow at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(path);

      const dimensions = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }));
      expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.viewportWidth);

      for (const selector of ['#input', '#playBtn', '#runBtn', '#stopBtn']) {
        const control = page.locator(selector);
        await control.scrollIntoViewIfNeeded();
        await expect(control).toBeVisible();
        await expect(control).toBeEnabled();
        const box = await control.boundingBox();
        expect(box, `${selector} must have a rendered bounding box`).not.toBeNull();
        expect(box.x, `${selector} left edge`).toBeGreaterThanOrEqual(0);
        expect(box.y, `${selector} top edge`).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, `${selector} right edge`).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height, `${selector} bottom edge`).toBeLessThanOrEqual(viewport.height);
      }

      await page.locator('#apiSettings').evaluate((element) => { element.open = true; });
      await page.locator('#apiPersist').scrollIntoViewIfNeeded();
      await expect(page.locator('#apiPersist')).toBeVisible();
      const persistBox = await page.locator('#apiPersist').boundingBox();
      expect(persistBox).not.toBeNull();
      expect(persistBox.x).toBeGreaterThanOrEqual(0);
      expect(persistBox.y).toBeGreaterThanOrEqual(0);
      expect(persistBox.x + persistBox.width).toBeLessThanOrEqual(viewport.width);
      expect(persistBox.y + persistBox.height).toBeLessThanOrEqual(viewport.height);
    });
  }
}
