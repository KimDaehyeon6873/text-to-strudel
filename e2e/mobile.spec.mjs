// Playwright device emulation sets viewport, devicePixelRatio,
// touch flag, and user-agent string. On Linux/macOS CI the underlying
// browser binary is still the desktop one, so this catches:
//   - layout overflow / wrong widths
//   - missing controls / off-screen elements
//   - CSS media-query miss
// It does NOT prove behaviour on real iOS Safari (which has its own
// audio autoplay policy, gesture rules, and WebKit version drift).
// Real-device audio + touch QA remains a human pre-release check.

import { test, expect, devices } from '@playwright/test';

const PAGES = ['/index.html', '/index.amber.html'];
// Strip defaultBrowserType from each device profile — Playwright forbids
// changing it inside test.describe(...).use(...). The mobile project pins
// chromium at the project level; we only want viewport / DPR / touch /
// user-agent overrides per-device.
const stripBrowser = (d) => {
  // eslint-disable-next-line no-unused-vars
  const { defaultBrowserType, ...rest } = d;
  return rest;
};
const PROFILES = [
  { name: 'iPhone 14', device: stripBrowser(devices['iPhone 14']) },
  { name: 'Pixel 7',   device: stripBrowser(devices['Pixel 7']) },
];

for (const profile of PROFILES) {
  for (const path of PAGES) {
    test.describe(`mobile ${profile.name} ${path}`, () => {
      test.use({ ...profile.device });
      test('page loads with no horizontal overflow + key controls visible', async ({ page }) => {
        const violations = [];
        page.on('console', (msg) => {
          const t = msg.text();
          if (msg.type() === 'error' && /Content Security Policy|Refused to/.test(t)
              && !/frame-ancestors[\s\S]*ignored when delivered/i.test(t)) {
            violations.push(t);
          }
        });

        await page.goto(path);
        // Wait for the iframe and editor to settle.
        await page.waitForSelector('#strudelFrame', { state: 'attached' });
        // No horizontal scroll on body.
        const overflowX = await page.evaluate(() =>
          document.documentElement.scrollWidth > document.documentElement.clientWidth);
        expect(overflowX, 'page should not scroll horizontally').toBe(false);
        // Critical controls reachable above the fold-equivalent (visible without iframe).
        await expect(page.locator('#playBtn')).toBeVisible();
        await expect(page.locator('#input')).toBeVisible();
        await expect(page.locator('#apiPersist')).toBeAttached();
        // No CSP violations triggered by initial load.
        await page.waitForTimeout(500);
        expect(violations, `unexpected CSP violations: ${violations.join(' | ')}`).toEqual([]);
      });
    });
  }
}
