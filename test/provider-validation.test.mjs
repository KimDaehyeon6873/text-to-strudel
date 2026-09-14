import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFullApp } from './helpers/load-app.mjs';

function successFetch(payload) {
  return async () => ({ ok: true, status: 200, json: async () => payload });
}

const generated = '```js\n$: s("bd sd")\n```';

test('Claude success response passes through validateAndFix without a ReferenceError', async () => {
  const ctx = loadFullApp({ fetchImpl: successFetch({ content: [{ text: generated }] }) });
  const result = await ctx.generateWithClaude('rain', 'jazz', 'test-key');
  assert.match(result, /^setcpm\(90\/4\)/);
  assert.match(result, /\$: s\("bd sd"\)/);
});

test('Gemini success response passes through validateAndFix without a ReferenceError', async () => {
  const ctx = loadFullApp({ fetchImpl: successFetch({ candidates: [{ content: { parts: [{ text: generated }] } }] }) });
  const result = await ctx.generateWithGemini('rain', 'jazz', 'test-key');
  assert.match(result, /^setcpm\(90\/4\)/);
  assert.match(result, /\$: s\("bd sd"\)/);
});

test('OpenAI success response passes through validateAndFix without a ReferenceError', async () => {
  const ctx = loadFullApp({ fetchImpl: successFetch({ choices: [{ message: { content: generated } }] }) });
  const result = await ctx.generateWithOpenAI('rain', 'jazz', 'test-key');
  assert.match(result, /^setcpm\(90\/4\)/);
  assert.match(result, /\$: s\("bd sd"\)/);
});

for (const [provider, invoke, malformedPayloads] of [
  [
    'Claude',
    (ctx) => ctx.generateWithClaude('rain', 'jazz', 'test-key'),
    [{}, { content: [] }, { content: [{ text: '' }] }, { content: [{ text: 42 }] }],
  ],
  [
    'Gemini',
    (ctx) => ctx.generateWithGemini('rain', 'jazz', 'test-key'),
    [{}, { candidates: [] }, { candidates: [{ content: { parts: [] } }] }, { candidates: [{ content: { parts: [{ text: 42 }] } }] }],
  ],
  [
    'OpenAI',
    (ctx) => ctx.generateWithOpenAI('rain', 'jazz', 'test-key'),
    [{}, { choices: [] }, { choices: [{ message: {} }] }, { choices: [{ message: { content: 42 } }] }],
  ],
]) {
  test(`${provider} rejects every malformed successful generation schema`, async () => {
    for (const payload of malformedPayloads) {
      const ctx = loadFullApp({ fetchImpl: successFetch(payload) });
      await assert.rejects(invoke(ctx), /empty|malformed/i, JSON.stringify(payload));
    }
  });
}
