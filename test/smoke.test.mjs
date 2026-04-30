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
    id,
    textContent: '',
    value: '',
    className: '',
    open: false,
    disabled: false,
    placeholder: '',
    style: {},
    classList: {
      _set: new Set(),
      add(...c) { c.forEach(x => this._set.add(x)); },
      remove(...c) { c.forEach(x => this._set.delete(x)); },
      toggle(c, force) {
        if (force === true || (force === undefined && !this._set.has(c))) this._set.add(c);
        else this._set.delete(c);
      },
      contains(c) { return this._set.has(c); },
    },
    dataset: {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return true; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    contains() { return false; },
    click() {},
    setAttribute() {},
    hasAttribute() { return false; },
    getAttribute() { return null; },
    removeAttribute() {},
    setCode() {},
    evaluate() {},
    stop() {},
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
  };
}

function makeContext() {
  const els = new Map();
  const fakeEl = (id) => {
    if (!els.has(id)) els.set(id, makeFakeEl(id));
    return els.get(id);
  };
  const document = {
    getElementById: fakeEl,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    dispatchEvent() { return true; },
    createElement: () => makeFakeEl('tmp'),
  };
  const ctx = {
    document,
    localStorage: makeStorage(),
    sessionStorage: makeStorage(),
    window: {},
    navigator: { userAgent: 'node-test' },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    console,
    CustomEvent: class { constructor(t, d) { this.type = t; this.detail = d && d.detail; } },
    Math, JSON, Object, Array, Set, Map, Date, String, Number, RegExp, Error,
    parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent,
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);
  return ctx;
}

const ctx = makeContext();

test('analyzeText: empty input returns midpoint defaults', () => {
  const a = ctx.analyzeText('');
  assert.equal(a.energy, 0.5);
  assert.equal(a.brightness, 0.5);
});

test('analyzeText: English produces finite values in [0,1]', () => {
  const a = ctx.analyzeText('hello world');
  for (const k of ['energy', 'brightness', 'weight', 'space', 'complexity']) {
    assert.ok(Number.isFinite(a[k]), `${k} should be finite`);
    assert.ok(a[k] >= 0 && a[k] <= 1, `${k} should be in [0,1] (got ${a[k]})`);
  }
});

test('analyzeText: Hangul input produces non-zero brightness (U20 fix)', () => {
  const a = ctx.analyzeText('안녕하세요 세상');
  assert.ok(Number.isFinite(a.brightness), 'brightness must be finite for Hangul');
  assert.ok(a.brightness > 0, `Hangul brightness should not be 0 (got ${a.brightness})`);
  assert.ok(a.brightness <= 1, 'brightness must be clamped to <= 1');
});

test('analyzeText: pure-Korean and pure-English both yield finite, non-NaN', () => {
  const ko = ctx.analyzeText('자장가 같은 봄밤');
  const en = ctx.analyzeText('lullaby spring night');
  for (const a of [ko, en]) {
    for (const v of Object.values(a)) {
      assert.ok(Number.isFinite(v));
    }
  }
});

test('createRNG: deterministic across calls with same seed', () => {
  const r1 = ctx.createRNG('seed-x');
  const r2 = ctx.createRNG('seed-x');
  for (let i = 0; i < 50; i++) {
    assert.equal(r1(), r2());
  }
});

test('createRNG: different seeds diverge', () => {
  const r1 = ctx.createRNG('alpha');
  const r2 = ctx.createRNG('beta');
  let same = 0;
  for (let i = 0; i < 20; i++) if (r1() === r2()) same++;
  assert.ok(same < 5, 'unrelated seeds should mostly differ');
});

test('stripFences: removes triple-backtick code fences', () => {
  assert.equal(ctx.stripFences('```js\nfoo\n```'), 'foo');
  assert.equal(ctx.stripFences('```\nbar\n```'), 'bar');
  assert.equal(ctx.stripFences('plain text'), 'plain text');
});

test('stripFnCall: handles nested parentheses (C5)', () => {
  const out = ctx.stripFnCall('a.foo(x.bar(1,2)).baz()', 'foo');
  assert.equal(out, 'a.baz()');
});

