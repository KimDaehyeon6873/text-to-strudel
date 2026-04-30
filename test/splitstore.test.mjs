import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function makeFakeEl(id) {
  return {
    id, textContent: '', value: '', className: '', open: false, disabled: false,
    placeholder: '', style: {},
    classList: {
      _set: new Set(),
      add(...c) { c.forEach(x => this._set.add(x)); },
      remove(...c) { c.forEach(x => this._set.delete(x)); },
      toggle(c, force) { if (force === true || (force === undefined && !this._set.has(c))) this._set.add(c); else this._set.delete(c); },
      contains(c) { return this._set.has(c); },
    },
    dataset: {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    querySelector() { return null; }, querySelectorAll() { return []; }, contains() { return false; },
    click() {}, setAttribute() {}, hasAttribute() { return false; },
    getAttribute() { return null; }, removeAttribute() {},
    setCode() {}, evaluate() {}, stop() {},
  };
}

function makeStorage() {
  const map = new Map();
  return {
    getItem(k) { return map.has(k) ? map.get(k) : null; },
    setItem(k, v) { map.set(k, String(v)); },
    removeItem(k) { map.delete(k); },
    clear() { map.clear(); },
    key(i) { return [...map.keys()][i] || null; },
    get length() { return map.size; },
    _map: map,
  };
}

function makeContext({ initialWindowName = '', initialLocalStorage = {} } = {}) {
  const els = new Map();
  const fakeEl = (id) => { if (!els.has(id)) els.set(id, makeFakeEl(id)); return els.get(id); };
  const document = {
    getElementById: fakeEl, querySelector: () => null, querySelectorAll: () => [],
    addEventListener() {}, dispatchEvent() { return true; },
    createElement: () => makeFakeEl('tmp'),
  };
  const ls = makeStorage();
  for (const [k, v] of Object.entries(initialLocalStorage)) ls.setItem(k, v);
  const ctx = {
    document,
    localStorage: ls,
    sessionStorage: makeStorage(),
    window: { name: initialWindowName },
    navigator: { userAgent: 'node-test' },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    console,
    CustomEvent: class { constructor(t, d) { this.type = t; this.detail = d && d.detail; } },
    Math, JSON, Object, Array, Set, Map, Date, String, Number, RegExp, Error,
    parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent,
    Uint8Array,
    TextEncoder, TextDecoder,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    crypto: { getRandomValues: (arr) => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256); return arr; } },
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}

test('splitStore: round-trips a normal ASCII secret', () => {
  const ctx = makeContext();
  ctx.setSplitKey('claude', 'sk-ant-abc');
  assert.equal(ctx.getSplitKey('claude'), 'sk-ant-abc');
});

test('splitStore: round-trips a UTF-8 multi-byte secret', () => {
  const ctx = makeContext();
  ctx.setSplitKey('claude', 'sk-Ω-key-한글');
  assert.equal(ctx.getSplitKey('claude'), 'sk-Ω-key-한글');
});

test('splitStore: clearSplitKey removes both halves', () => {
  const ctx = makeContext();
  ctx.setSplitKey('gemini', 'foo');
  ctx.clearSplitKey('gemini');
  assert.equal(ctx.getSplitKey('gemini'), '');
  assert.equal(ctx.sessionStorage.getItem('tts_split_gemini'), null);
});

test('splitStore: missing window.name share returns "" and never throws', () => {
  const ctx = makeContext();
  ctx.setSplitKey('gemini', 'foo');
  const outer = JSON.parse(ctx.window.name);
  delete outer.tts.k_gemini;
  ctx.window.name = JSON.stringify(outer);
  assert.equal(ctx.getSplitKey('gemini'), '');
});

test('splitStore: missing sessionStorage half returns ""', () => {
  const ctx = makeContext();
  ctx.setSplitKey('gemini', 'foo');
  ctx.sessionStorage.removeItem('tts_split_gemini');
  assert.equal(ctx.getSplitKey('gemini'), '');
});

