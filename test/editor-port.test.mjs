import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFullApp } from './helpers/load-app.mjs';

class FakePort {
  constructor() {
    this.peer = null;
    this.onmessage = null;
    this.started = false;
  }
  start() {
    this.started = true;
  }
  postMessage(data) {
    queueMicrotask(() => this.peer?.onmessage?.({ data }));
  }
}

class FakeMessageChannel {
  static instances = [];
  constructor() {
    this.port1 = new FakePort();
    this.port2 = new FakePort();
    this.port1.peer = this.port2;
    this.port2.peer = this.port1;
    FakeMessageChannel.instances.push(this);
  }
}

function makeEditorContext(configureContext) {
  FakeMessageChannel.instances.length = 0;
  const bootstrapMessages = [];
  let hostPort;
  const context = loadFullApp({
    extraGlobals: { MessageChannel: FakeMessageChannel },
    setupContext(ctx) {
      const frame = ctx.document.getElementById('strudelFrame');
      frame.contentWindow = {
        postMessage(message, targetOrigin, transfer) {
          bootstrapMessages.push({ message, targetOrigin, transfer });
          hostPort = transfer[0];
        },
      };
      configureContext?.(ctx);
    },
  });
  const commands = [];
  hostPort.onmessage = ({ data }) => commands.push(data);
  hostPort.postMessage({ type: 'ready' });
  return { context, bootstrapMessages, commands, hostPort };
}

function makeProductionEditorContext() {
  FakeMessageChannel.instances.length = 0;
  const initMessages = [];
  const loadListeners = [];
  let messageListener;
  let frameWindow;
  const context = loadFullApp({
    extraGlobals: { MessageChannel: FakeMessageChannel },
    setupContext(ctx) {
      const frame = ctx.document.getElementById('strudelFrame');
      frame.src = 'strudel-host.html';
      frame.addEventListener = (type, listener) => {
        if (type === 'load') loadListeners.push(listener);
      };
      frameWindow = {
        postMessage(message, targetOrigin, transfer) {
          initMessages.push({ message, targetOrigin, transfer });
        },
      };
      frame.contentWindow = frameWindow;
      ctx.window.addEventListener = (type, listener) => {
        if (type === 'message') messageListener = listener;
      };
    },
  });
  return {
    context,
    initMessages,
    dispatchLoad() {
      for (const listener of loadListeners) listener();
    },
    dispatchBootstrap(session, source = frameWindow, data = { type: 'strudel:bootstrap', session }) {
      messageListener?.({ source, data });
    },
  };
}

async function nextTask() {
  await new Promise((resolve) => setImmediate(resolve));
}

test('EditorPort transfers one MessagePort in a data-free bootstrap message', () => {
  const { bootstrapMessages } = makeEditorContext();

  assert.equal(bootstrapMessages.length, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(bootstrapMessages[0].message)), { type: 'strudel:init' });
  assert.equal(bootstrapMessages[0].transfer.length, 1);
});

test('EditorPort sends commands over the transferred port instead of window messaging', async () => {
  const { context, bootstrapMessages, commands, hostPort } = makeEditorContext();
  await nextTask();

  const operation = context.editorPort.setCode('$: s("bd")');
  await nextTask();
  const command = commands[0];
  hostPort.postMessage({
    type: 'result',
    id: command.id,
    command: command.command,
    revision: command.revision,
    ok: true,
  });
  await operation;

  assert.equal(bootstrapMessages.length, 1);
  assert.equal(command.type, 'command');
  assert.equal(command.command, 'setCode');
});

test('EditorPort revision increments when code is replaced', async () => {
  const { context, commands, hostPort } = makeEditorContext();
  await nextTask();

  const operation = context.editorPort.setCode('new code');
  await nextTask();
  const command = commands[0];
  hostPort.postMessage({
    type: 'result', id: command.id, command: command.command,
    revision: command.revision, ok: true,
  });
  await operation;

  assert.equal(command.revision, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(command.payload)), { code: 'new code' });
});

test('EditorPort ignores a result whose revision does not match the pending command', async () => {
  const { context, commands, hostPort } = makeEditorContext();
  await nextTask();

  const operation = context.editorPort.setCode('current');
  await nextTask();
  const command = commands[0];
  hostPort.postMessage({
    type: 'result', id: command.id, command: command.command,
    revision: command.revision - 1, ok: true,
  });
  await nextTask();
  assert.equal(context.editorPort.pending.size, 1);
  hostPort.postMessage({
    type: 'result', id: command.id, command: command.command,
    revision: command.revision, ok: true,
  });

  await assert.doesNotReject(operation);
});

