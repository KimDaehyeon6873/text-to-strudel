import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFullApp } from './helpers/load-app.mjs';

test('saveApiKey keeps session-mode keys only in tab memory by default', () => {
  const context = loadFullApp();

  context.saveApiKey('session-secret', 'gemini');

  assert.equal(context.getApiKey('gemini'), 'session-secret');
  assert.equal(context.localStorage.getItem('tts_api_key_gemini'), null);
  assert.equal(context.sessionStorage.getItem('tts_api_key_gemini'), null);
  assert.equal(context.window.name, '');
});

test('saveApiKey persists a key only when persistence is explicitly enabled', () => {
  const context = loadFullApp();

  context.saveApiKey('persisted-secret', 'openai', true);

  assert.equal(context.localStorage.getItem('tts_api_key_openai'), 'persisted-secret');
  assert.equal(context.localStorage.getItem('tts_persist_openai'), '1');
  assert.equal(context.getApiKeyPersist('openai'), true);
});

test('switching a persisted key to session mode removes its disk copy', () => {
  const context = loadFullApp({
    localStorage: {
      tts_api_key_claude: 'old-disk-secret',
      tts_persist_claude: '1',
    },
  });

  context.saveApiKey('memory-secret', 'claude', false);

  assert.equal(context.getApiKey('claude'), 'memory-secret');
  assert.equal(context.localStorage.getItem('tts_api_key_claude'), null);
  assert.equal(context.localStorage.getItem('tts_persist_claude'), null);
});

test('clearing a key removes both memory and persisted state', () => {
  const context = loadFullApp();
  context.saveApiKey('temporary', 'gemini');
  context.saveApiKey('persisted', 'gemini', true);

  context.saveApiKey('', 'gemini');

  assert.equal(context.getApiKey('gemini'), '');
  assert.equal(context.localStorage.getItem('tts_api_key_gemini'), null);
  assert.equal(context.localStorage.getItem('tts_persist_gemini'), null);
});

test('legacy localStorage keys remain persisted and are labelled truthfully', () => {
  const context = loadFullApp({
    localStorage: { tts_api_key_gemini: 'legacy-secret' },
  });

  assert.equal(context.localStorage.getItem('tts_api_key_gemini'), 'legacy-secret');
  assert.equal(context.localStorage.getItem('tts_persist_gemini'), '1');
  assert.equal(context.getApiKey('gemini'), 'legacy-secret');
});

test('legacy verified flags migrate to a timestamp without moving the key', () => {
  const before = Date.now();
  const context = loadFullApp({
    localStorage: {
      tts_api_key_openai: 'legacy-secret',
      tts_verified_openai: '1',
    },
  });

  assert.equal(context.localStorage.getItem('tts_api_key_openai'), 'legacy-secret');
  assert.equal(context.localStorage.getItem('tts_verified_openai'), null);
  assert.ok(Number(context.localStorage.getItem('tts_verified_at_openai')) >= before);
});
