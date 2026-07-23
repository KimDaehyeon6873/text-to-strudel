import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.resolve(here, '..', '..', 'app.js');
const source = fs.readFileSync(appPath, 'utf8');
const musicEnd = '// ---- Music Engine End ----';

function fakeElement(id = '') {
  return {
    id, textContent: '', innerHTML: '', value: '', code: '', className: '', open: false,
    disabled: false, placeholder: '', checked: false, style: {}, dataset: {}, children: [],
    classList: {
      values: new Set(),
      add(...names) { names.forEach((name) => this.values.add(name)); },
      remove(...names) { names.forEach((name) => this.values.delete(name)); },
      toggle(name, force) {
        if (force === true || (force === undefined && !this.values.has(name))) this.values.add(name);
        else this.values.delete(name);
        return this.values.has(name);
      },
      contains(name) { return this.values.has(name); },
    },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    appendChild(child) { this.children.push(child); return child; },
    remove() {}, focus() {}, select() {}, click() {}, contains() { return false; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    setAttribute(name, value) { this[name] = String(value); },
    removeAttribute(name) { delete this[name]; },
    hasAttribute(name) { return Object.hasOwn(this, name); },
    getAttribute(name) { return this[name] ?? null; },
    setCode(code) { this.code = code; }, evaluate() {}, stop() {},
  };
}

function storage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, String(value)]));
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    clear() { values.clear(); },
    key(index) { return [...values.keys()][index] ?? null; },
    get length() { return values.size; },
  };
}

function baseContext({
  fetchImpl,
  localStorage = {},
  sessionStorage = {},
  extraGlobals = {},
} = {}) {
  const elements = new Map();
  const getElement = (id) => {
    if (!elements.has(id)) elements.set(id, fakeElement(id));
    return elements.get(id);
  };
  const document = {
    getElementById: getElement,
    querySelector() { return null; },
    querySelectorAll() { return []; },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    createElement(tag) { return fakeElement(tag); },
    body: fakeElement('body'),
  };
  const window = {
    name: '', document, location: { href: 'https://example.test/', protocol: 'https:' },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    matchMedia() { return { matches: false, addEventListener() {}, removeEventListener() {} }; },
  };
  window.window = window;
  const context = {
    document, window, globalThis: null,
    localStorage: storage(localStorage), sessionStorage: storage(sessionStorage),
    navigator: { userAgent: 'node-test', clipboard: { writeText: async () => {} } },
    location: window.location,
    fetch: fetchImpl ?? (async () => ({ ok: true, status: 200, json: async () => ({}) })),
    AbortController: class { constructor() { this.signal = {}; } abort() {} },
    setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask,
    console, URL, URLSearchParams,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    Event: class { constructor(type) { this.type = type; } },
    Math, JSON, Object, Array, Set, Map, Date, String, Number, Boolean, RegExp, Error, Promise,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    Uint8Array, TextEncoder, TextDecoder,
    btoa: (value) => Buffer.from(value, 'binary').toString('base64'),
    atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    crypto: { getRandomValues(array) { for (let i = 0; i < array.length; i++) array[i] = i * 17 + 3; return array; } },
    ...extraGlobals,
  };
  context.globalThis = context;
  return context;
}

export function loadMusicEngine() {
  const end = source.indexOf(musicEnd);
  if (end < 0) throw new Error(`Missing explicit test boundary: ${musicEnd}`);
  const context = baseContext();
  vm.createContext(context);
  vm.runInContext(source.slice(0, end + musicEnd.length), context, { filename: appPath });
  if (!context.__TTS_MUSIC_TEST__) throw new Error('app.js did not expose __TTS_MUSIC_TEST__');
  return { context, api: context.__TTS_MUSIC_TEST__ };
}

export function loadFullApp(options = {}) {
  const context = baseContext(options);
  if (options.setupContext) options.setupContext(context);
  vm.createContext(context);
  vm.runInContext(source, context, { filename: appPath });
  return context;
}

export function plain(value) {
  return JSON.parse(JSON.stringify(value));
}