test('EditorPort rejects payloads larger than 256 KiB without sending them', async () => {
  const { context, commands } = makeEditorContext();
  await nextTask();

  await assert.rejects(
    context.editorPort.setCode('x'.repeat(256 * 1024 + 1)),
    /payload exceeds 256 KiB/,
  );
  assert.equal(commands.length, 0);
});

test('replaceAndEvaluate uses the supported setCode then evaluate commands', async () => {
  const { context, commands, hostPort } = makeEditorContext();
  await nextTask();

  const operation = context.editorPort.replaceAndEvaluate('replacement');
  await nextTask();
  assert.equal(commands[0].command, 'setCode');
  hostPort.postMessage({
    type: 'result', id: commands[0].id, command: commands[0].command,
    revision: commands[0].revision, ok: true,
  });
  await nextTask();
  assert.equal(commands[1].command, 'evaluate');
  hostPort.postMessage({
    type: 'result', id: commands[1].id, command: commands[1].command,
    revision: commands[1].revision, ok: true,
  });

  await assert.doesNotReject(operation);
});

test('replaceAndEvaluate keeps each replacement and evaluation atomic in FIFO order', async () => {
  const { context, commands, hostPort } = makeEditorContext();
  await nextTask();

  const first = context.editorPort.replaceAndEvaluate('first');
  const second = context.editorPort.replaceAndEvaluate('second');
  await nextTask();

  assert.deepEqual(commands.map((command) => command.command), ['setCode']);
  assert.equal(commands[0].payload.code, 'first');
  hostPort.postMessage({
    type: 'result', id: commands[0].id, command: 'setCode',
    revision: commands[0].revision, ok: true,
  });
  await nextTask();

  assert.deepEqual(
    commands.map((command) => [command.command, command.payload?.code]),
    [['setCode', 'first'], ['evaluate', undefined]],
    'the second replacement must not interleave before the first evaluation',
  );
  hostPort.postMessage({
    type: 'result', id: commands[1].id, command: 'evaluate',
    revision: commands[1].revision, ok: true,
  });
  await nextTask();

  assert.equal(commands[2].command, 'setCode');
  assert.equal(commands[2].payload.code, 'second');
  hostPort.postMessage({
    type: 'result', id: commands[2].id, command: 'setCode',
    revision: commands[2].revision, ok: true,
  });
  await nextTask();
  assert.equal(commands[3].command, 'evaluate');
  hostPort.postMessage({
    type: 'result', id: commands[3].id, command: 'evaluate',
    revision: commands[3].revision, ok: true,
  });

  await Promise.all([first, second]);
});

test('EditorPort ignores malformed result schemas and waits for an exact result', async () => {
  const { context, commands, hostPort } = makeEditorContext();
  await nextTask();

  const operation = context.editorPort.setCode('strict');
  await nextTask();
  const command = commands[0];
  const base = {
    type: 'result', id: command.id, command: command.command,
    revision: command.revision, ok: true,
  };
  hostPort.postMessage({ ...base, unexpected: true });
  hostPort.postMessage({ ...base, ok: 'true' });
  hostPort.postMessage({ ...base, id: Number(command.id) });
  await nextTask();
  assert.equal(context.editorPort.pending.size, 1);
  hostPort.postMessage(base);
  await assert.doesNotReject(operation);
  assert.equal(context.editorPort.pending.size, 0);
});

test('EditorPort reconnects through a fresh MessagePort after the iframe reloads', async () => {
  FakeMessageChannel.instances.length = 0;
  const bootstrapMessages = [];
  const loadListeners = [];
  const commandLists = [];
  const context = loadFullApp({
    extraGlobals: { MessageChannel: FakeMessageChannel },
    setupContext(ctx) {
      const frame = ctx.document.getElementById('strudelFrame');
      frame.addEventListener = (type, listener) => {
        if (type === 'load') loadListeners.push(listener);
      };
      frame.contentWindow = {
        postMessage(message, targetOrigin, transfer) {
          bootstrapMessages.push({ message, targetOrigin, transfer });
          const commands = [];
          transfer[0].onmessage = ({ data }) => commands.push(data);
          commandLists.push(commands);
        },
      };
    },
  });

  FakeMessageChannel.instances[0].port2.postMessage({ type: 'ready' });
  await nextTask();
  const first = context.editorPort.setCode('before reload');
  await nextTask();
  const firstCommand = commandLists[0][0];
  FakeMessageChannel.instances[0].port2.postMessage({
    type: 'result', id: firstCommand.id, command: firstCommand.command,
    revision: firstCommand.revision, ok: true,
  });
  await first;

  loadListeners[0]();
  assert.equal(bootstrapMessages.length, 2, 'reload must transfer a fresh capability');
  FakeMessageChannel.instances[1].port2.postMessage({ type: 'ready' });
  await nextTask();

  const second = context.editorPort.setCode('after reload');
  await nextTask();
  assert.equal(commandLists[0].length, 1, 'the stale port must not receive post-reload commands');
  assert.equal(commandLists[1][0].payload.code, 'after reload');
  const secondCommand = commandLists[1][0];
  FakeMessageChannel.instances[1].port2.postMessage({
    type: 'result', id: secondCommand.id, command: secondCommand.command,
    revision: secondCommand.revision, ok: true,
  });
  await second;
});

