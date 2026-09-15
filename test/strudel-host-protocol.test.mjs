import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../strudel-host.js', import.meta.url), 'utf8');

function makeAudio({ state = 'suspended' } = {}) {
  const listeners = [];
  const calls = [];
  const ctx = {
    state,
    addEventListener(type, listener) { if (type === 'statechange') listeners.push(listener); },
    async resume() { calls.push('resume'); },
  };
  return {
    ctx,
    calls,
    initAudio: async () => { calls.push('initAudio'); },
    setState(next) {
      ctx.state = next;
      for (const listener of listeners) listener();
    },
    get statechangeListeners() { return listeners.length; },
  };
}

async function waitFor(predicate, { timeout = 3000 } = {}) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('condition not met in time');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeHost({ fakeTimers = false, audio = null } = {}) {
  const listeners = new Map();
  const responses = [];
  const bootstrapMessages = [];
  const intervals = new Map();
  const timeouts = new Map();
  let intervalId = 0;
  let timeoutId = 0;
  let now = 0;
  const unlockButton = {
    hidden: true,
    listeners: new Map(),
    addEventListener(type, listener) { this.listeners.set(type, listener); },
    click() { this.listeners.get('click')?.(); },
  };
  const editor = {
    code: '',
    setCode(code) { this.code = code; },
    async evaluate() {},
    async stop() {},
  };
  const parent = {
    postMessage(message, targetOrigin) {
      bootstrapMessages.push({ message, targetOrigin });
    },
  };
  const window = {
    parent,
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  if (audio) {
    // Strudel's evalScope publishes its runtime on the global object.
    window.getAudioContext = () => audio.ctx;
    window.initAudio = (...args) => audio.initAudio(...args);
  }
  const context = {
    window,
    document: {
      getElementById(id) {
        return id === 'audioUnlock' ? unlockButton : { editor };
      },
    },
    TextEncoder,
    setTimeout: fakeTimers
      ? (callback, delay = 0) => {
          const id = ++timeoutId;
          timeouts.set(id, { callback, at: now + delay });
          return id;
        }
      : setTimeout,
    clearTimeout: fakeTimers ? (id) => timeouts.delete(id) : clearTimeout,
    setInterval: fakeTimers
      ? (callback) => {
          const id = ++intervalId;
          intervals.set(id, callback);
          return id;
        }
      : setInterval,
    clearInterval: fakeTimers ? (id) => intervals.delete(id) : clearInterval,
    Date,
    Promise,
    console,
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'strudel-host.js' });
  const port = {
    onmessage: null,
    started: false,
    start() { this.started = true; },
    postMessage(message) { responses.push(message); },
  };
  function initialize({ source = parent, ports = [port], data = { type: 'strudel:init' } } = {}) {
    listeners.get('message')?.({ source, ports, data });
  }
  async function waitForReady() {
    initialize();
    const deadline = Date.now() + 500;
    while (!responses.some((message) => message.type === 'ready')) {
      if (Date.now() >= deadline) throw new Error('host did not become ready');
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  async function command(data) {
    port.onmessage?.({ data });
    await new Promise((resolve) => setImmediate(resolve));
  }
  function runIntervals() {
    for (const callback of [...intervals.values()]) callback();
  }
  async function advance(ms) {
    // Fire due timers in order, moving the clock to each one so that timers
    // scheduled by a callback are placed relative to that moment.
    const target = now + ms;
    for (;;) {
      const due = [...timeouts.entries()]
        .filter(([, entry]) => entry.at <= target)
        .sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, entry] = due;
      timeouts.delete(id);
      now = Math.max(now, entry.at);
      entry.callback();
      await new Promise((resolve) => setImmediate(resolve));
    }
    now = target;
    await new Promise((resolve) => setImmediate(resolve));
  }
  async function readyWithFakeTimers() {
    initialize();
    runIntervals();
    await new Promise((resolve) => setImmediate(resolve));
    if (!responses.some((message) => message.type === 'ready')) throw new Error('host did not become ready');
  }
  return {
    editor,
    unlockButton,
    initialize,
    waitForReady,
    readyWithFakeTimers,
    port,
    responses,
    command,
    bootstrapMessages,
    runIntervals,
    advance,
    audioEvents: () => responses.filter((message) => message.type === 'event' && message.name === 'audioState').map(plain),
  };
}

test('host ignores initialization messages from outside its parent window', () => {
  const host = makeHost();

  host.initialize({ source: {} });

  assert.equal(host.port.onmessage, null);
  assert.equal(host.responses.length, 0);
});

test('host rejects initialization without exactly one transferred port', () => {
  const host = makeHost();

  host.initialize({ ports: [] });

  assert.equal(host.port.onmessage, null);
  assert.equal(host.responses.length, 0);
});

test('host retries its bootstrap ping until valid port initialization then stops', async () => {
  const host = makeHost({ fakeTimers: true });
  const initialCount = host.bootstrapMessages.length;

  host.runIntervals();
  host.runIntervals();
  assert.ok(host.bootstrapMessages.length > initialCount, 'bootstrap ping must retry before init');
  const sessions = new Set();
  for (const entry of host.bootstrapMessages) {
    const message = JSON.parse(JSON.stringify(entry.message));
    assert.equal(message.type, 'strudel:bootstrap');
    assert.match(message.session, /^[a-f0-9]{32}$/);
    assert.deepEqual(Object.keys(message).sort(), ['session', 'type']);
    sessions.add(message.session);
  }
  assert.equal(sessions.size, 1, 'bootstrap retries must reuse one session id per document');

  host.initialize();
  await Promise.resolve();
  const initializedCount = host.bootstrapMessages.length;
  host.runIntervals();
  host.runIntervals();

  assert.equal(host.bootstrapMessages.length, initializedCount, 'bootstrap retries must stop after init');
  assert.equal(host.port.started, true);
});

test('host accepts exactly one transferred port and announces readiness on it', async () => {
  const host = makeHost();

  await host.waitForReady();

  assert.equal(host.port.started, true);
  assert.deepEqual(JSON.parse(JSON.stringify(host.responses[0])), { type: 'ready' });
});

test('host setCode response echoes command identity and revision', async () => {
  const host = makeHost();
  await host.waitForReady();
  await host.command({
    type: 'command',
    id: 'request-1',
    command: 'setCode',
    revision: 7,
    payload: { code: '$: s("bd")' },
  });

  assert.equal(host.editor.code, '$: s("bd")');
  assert.deepEqual(JSON.parse(JSON.stringify(host.responses.at(-1))), {
    type: 'result',
    id: 'request-1',
    command: 'setCode',
    revision: 7,
    ok: true,
  });
});

test('host rejects messages that do not use the command schema', async () => {
  const host = makeHost();
  await host.waitForReady();

  await host.command({
    type: 'not-a-command',
    id: 'request-2',
    command: 'stop',
    revision: 0,
    payload: null,
  });

  assert.equal(host.responses.at(-1).ok, false);
  assert.match(host.responses.at(-1).error, /command (?:message|type)/i);
});

test('host rejects an oversized setCode payload', async () => {
  const host = makeHost();
  await host.waitForReady();

  await host.command({
    type: 'command',
    id: 'request-3',
    command: 'setCode',
    revision: 1,
    payload: { code: 'x'.repeat(256 * 1024 + 1) },
  });

  assert.equal(host.responses.at(-1).ok, false);
  assert.match(host.responses.at(-1).error, /payload too large/i);
});

test('host rejects unknown commands without executing editor methods', async () => {
  const host = makeHost();
  await host.waitForReady();

  await host.command({
    type: 'command',
    id: 'request-4',
    command: 'deleteEverything',
    revision: 0,
    payload: null,
  });

  assert.equal(host.responses.at(-1).ok, false);
  assert.match(host.responses.at(-1).error, /unknown command/i);
});

test('host resumes and initializes audio before evaluating', async () => {
  const audio = makeAudio({ state: 'running' });
  const host = makeHost({ audio });
  await host.waitForReady();
  const order = [];
  audio.ctx.resume = async () => { order.push('resume'); };
  audio.initAudio = async () => { order.push('initAudio'); };
  host.editor.evaluate = async () => { order.push('evaluate'); };

  await host.command({ type: 'command', id: 'request-5', command: 'evaluate', revision: 3, payload: null });
  await waitFor(() => host.responses.some((message) => message.type === 'result' && message.id === 'request-5'));

  assert.deepEqual(order, ['resume', 'initAudio', 'evaluate']);
  assert.deepEqual(plain(host.responses.find((message) => message.id === 'request-5')), {
    type: 'result', id: 'request-5', command: 'evaluate', revision: 3, ok: true,
  });
  await waitFor(() => host.audioEvents().length > 0);
  assert.deepEqual(host.audioEvents(), [{ type: 'event', name: 'audioState', revision: 3, detail: { state: 'running' } }]);
  assert.equal(host.unlockButton.hidden, true);
});

test('host reports a running context right away but gives a suspended one a grace period', async () => {
  const audio = makeAudio({ state: 'suspended' });
  const host = makeHost({ fakeTimers: true, audio });
  await host.readyWithFakeTimers();

  await host.command({ type: 'command', id: 'request-6', command: 'evaluate', revision: 4, payload: null });
  await host.advance(400);
  assert.deepEqual(host.audioEvents(), [], 'no verdict yet while the output device may still be starting');
  assert.equal(host.unlockButton.hidden, true);

  await host.advance(2999);
  assert.deepEqual(host.audioEvents(), []);
  await host.advance(1);
  assert.deepEqual(host.audioEvents(), [{ type: 'event', name: 'audioState', revision: 4, detail: { state: 'suspended' } }]);
  assert.equal(host.unlockButton.hidden, false, 'unlock button appears once the context is called blocked');
});

test('a context that starts during the grace period is reported as running and never as blocked', async () => {
  const audio = makeAudio({ state: 'suspended' });
  const host = makeHost({ fakeTimers: true, audio });
  await host.readyWithFakeTimers();

  await host.command({ type: 'command', id: 'request-7', command: 'evaluate', revision: 5, payload: null });
  await host.advance(400);
  assert.equal(audio.statechangeListeners, 1);
  audio.setState('running');
  await host.advance(0);
  assert.deepEqual(host.audioEvents(), [{ type: 'event', name: 'audioState', revision: 5, detail: { state: 'running' } }]);

  await host.advance(5000);
  assert.deepEqual(host.audioEvents().length, 1, 'the cancelled grace report must not fire');
  assert.equal(host.unlockButton.hidden, true);

  await host.command({ type: 'command', id: 'request-8', command: 'evaluate', revision: 6, payload: null });
  await host.advance(400);
  assert.equal(audio.statechangeListeners, 1, 'one statechange listener across evaluations');
  assert.deepEqual(host.audioEvents().at(-1), { type: 'event', name: 'audioState', revision: 6, detail: { state: 'running' } });
});

test('the unlock button resumes the context inside the sandbox and reports the result', async () => {
  const audio = makeAudio({ state: 'suspended' });
  const host = makeHost({ fakeTimers: true, audio });
  await host.readyWithFakeTimers();
  await host.command({ type: 'command', id: 'request-9', command: 'evaluate', revision: 7, payload: null });
  await host.advance(3400);
  assert.equal(host.unlockButton.hidden, false);
  const calls = audio.calls.length;

  // The real button click is the user gesture; the fake context "starts" as a result.
  audio.ctx.resume = async () => { audio.calls.push('resume'); audio.setState('running'); };
  host.unlockButton.click();
  await host.advance(0);

  assert.equal(audio.calls[calls], 'resume', 'resume() is the first call inside the gesture');
  assert.deepEqual(host.audioEvents().at(-1), { type: 'event', name: 'audioState', revision: 7, detail: { state: 'running' } });
  assert.equal(host.unlockButton.hidden, true);
});

test('stop hides the unlock button and cancels a pending blocked report', async () => {
  const audio = makeAudio({ state: 'suspended' });
  const host = makeHost({ fakeTimers: true, audio });
  await host.readyWithFakeTimers();
  await host.command({ type: 'command', id: 'request-10', command: 'evaluate', revision: 8, payload: null });
  await host.advance(3400);
  assert.equal(host.unlockButton.hidden, false);

  await host.command({ type: 'command', id: 'request-11', command: 'evaluate', revision: 9, payload: null });
  await host.advance(400);
  await host.command({ type: 'command', id: 'request-12', command: 'stop', revision: 9, payload: null });
  await host.advance(0);
  assert.equal(host.unlockButton.hidden, true);
  const before = host.audioEvents().length;
  await host.advance(5000);
  assert.equal(host.audioEvents().length, before, 'no blocked report after stop');
});

test('host still evaluates when audio initialization never settles', async () => {
  const audio = makeAudio({ state: 'suspended' });
  audio.initAudio = () => new Promise(() => {});
  audio.ctx.resume = () => new Promise(() => {});
  const host = makeHost({ audio });
  await host.waitForReady();
  let evaluated = false;
  host.editor.evaluate = async () => { evaluated = true; };

  await host.command({ type: 'command', id: 'request-13', command: 'evaluate', revision: 10, payload: null });
  await waitFor(() => host.responses.some((message) => message.id === 'request-13'), { timeout: 4000 });

  assert.equal(evaluated, true);
  assert.equal(host.responses.find((message) => message.id === 'request-13').ok, true);
});

test('host reports audio as unavailable when the runtime exposes no audio context', async () => {
  const host = makeHost();
  await host.waitForReady();

  await host.command({ type: 'command', id: 'request-14', command: 'evaluate', revision: 11, payload: null });
  await waitFor(() => host.audioEvents().length > 0);

  assert.deepEqual(host.audioEvents(), [{ type: 'event', name: 'audioState', revision: 11, detail: { state: 'unavailable' } }]);
  assert.equal(host.unlockButton.hidden, true);
});