test('splitStore: length-mismatched halves return "" and self-clear', () => {
  const ctx = makeContext();
  ctx.setSplitKey('gemini', 'foobar');
  ctx.sessionStorage.setItem('tts_split_gemini', ctx.btoa('xx'));
  assert.equal(ctx.getSplitKey('gemini'), '');
  const ns = JSON.parse(ctx.window.name).tts || {};
  assert.equal(ns.k_gemini, undefined, 'window.name share should be cleared');
  assert.equal(ctx.sessionStorage.getItem('tts_split_gemini'), null, 'sessionStorage half should be cleared');
});

test('splitStore: preserves foreign window.name namespaces', () => {
  const ctx = makeContext({ initialWindowName: '{"otherSite":{"x":"y"}}' });
  ctx.setSplitKey('claude', 'sk-ant-abc');
  const outer = JSON.parse(ctx.window.name);
  assert.equal(outer.otherSite.x, 'y', 'foreign namespace must survive');
  assert.equal(ctx.getSplitKey('claude'), 'sk-ant-abc');
});

test('splitStore: multi-provider isolation', () => {
  const ctx = makeContext();
  ctx.setSplitKey('gemini', 'gem-key');
  ctx.setSplitKey('openai', 'oai-key');
  assert.equal(ctx.getSplitKey('gemini'), 'gem-key');
  assert.equal(ctx.getSplitKey('openai'), 'oai-key');
  ctx.clearSplitKey('gemini');
  assert.equal(ctx.getSplitKey('gemini'), '');
  assert.equal(ctx.getSplitKey('openai'), 'oai-key');
});

test('saveApiKey persist=false uses splitStore (no localStorage api key)', () => {
  const ctx = makeContext();
  ctx.saveApiKey('foo', 'claude', false);
  assert.equal(ctx.localStorage.getItem('tts_api_key_claude'), null);
  assert.ok(ctx.sessionStorage.getItem('tts_split_claude'), 'split half present');
  assert.equal(ctx.getSplitKey('claude'), 'foo');
  assert.equal(ctx.getApiKey('claude'), 'foo');
});

test('saveApiKey persist=true uses localStorage only (splitStore stays empty)', () => {
  const ctx = makeContext();
  ctx.saveApiKey('foo', 'claude', true);
  assert.equal(ctx.localStorage.getItem('tts_api_key_claude'), 'foo');
  assert.equal(ctx.sessionStorage.getItem('tts_split_claude'), null);
  assert.equal(ctx.getSplitKey('claude'), '');
  assert.equal(ctx.getApiKey('claude'), 'foo');
});

test('migration v1: legacy session-only key moves to splitStore + verify flag converts', () => {
  const before = Date.now();
  const ctx = makeContext({
    initialLocalStorage: {
      tts_api_key_gemini: 'key1',
      tts_verified_gemini: '1',
    },
  });
  assert.equal(ctx.localStorage.getItem('tts_api_key_gemini'), null, 'legacy LS api key removed');
  assert.equal(ctx.getSplitKey('gemini'), 'key1', 'splitStore now holds the key');
  const ts = ctx.localStorage.getItem('tts_verified_at_gemini');
  assert.ok(ts && /^\d+$/.test(ts), 'verified_at should be a numeric string');
  assert.ok(parseInt(ts, 10) >= before, 'timestamp should be recent');
  assert.equal(ctx.localStorage.getItem('tts_verified_gemini'), null, 'legacy boolean removed');
  assert.equal(ctx.localStorage.getItem('tts_migrated_v1'), '1', 'migration flag set');
});

test('migration v1: idempotent — running again does nothing destructive', () => {
  const ctx = makeContext({
    initialLocalStorage: {
      tts_api_key_gemini: 'key1',
    },
  });
  const tsBefore = ctx.localStorage.getItem('tts_verified_at_gemini');
  const ssBefore = ctx.sessionStorage.getItem('tts_split_gemini');
  ctx._migrateV1();
  ctx._migrateV1();
  assert.equal(ctx.localStorage.getItem('tts_migrated_v1'), '1');
  assert.equal(ctx.localStorage.getItem('tts_verified_at_gemini'), tsBefore);
  assert.equal(ctx.sessionStorage.getItem('tts_split_gemini'), ssBefore);
  assert.equal(ctx.getSplitKey('gemini'), 'key1');
  assert.equal(ctx.localStorage.getItem('tts_api_key_gemini'), null);
});