test('production load-before-bootstrap initializes once per host session', () => {
  const host = makeProductionEditorContext();
  const firstSession = '0123456789abcdef0123456789abcdef';
  const secondSession = 'fedcba9876543210fedcba9876543210';

  assert.equal(host.initMessages.length, 0, 'a production iframe waits for its authenticated bootstrap');
  host.dispatchLoad();
  assert.equal(host.initMessages.length, 0, 'load alone must not race the child bootstrap');

  host.dispatchBootstrap(firstSession);
  assert.equal(host.initMessages.length, 1);
  host.dispatchBootstrap(firstSession);
  assert.equal(host.initMessages.length, 1, 'same-document retry must not rotate the capability port');

  host.dispatchBootstrap(secondSession);
  assert.equal(host.initMessages.length, 2, 'a new document session must receive a fresh capability port');
  host.dispatchBootstrap(secondSession);
  assert.equal(host.initMessages.length, 2);
});

test('production bootstrap-before-load does not reconnect on the later load event', () => {
  const host = makeProductionEditorContext();
  const session = '00112233445566778899aabbccddeeff';

  host.dispatchBootstrap(session);
  assert.equal(host.initMessages.length, 1);
  host.dispatchLoad();
  host.dispatchBootstrap(session);
  assert.equal(host.initMessages.length, 1);

  host.dispatchBootstrap(session, {});
  host.dispatchBootstrap(session, undefined, { type: 'strudel:bootstrap', session, extra: true });
  assert.equal(host.initMessages.length, 1, 'wrong-source and malformed bootstrap messages must be ignored');
});

test('rapid focused variations serialize the complete read replace evaluate transaction', async () => {
  let clickVariation;
  const { context, commands, hostPort } = makeEditorContext((ctx) => {
    const button = ctx.document.getElementById('melodyVariationTestButton');
    button.dataset.variation = 'melody';
    button.addEventListener = (type, listener) => {
      if (type === 'click') clickVariation = listener;
    };
    ctx.document.querySelectorAll = (selector) =>
      selector === '.variation-btn' ? [button] : [];
  });
  const prompt = 'rapid serialized melody changes';
  context.document.getElementById('input').value = prompt;
  const initialCode = context.generateCode(prompt, 'edm');
  await nextTask();

  clickVariation();
  clickVariation();
  await nextTask();

  assert.deepEqual(commands.map((command) => command.command), ['getCode']);
  hostPort.postMessage({
    type: 'result', id: commands[0].id, command: 'getCode',
    revision: commands[0].revision, ok: true, result: initialCode,
  });
  await nextTask();
  assert.deepEqual(commands.map((command) => command.command), ['getCode', 'setCode']);

  hostPort.postMessage({
    type: 'result', id: commands[1].id, command: 'setCode',
    revision: commands[1].revision, ok: true,
  });
  await nextTask();
  assert.equal(commands[2].command, 'evaluate');
  hostPort.postMessage({
    type: 'result', id: commands[2].id, command: 'evaluate',
    revision: commands[2].revision, ok: true,
  });
  await nextTask();

  assert.equal(commands[3].command, 'getCode');
  hostPort.postMessage({
    type: 'result', id: commands[3].id, command: 'getCode',
    revision: commands[3].revision, ok: true, result: commands[1].payload.code,
  });
  await nextTask();
  assert.equal(commands[4].command, 'setCode');
  assert.notEqual(
    commands[4].payload.code,
    commands[1].payload.code,
    'each rapid click must apply a distinct variation to the latest editor code',
  );
  hostPort.postMessage({
    type: 'result', id: commands[4].id, command: 'setCode',
    revision: commands[4].revision, ok: true,
  });
  await nextTask();
  assert.equal(commands[5].command, 'evaluate');
  hostPort.postMessage({
    type: 'result', id: commands[5].id, command: 'evaluate',
    revision: commands[5].revision, ok: true,
  });

  await context.focusedActionQueue;
});
