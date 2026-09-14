import { test, expect } from '@playwright/test';

async function installEditorSpy(page, initialCode = '$: s("initial")') {
  await page.evaluate((code) => {
    window.__editorCode = code;
    window.__editorWrites = [];
    editorPort.getCode = async () => window.__editorCode;
    editorPort.replaceAndEvaluate = async (nextCode) => {
      window.__editorCode = nextCode;
      window.__editorWrites.push(nextCode);
    };
    editorPort.evaluate = async () => {};
    editorPort.stop = async () => {
      window.__stopCount = (window.__stopCount || 0) + 1;
    };
  }, initialCode);
}

for (const path of ['/index.html', '/index.amber.html']) {
  test(`${path} focused variations remain executable after AI fallback while a key stays configured`, async ({ page }) => {
    await page.goto(path);
    await installEditorSpy(page);
    await page.evaluate(() => {
      saveApiKey('session-key', 'gemini', false);
      generateWithAI = async () => { throw new Error('synthetic provider outage'); };
    });

    await page.locator('#input').fill('fallback variation must remain interactive');
    await page.locator('#playBtn').click();
    await expect(page.locator('#status')).toHaveClass(/playing/);
    await expect(page.locator('#variationPanel')).toBeVisible();
    const melody = page.locator('[data-variation="melody"]');
    await expect(melody).toBeVisible();
    await expect(melody).toBeEnabled();
    expect(await page.evaluate(() => getApiKey('gemini'))).toBe('session-key');
    expect(await page.evaluate(() => lastCompositionPlan?.source)).toBe('algorithmic');

    const fallbackCode = await page.evaluate(() => window.__editorCode);
    await melody.click();
    await expect.poll(() => page.evaluate(() => window.__editorWrites.length)).toBe(2);

    const result = await page.evaluate(() => ({
      code: window.__editorCode,
      writes: window.__editorWrites,
    }));
    expect(result.code).not.toBe(fallbackCode);
    expect(result.writes[1]).not.toBe(result.writes[0]);
  });

  test(`${path} Stop prevents a delayed AI generation from writing code`, async ({ page }) => {
    await page.goto(path);
    await installEditorSpy(page);
    await page.evaluate(() => {
      saveApiKey('session-key', 'gemini', false);
      generateWithAI = () => new Promise((resolve) => { window.__resolveGeneration = resolve; });
    });

    await page.locator('#input').fill('a delayed AI composition');
    await page.locator('#playBtn').click();
    await page.waitForFunction(() => typeof window.__resolveGeneration === 'function');
    await page.locator('#stopBtn').click();
    await expect(page.locator('#status')).toHaveText('Stopped');
    await page.evaluate(() => window.__resolveGeneration('$: s("stale-generation")'));
    await page.waitForTimeout(50);

    expect(await page.evaluate(() => window.__editorWrites)).toEqual([]);
    await expect(page.locator('#status')).toHaveText('Stopped');
  });

  test(`${path} empty Edit is a no-op and does not cancel delayed AI generation`, async ({ page }) => {
    await page.goto(path);
    await installEditorSpy(page);
    await page.evaluate(() => {
      saveApiKey('session-key', 'gemini', false);
      generateWithAI = () => new Promise((resolve) => { window.__resolveGeneration = resolve; });
    });
    await page.locator('#input').fill('generation survives an empty edit');
    await page.locator('#playBtn').click();
    await page.waitForFunction(() => typeof window.__resolveGeneration === 'function');

    await page.evaluate(() => {
      document.querySelector('#editInput').value = '   ';
      document.querySelector('#editApply').dispatchEvent(new MouseEvent('click', { bubbles: true }));
      window.__resolveGeneration('$: s("completed-generation")');
    });
    await expect(page.locator('#status')).toHaveClass(/playing/);

    expect(await page.evaluate(() => window.__editorCode)).toContain('completed-generation');
    await expect(page.locator('#playBtn')).toBeEnabled();
    await expect(page.locator('#regenBtn')).toBeEnabled();
    await expect(page.locator('#editApply')).toBeEnabled();
  });

  test(`${path} non-empty Edit takes ownership without leaving controls locked`, async ({ page }) => {
    await page.goto(path);
    await installEditorSpy(page);
    await page.evaluate(() => {
      saveApiKey('session-key', 'gemini', false);
      generateWithAI = () => new Promise((resolve) => { window.__resolveGeneration = resolve; });
      callLLM = async () => '$: s("edit-takes-ownership")';
    });
    await page.locator('#input').fill('generation superseded by an edit');
    await page.locator('#playBtn').click();
    await page.waitForFunction(() => typeof window.__resolveGeneration === 'function');

    await page.evaluate(() => {
      document.querySelector('#editInput').value = 'replace the current sound';
      document.querySelector('#editApply').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await expect.poll(() => page.evaluate(() => window.__editorCode)).toContain('edit-takes-ownership');
    await page.evaluate(() => window.__resolveGeneration('$: s("stale-generation")'));
    await page.waitForTimeout(50);

    expect(await page.evaluate(() => window.__editorCode)).toContain('edit-takes-ownership');
    await expect(page.locator('#playBtn')).toBeEnabled();
    await expect(page.locator('#regenBtn')).toBeEnabled();
    await expect(page.locator('#editApply')).toBeEnabled();
  });

  test(`${path} a delayed auto-fix cannot overwrite newer code`, async ({ page }) => {
    await page.goto(path);
    await installEditorSpy(page, '$: s("broken-old")');
    await page.evaluate(() => {
      saveApiKey('session-key', 'gemini', false);
      lastEvaluatedCode = '$: s("broken-old")';
      fixWithLLM = () => new Promise((resolve) => { window.__resolveFix = resolve; });
      window.__fixTask = editorPort.evalErrorHandler('synthetic failure');
    });
    await page.waitForFunction(() => typeof window.__resolveFix === 'function');
    await page.evaluate(async () => {
      await setCodeAndPlay('$: s("newer-user-code")');
      window.__resolveFix('$: s("stale-fixed-code")');
      await window.__fixTask;
    });

    expect(await page.evaluate(() => window.__editorCode)).toContain('newer-user-code');
    expect(await page.evaluate(() => window.__editorWrites)).not.toContain('$: s("stale-fixed-code")');
  });

  test(`${path} a delayed mood refinement cannot overwrite newer code`, async ({ page }) => {
    await page.goto(path);
    await installEditorSpy(page, '$: s("before-mood")');
    await page.evaluate(() => {
      saveApiKey('session-key', 'gemini', false);
      callLLM = () => new Promise((resolve) => { window.__resolveMood = resolve; });
    });
    await page.evaluate(() => {
      document.querySelector('[data-dir="make it dreamy and floating"]')
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForFunction(() => typeof window.__resolveMood === 'function');
    await page.evaluate(async () => {
      const operation = beginExclusiveOperation();
      await setCodeAndPlay('$: s("newer-user-code")', operation);
      window.__resolveMood('$: s("stale-mood-code")');
    });
    await page.waitForTimeout(50);

    expect(await page.evaluate(() => window.__editorCode)).toContain('newer-user-code');
    expect(await page.evaluate(() => window.__editorWrites)).not.toContain('$: s("stale-mood-code")');
  });

  test(`${path} a delayed natural-language edit cannot overwrite newer code`, async ({ page }) => {
    await page.goto(path);
    await installEditorSpy(page, '$: s("before-edit")');
    await page.evaluate(() => {
      saveApiKey('session-key', 'gemini', false);
      callLLM = () => new Promise((resolve) => { window.__resolveEdit = resolve; });
    });
    await page.evaluate(() => {
      document.querySelector('#editInput').value = 'make one minimal change';
      document.querySelector('#editApply').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await page.waitForFunction(() => typeof window.__resolveEdit === 'function');
    await page.evaluate(async () => {
      const operation = beginExclusiveOperation();
      await setCodeAndPlay('$: s("newer-user-code")', operation);
      window.__resolveEdit('$: s("stale-edit-code")');
    });
    await page.waitForTimeout(50);

    expect(await page.evaluate(() => window.__editorCode)).toContain('newer-user-code');
    expect(await page.evaluate(() => window.__editorWrites)).not.toContain('$: s("stale-edit-code")');
  });
}