test('stripFnCall: leaves unrelated calls alone', () => {
  const out = ctx.stripFnCall('a.foo(1).bar(2)', 'baz');
  assert.equal(out, 'a.foo(1).bar(2)');
});

test('nameOnlyInsideStrings: detects string-only mentions', () => {
  assert.equal(ctx.nameOnlyInsideStrings('"foo bar"', 'foo'), true);
  assert.equal(ctx.nameOnlyInsideStrings('foo("bar")', 'foo'), false);
  assert.equal(ctx.nameOnlyInsideStrings('s("foo")\nfoo()', 'foo'), false);
});

test('tryFixFromError: "X is not defined" comments out real calls', () => {
  const code = 'a\nfoo()\nb';
  const fixed = ctx.tryFixFromError(code, 'foo is not defined');
  assert.match(fixed, /\[auto-disabled: foo/);
});

test('tryFixFromError: preserves string mentions (C5 regression guard)', () => {
  const code = 's("foo bar")';
  const fixed = ctx.tryFixFromError(code, 'foo is not defined');
  assert.match(fixed, /s\("foo bar"\)/, 'string mentions must not be disabled');
  assert.doesNotMatch(fixed, /auto-disabled/, 'no real call to disable here');
});

test('tryFixFromError: setBPM -> setcpm rewrite', () => {
  const code = 'setBPM(120)';
  const fixed = ctx.tryFixFromError(code, 'setBPM is not defined');
  assert.match(fixed, /setcpm\(120\/4\)/);
});

test('tryFixFromError: line(a,b,n) -> saw.range', () => {
  const code = 'x.lpf(line(100,2000,8))';
  const fixed = ctx.tryFixFromError(code, 'line is not defined');
  assert.match(fixed, /saw\.range\(100,2000\)\.slow\(8\)/);
});

test('tryFixFromError: ".X is not a function" with known sub uses replacement', () => {
  const code = 'x.stutter(2)';
  const fixed = ctx.tryFixFromError(code, 'stutter is not a function');
  assert.match(fixed, /\.ply\(/);
});

test('normalize: rewrites gm_pad numbered names', () => {
  assert.match(ctx.normalize('s("gm_pad_1")'), /gm_pad_new_age/);
  assert.match(ctx.normalize('s("gm_pad_8_x")'), /gm_pad_sweep/);
});

test('algoRefine: faster increments BPM by TUNING.BPM.step', () => {
  const out = ctx.algoRefine('setcpm(120/4)', 'faster');
  assert.match(out, /setcpm\(128\/4\)/);
});

test('algoRefine: clamps BPM at upper bound', () => {
  const out = ctx.algoRefine('setcpm(395/4)', 'faster');
  assert.match(out, /setcpm\(400\/4\)/);
});

test('algoRefine: clamps BPM at lower bound', () => {
  const out = ctx.algoRefine('setcpm(45/4)', 'slower');
  assert.match(out, /setcpm\(40\/4\)/);
});

test('algoRefine: louder scales gain factor with clamp', () => {
  const out = ctx.algoRefine('.gain(0.50)', 'louder');
  const m = out.match(/\.gain\(([\d.]+)\)/);
  assert.ok(m, 'gain replacement should match');
  const v = parseFloat(m[1]);
  assert.ok(v > 0.5 && v <= 1.0, `gain should increase but stay clamped (got ${v})`);
});

test('algoRefine: louder clamps at upper bound', () => {
  const out = ctx.algoRefine('.gain(0.95)', 'louder');
  const m = out.match(/\.gain\(([\d.]+)\)/);
  assert.equal(parseFloat(m[1]), 1.0);
});

test('algoRefine: unknown direction returns code unchanged', () => {
  const code = 'x.foo()';
  assert.equal(ctx.algoRefine(code, 'no-such-direction'), code);
});

test('determinism: same text + genre + seed -> identical generateCode (R30)', () => {
  ctx.seedCounter = 0;
  const a = ctx.generateCode('iphone glow', 'edm');
  ctx.seedCounter = 0;
  const b = ctx.generateCode('iphone glow', 'edm');
  assert.equal(a, b);
});

test('determinism: different seed -> different output', () => {
  ctx.seedCounter = 0;
  const a = ctx.generateCode('iphone glow', 'edm');
  ctx.seedCounter = 1;
  const b = ctx.generateCode('iphone glow', 'edm');
  assert.notEqual(a, b);
});

test('saveApiKey: persist=false stores in sessionStorage only', () => {
  ctx.saveApiKey('test-key-1', 'gemini', false);
  assert.equal(ctx.sessionStorage.getItem('tts_api_key_gemini'), 'test-key-1');
  assert.equal(ctx.localStorage.getItem('tts_api_key_gemini'), null);
  ctx.saveApiKey('', 'gemini');
});

test('saveApiKey: persist=true stores in both', () => {
  ctx.saveApiKey('test-key-2', 'openai', true);
  assert.equal(ctx.sessionStorage.getItem('tts_api_key_openai'), 'test-key-2');
  assert.equal(ctx.localStorage.getItem('tts_api_key_openai'), 'test-key-2');
  ctx.saveApiKey('', 'openai');
});

test('saveApiKey: "" clears both stores and persist flag', () => {
  ctx.saveApiKey('abc', 'claude', true);
  ctx.saveApiKey('', 'claude');
  assert.equal(ctx.sessionStorage.getItem('tts_api_key_claude'), null);
  assert.equal(ctx.localStorage.getItem('tts_api_key_claude'), null);
  assert.equal(ctx.localStorage.getItem('tts_persist_claude'), null);
});

test('getApiKey: prefers sessionStorage but falls back to localStorage and warms cache', () => {
  ctx.sessionStorage.removeItem('tts_api_key_gemini');
  ctx.localStorage.setItem('tts_api_key_gemini', 'persisted-key');
  assert.equal(ctx.getApiKey('gemini'), 'persisted-key');
  assert.equal(ctx.sessionStorage.getItem('tts_api_key_gemini'), 'persisted-key',
    'fallback should warm sessionStorage');
  ctx.saveApiKey('', 'gemini');
});

test('isVerified: TTL window enforced', () => {
  const k = 'tts_verified_at_gemini';
  ctx.localStorage.setItem(k, String(Date.now() - 25 * 60 * 60 * 1000));
  assert.equal(ctx.isVerified('gemini'), false, 'expired beyond TTL');
  ctx.localStorage.setItem(k, String(Date.now() - 5 * 60 * 1000));
  assert.equal(ctx.isVerified('gemini'), true, 'within TTL');
  ctx.localStorage.removeItem(k);
});

test('invalidateVerified clears the timestamp', () => {
  ctx.setVerified('openai', true);
  assert.equal(ctx.isVerified('openai'), true);
  ctx.invalidateVerified('openai');
  assert.equal(ctx.isVerified('openai'), false);
});

test('cancelInflight: clears the active controller', () => {
  ctx._inflight.generate = new ctx.AbortController();
  ctx.cancelInflight('generate');
  assert.equal(ctx._inflight.generate, null);
});

test('isAbortError: matches AbortError name', () => {
  assert.equal(ctx.isAbortError({ name: 'AbortError' }), true);
  assert.equal(ctx.isAbortError({ message: 'request aborted' }), true);
  assert.equal(ctx.isAbortError({ message: 'unrelated' }), false);
});

test('i18n: t() returns Korean for ko, English for en, falls back to key', () => {
  ctx.setLang('ko');
  assert.equal(ctx.t('save'), '저장');
  assert.equal(ctx.t('mood-dark'), '어둡게');
  ctx.setLang('en');
  assert.equal(ctx.t('save'), 'save');
  assert.equal(ctx.t('mood-dark'), 'dark');
  assert.equal(ctx.t('nonexistent-key'), 'nonexistent-key');
});

test('i18n: getLang persists via localStorage', () => {
  ctx.setLang('ko');
  assert.equal(ctx.getLang(), 'ko');
  assert.equal(ctx.localStorage.getItem('tts_lang'), 'ko');
  ctx.setLang('en');
  assert.equal(ctx.getLang(), 'en');
});

test('i18n: setLang ignores invalid values', () => {
  ctx.setLang('en');
  ctx.setLang('jp');
  assert.equal(ctx.getLang(), 'en', 'invalid lang should be rejected');
});
