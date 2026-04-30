import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');

function makeRpcContext() {
  const sentMessages = [];
  const messageListeners = [];
  const iframeListeners = {};

  const fakeContentWindow = {
    postMessage(msg) { sentMessages.push(msg); },
  };

  const els = new Map();
  const baseEl = (id) => ({
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
  });

  const fakeIframe = baseEl('strudelFrame');
  fakeIframe.contentWindow = fakeContentWindow;
  fakeIframe.addEventListener = (name, fn) => { iframeListeners[name] = fn; };
  els.set('strudelFrame', fakeIframe);

  const document = {
    getElementById: (id) => {
      if (!els.has(id)) els.set(id, baseEl(id));
      return els.get(id);
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    dispatchEvent() { return true; },
    createElement: () => baseEl('tmp'),
  };

  const ctx = {
    document,
    localStorage: (() => {
      const m = new Map();
      return {
        getItem: k => m.has(k) ? m.get(k) : null,
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: k => { m.delete(k); },
        clear: () => m.clear(),
        key: i => [...m.keys()][i] || null,
        get length() { return m.size; },
      };
    })(),
    sessionStorage: (() => {
      const m = new Map();
      return {
        getItem: k => m.has(k) ? m.get(k) : null,
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: k => { m.delete(k); },
        clear: () => m.clear(),
        key: i => [...m.keys()][i] || null,
        get length() { return m.size; },
      };
    })(),
    window: {
      addEventListener(name, fn) {
        if (name === 'message') messageListeners.push(fn);
      },
    },
    navigator: { userAgent: 'node-test' },
    fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    setTimeout, clearTimeout, setInterval, clearInterval,
    console,
    CustomEvent: class { constructor(t, d) { this.type = t; this.detail = d && d.detail; } },
    Math, JSON, Object, Array, Set, Map, Date, String, Number, RegExp, Error, Promise,
    parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent,
  };
  vm.createContext(ctx);
  vm.runInContext(src, ctx);

  function dispatchMessage(data, { source = fakeContentWindow, origin = 'null' } = {}) {
    messageListeners.forEach(fn => fn({ data, source, origin }));
  }

  return { ctx, sentMessages, dispatchMessage, fakeContentWindow };
}

test('rpc: ready queue buffers calls before ready event, flushes after', async () => {
  const { ctx, sentMessages, dispatchMessage } = makeRpcContext();

  const p1 = ctx.iframeRpc('setCode', { code: 'x' });
  const p2 = ctx.iframeRpc('evaluate');
  assert.equal(sentMessages.length, 0, 'no postMessage before ready');

  dispatchMessage({ type: 'event', name: 'ready' });
  assert.equal(sentMessages.length, 2, 'queue flushed after ready');
  assert.equal(sentMessages[0].cmd, 'setCode');
  assert.equal(sentMessages[1].cmd, 'evaluate');

  // Resolve them so promises settle and the test process can exit.
  dispatchMessage({ type: 'rpc-result', id: sentMessages[0].id, ok: true, result: true });
  dispatchMessage({ type: 'rpc-result', id: sentMessages[1].id, ok: true, result: true });
  await assert.doesNotReject(Promise.all([p1, p2]));
});

test('rpc: timeout rejects when no reply arrives', async () => {
  const { ctx, dispatchMessage } = makeRpcContext();
  dispatchMessage({ type: 'event', name: 'ready' });

  const p = ctx.iframeRpc('setCode', { code: 'x' }, 50);
  await assert.rejects(p, /RPC timeout: setCode/);
});

test('rpc: rejects when ok=false', async () => {
  const { ctx, sentMessages, dispatchMessage } = makeRpcContext();
  dispatchMessage({ type: 'event', name: 'ready' });

  const p = ctx.iframeRpc('evaluate');
  dispatchMessage({ type: 'rpc-result', id: sentMessages[0].id, ok: false, error: 'boom' });
  await assert.rejects(p, /boom/);
});

test('rpc: messages from a foreign source are ignored', async () => {
  const { ctx, sentMessages, dispatchMessage } = makeRpcContext();
  dispatchMessage({ type: 'event', name: 'ready' });

  const p = ctx.iframeRpc('setCode', { code: 'x' }, 80);
  // Foreign source must not resolve our pending RPC.
  dispatchMessage(
    { type: 'rpc-result', id: sentMessages[0].id, ok: true, result: 'evil' },
    { source: { postMessage() {} } },
  );
  await assert.rejects(p, /RPC timeout: setCode/);
});

test('rpc: messages with non-opaque origin are ignored', async () => {
  const { ctx, sentMessages, dispatchMessage } = makeRpcContext();
  dispatchMessage({ type: 'event', name: 'ready' });

  const p = ctx.iframeRpc('setCode', { code: 'x' }, 80);
  dispatchMessage(
    { type: 'rpc-result', id: sentMessages[0].id, ok: true, result: 'evil' },
    { origin: 'https://attacker.example' },
  );
  await assert.rejects(p, /RPC timeout: setCode/);
});

test('rpc: ready event with detail.error sets error status (does not flush queue)', () => {
  const { ctx, sentMessages, dispatchMessage } = makeRpcContext();
  dispatchMessage({ type: 'event', name: 'ready', detail: { error: 'init timeout' } });
  assert.equal(sentMessages.length, 0, 'failed-ready must not flush queue');
  const status = ctx.document.getElementById('status');
  assert.equal(status.className, 'status error');
  assert.equal(status.textContent, 'Editor failed to initialize');
});
