import { test, expect } from '@playwright/test';

// Runs in the chromium-autoplay-policy project, which launches Chromium with its
// real desktop autoplay policy (document-user-activation-required) instead of
// Playwright's permissive default. The editor lives in a sandboxed, opaque-origin
// iframe, so the parent's Play click alone cannot activate it: audio only starts
// because the iframe delegates autoplay and the host bridge initializes Strudel's
// audio on evaluate. Regression guard for a silent "Playing" state.
for (const path of ['/index.html', '/index.amber.html']) {
  test(`${path} starts sandboxed audio from a parent Play click`, async ({ page }) => {
    const states = [];
    const audioProblems = [];
    let workletsLoaded = false;
    page.on('console', (message) => {
      const text = message.text();
      if (text.startsWith('AUDIO_STATE ')) states.push(text.slice('AUDIO_STATE '.length));
      if (/AudioWorklets loaded/.test(text)) workletsLoaded = true;
      if (/not allowed to start|could not load AudioWorklet|AudioWorkletNode/i.test(text)) audioProblems.push(text);
    });
    // Observe the AudioContext from inside every frame without evaluating in the
    // iframe later: Playwright's evaluate carries a user gesture, which could
    // unlock the context by itself and mask the regression.
    await page.addInitScript(() => {
      const Native = window.AudioContext;
      if (!Native) return;
      window.AudioContext = class extends Native {
        constructor(...args) {
          super(...args);
          console.log('AUDIO_STATE ' + this.state);
          this.addEventListener('statechange', () => console.log('AUDIO_STATE ' + this.state));
        }
      };
    });

    await page.goto(path);
    await page.locator('#input').fill('warm summer rain over a quiet city');
    await page.locator('#playBtn').click();

    const status = page.locator('#status');
    await expect(status).toHaveClass(/playing/, { timeout: 45_000 });
    // The host reports the audio state shortly after evaluation completes.
    await page.waitForTimeout(1500);
    await expect(status).toHaveText('Playing');
    await expect(status).not.toHaveClass(/audio-blocked/);
    expect(states.at(-1), 'AudioContext inside the sandboxed editor').toBe('running');
    expect(workletsLoaded, 'superdough AudioWorklet effects loaded under the host CSP').toBe(true);
    expect(audioProblems).toEqual([]);
  });
}

// A browser that does not honor the autoplay delegation (or a stale index.html
// without it) leaves the context suspended. The host must not call that
// "blocked" before its grace period, must then show its own Enable sound
// button, and a click on that button (a gesture inside the sandbox) must start
// audio and clear the parent status.
test('/index.html recovers from a blocked context through the in-editor Enable sound button', async ({ page }) => {
  await page.route('**/index.html', async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(' allow="autoplay"', '');
    await route.fulfill({ response, body, headers: { ...response.headers(), 'content-type': 'text/html; charset=utf-8' } });
  });
  const states = [];
  page.on('console', (message) => {
    const text = message.text();
    if (text.startsWith('AUDIO_STATE ')) states.push(text.slice('AUDIO_STATE '.length));
  });
  await page.addInitScript(() => {
    const Native = window.AudioContext;
    if (!Native) return;
    window.AudioContext = class extends Native {
      constructor(...args) {
        super(...args);
        console.log('AUDIO_STATE ' + this.state);
        this.addEventListener('statechange', () => console.log('AUDIO_STATE ' + this.state));
      }
    };
  });

  await page.goto('/index.html');
  await expect(page.locator('#strudelFrame')).not.toHaveAttribute('allow', 'autoplay');
  await page.locator('#input').fill('warm summer rain over a quiet city');
  await page.locator('#playBtn').click();

  const status = page.locator('#status');
  await expect(status).toHaveClass(/playing/, { timeout: 45_000 });
  await page.waitForTimeout(1500);
  await expect(status, 'no blocked verdict before the grace period').not.toHaveClass(/audio-blocked/);
  await expect(status).toHaveClass(/audio-blocked/, { timeout: 10_000 });
  await expect(status).toContainText('Enable sound');
  expect(states.at(-1)).toBe('suspended');

  const unlock = page.frameLocator('#strudelFrame').locator('#audioUnlock');
  await expect(unlock).toBeVisible();
  await unlock.click();

  await expect(status).toHaveClass(/playing/, { timeout: 10_000 });
  await expect(status).toHaveText('Playing');
  await expect(unlock).toBeHidden();
  expect(states.at(-1)).toBe('running');
});
