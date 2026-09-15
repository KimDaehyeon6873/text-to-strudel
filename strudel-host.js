(function () {
  'use strict';

  /**
   * @typedef {{ state?: { evalError?: unknown, error?: unknown } }} StrudelRepl
   * @typedef {{
   *   code?: string,
   *   repl?: StrudelRepl,
   *   setCode: (code: string) => unknown,
   *   evaluate: (play?: boolean) => unknown,
   *   stop: () => unknown
   * }} StrudelEditorApi
   * @typedef {HTMLElement & { editor?: StrudelEditorApi, repl?: StrudelRepl }} StrudelEditorElement
   */

  var MAX_CODE_BYTES = 256 * 1024;
  var MAX_TEXT_BYTES = 4 * 1024;
  var MAX_MESSAGE_BYTES = MAX_CODE_BYTES + MAX_TEXT_BYTES;
  var READY_TIMEOUT_MS = 15000;
  var BOOTSTRAP_INTERVAL_MS = 100;
  var MAX_BOOTSTRAP_ATTEMPTS = Math.ceil(READY_TIMEOUT_MS / BOOTSTRAP_INTERVAL_MS);
  var EVAL_ERROR_DELAY_MS = 400;
  var AUDIO_UNLOCK_TIMEOUT_MS = 1500;
  // Output devices (Bluetooth in particular) can take a while to start, and the
  // context stays "suspended" until they do. Only after this grace period is a
  // still-suspended context reported as blocked.
  var AUDIO_BLOCK_GRACE_MS = 3000;
  var AUDIO_STATES = ['running', 'suspended', 'closed', 'interrupted'];
  var HOST_SESSION = createSessionId();
  var initialized = false;
  var bootstrapAttempts = 0;
  var bootstrapTimer = null;
  var port = null;
  var commandQueue = Promise.resolve();
  var lastEvaluateRevision = /** @type {number | null} */ (null);
  var audioStateWatched = false;
  var audioGraceTimer = null;
  var editorEl = /** @type {StrudelEditorElement | null} */ (document.getElementById('strudelEditor'));
  var unlockButton = /** @type {HTMLButtonElement | null} */ (document.getElementById('audioUnlock'));
  // Strudel's evalScope publishes its runtime (initAudio, getAudioContext, ...) as globals.
  var strudelGlobals = /** @type {Record<string, any>} */ (/** @type {unknown} */ (window));

  function createSessionId() {
    var bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
    } else {
      for (var index = 0; index < bytes.length; index++) {
        bytes[index] = Math.floor(Math.random() * 256);
      }
    }
    var result = '';
    for (var i = 0; i < bytes.length; i++) {
      result += bytes[i].toString(16).padStart(2, '0');
    }
    return result;
  }

  function byteLength(value) {
    return new TextEncoder().encode(value).length;
  }

  function safeError(error) {
    var message = error && error.message ? error.message : String(error || 'Unknown error');
    return byteLength(message) <= MAX_TEXT_BYTES ? message : message.slice(0, MAX_TEXT_BYTES);
  }

  function send(message) {
    if (!port) return;
    try { port.postMessage(message); } catch (_) {}
  }

  function editorApi() {
    if (!editorEl || !editorEl.editor) return null;
    return editorEl.editor;
  }

  function replError() {
    var api = editorApi();
    var repl = api && (api.repl || (editorEl && editorEl.repl));
    var state = repl && repl.state;
    var error = state && (state.evalError || state.error);
    return error ? safeError(error) : '';
  }

  function audioContext() {
    try {
      if (typeof strudelGlobals.getAudioContext !== 'function') return null;
      var ctx = strudelGlobals.getAudioContext();
      return ctx && typeof ctx.state === 'string' ? ctx : null;
    } catch (_) {
      return null;
    }
  }

  function audioState() {
    var ctx = audioContext();
    if (!ctx || AUDIO_STATES.indexOf(ctx.state) === -1) return 'unavailable';
    return ctx.state;
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // Strudel only initializes audio (AudioWorklet effects, polyphony) on a
  // mousedown inside its own document, and superdough 1.3.0 never actually
  // calls resume() there (`!ctx instanceof OfflineAudioContext` is always
  // false). Parent-page clicks never reach this sandbox either, so the bridge
  // resumes the context itself and runs Strudel's initialization whenever
  // playback is requested or the unlock button is pressed. Whether the context
  // may start is decided by the browser's autoplay policy; the parent delegates
  // it with allow="autoplay", and a click on the unlock button is a gesture of
  // this document. resume() is called first and synchronously so that it stays
  // inside the gesture in browsers that require that.
  function unlockAudio() {
    var attempts = [];
    var ctx = audioContext();
    try {
      if (ctx && typeof ctx.resume === 'function') attempts.push(ctx.resume());
    } catch (_) {}
    try {
      if (typeof strudelGlobals.initAudio === 'function') attempts.push(strudelGlobals.initAudio());
    } catch (_) {}
    var settled = Promise.all(attempts.map(function (attempt) {
      return Promise.resolve(attempt).then(function () {}, function () {});
    }));
    return Promise.race([settled, wait(AUDIO_UNLOCK_TIMEOUT_MS)]);
  }

  function setUnlockVisible(visible) {
    if (unlockButton) unlockButton.hidden = !visible;
  }

  function publishAudioState() {
    if (audioGraceTimer !== null) {
      clearTimeout(audioGraceTimer);
      audioGraceTimer = null;
    }
    var state = audioState();
    setUnlockVisible(state === 'suspended');
    if (lastEvaluateRevision === null) return;
    send({ type: 'event', name: 'audioState', revision: lastEvaluateRevision, detail: { state: state } });
  }

  // Report a running context right away; give a still-suspended one the grace
  // period before calling it blocked. A statechange in the meantime reports
  // immediately and cancels the pending grace report.
  function scheduleAudioReport() {
    if (audioGraceTimer !== null) clearTimeout(audioGraceTimer);
    audioGraceTimer = null;
    if (audioState() !== 'suspended') {
      publishAudioState();
      return;
    }
    audioGraceTimer = setTimeout(publishAudioState, AUDIO_BLOCK_GRACE_MS);
  }

  function watchAudioState() {
    if (audioStateWatched) return;
    var ctx = audioContext();
    if (!ctx || typeof ctx.addEventListener !== 'function') return;
    audioStateWatched = true;
    ctx.addEventListener('statechange', publishAudioState);
  }

  if (unlockButton) {
    unlockButton.addEventListener('click', function () {
      unlockAudio();
      watchAudioState();
      scheduleAudioReport();
    });
  }

  function validId(id) {
    return (typeof id === 'string' && id.length > 0 && id.length <= 128) ||
      (Number.isSafeInteger(id) && id >= 0);
  }

  function validRevision(revision) {
    return Number.isSafeInteger(revision) && revision >= 0;
  }

  function validateCommand(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message)) throw new Error('Invalid command message');
    var keys = Object.keys(message).sort();
    if (keys.join(',') !== 'command,id,payload,revision,type') throw new Error('Invalid command schema');
    if (message.type !== 'command') throw new Error('Invalid command type');
    var serialized;
    try { serialized = JSON.stringify(message); } catch (_) { throw new Error('Command must be serializable'); }
    if (byteLength(serialized) > MAX_MESSAGE_BYTES) throw new Error('Command message too large');
    var command = message.command;
    if (!validId(message.id)) throw new Error('Invalid command id');
    if (!validRevision(message.revision)) throw new Error('Invalid revision');
    if (!['setCode', 'getCode', 'evaluate', 'stop'].includes(command)) throw new Error('Unknown command');
    if (command === 'setCode') {
      if (!message.payload || typeof message.payload !== 'object' || typeof message.payload.code !== 'string') throw new Error('setCode requires a code string');
      if (Object.keys(message.payload).join(',') !== 'code') throw new Error('Invalid setCode payload');
      if (byteLength(message.payload.code) > MAX_CODE_BYTES) throw new Error('Code payload too large');
    } else if (message.payload !== null) throw new Error('Command payload must be null');
    return command;
  }

  function waitForEditor() {
    return new Promise(function (resolve, reject) {
      var started = Date.now();
      var timer = setInterval(function () {
        var api = editorApi();
        if (api && typeof api.setCode === 'function' && typeof api.evaluate === 'function' && typeof api.stop === 'function') {
          clearInterval(timer);
          resolve(api);
        } else if (Date.now() - started >= READY_TIMEOUT_MS) {
          clearInterval(timer);
          reject(new Error('Strudel editor initialization timed out'));
        }
      }, 50);
    });
  }

  var editorReady = waitForEditor();

  async function execute(message, command) {
    var api = await editorReady;
    if (command === 'setCode') {
      api.setCode(message.payload.code);
      return true;
    }
    if (command === 'getCode') return typeof api.code === 'string' ? api.code : '';
    if (command === 'stop') {
      if (audioGraceTimer !== null) {
        clearTimeout(audioGraceTimer);
        audioGraceTimer = null;
      }
      setUnlockVisible(false);
      await api.stop();
      return true;
    }
    lastEvaluateRevision = message.revision;
    await unlockAudio();
    watchAudioState();
    await api.evaluate(true);
    setTimeout(function () {
      var error = replError();
      if (error) send({ type: 'event', name: 'evalError', revision: message.revision, detail: { message: error } });
      scheduleAudioReport();
    }, EVAL_ERROR_DELAY_MS);
    return true;
  }

  function receiveCommand(event) {
    var message = event.data;
    var command;
    try {
      command = validateCommand(message);
    } catch (error) {
      send({
        type: 'result', id: message && validId(message.id) ? message.id : null,
        command: message && message.command || null,
        revision: message && validRevision(message.revision) ? message.revision : null,
        ok: false, error: safeError(error)
      });
      return;
    }

    commandQueue = commandQueue.then(async function () {
      try {
        var result = await execute(message, command);
        var response = { type: 'result', id: message.id, command: command, revision: message.revision, ok: true };
        if (command === 'getCode') response.result = result;
        send(response);
      } catch (error) {
        send({ type: 'result', id: message.id, command: command, revision: message.revision, ok: false, error: safeError(error) });
      }
    });
  }

  function receiveInit(event) {
    if (initialized || window.parent === window || event.source !== window.parent) return;
    var message = event.data;
    if (!message || typeof message !== 'object' || Array.isArray(message) ||
        Object.keys(message).join(',') !== 'type' ||
        message.type !== 'strudel:init' || event.ports.length !== 1) return;
    initialized = true;
    if (bootstrapTimer !== null) {
      clearInterval(bootstrapTimer);
      bootstrapTimer = null;
    }
    window.removeEventListener('message', receiveInit);
    port = event.ports[0];
    port.onmessage = receiveCommand;
    if (port.start) port.start();
    editorReady.then(function () {
      send({ type: 'ready' });
    }).catch(function (error) {
      send({ type: 'error', kind: 'initialization', revision: null, error: safeError(error) });
    });
  }

  window.addEventListener('message', receiveInit);

  function requestBootstrap() {
    if (initialized || window.parent === window ||
        !window.parent || typeof window.parent.postMessage !== 'function') return;
    bootstrapAttempts++;
    try {
      window.parent.postMessage({ type: 'strudel:bootstrap', session: HOST_SESSION }, '*');
    } catch (_) {}
    if (bootstrapAttempts >= MAX_BOOTSTRAP_ATTEMPTS && bootstrapTimer !== null) {
      clearInterval(bootstrapTimer);
      bootstrapTimer = null;
    }
  }

  requestBootstrap();
  if (!initialized && bootstrapAttempts < MAX_BOOTSTRAP_ATTEMPTS) {
    bootstrapTimer = setInterval(requestBootstrap, BOOTSTRAP_INTERVAL_MS);
    if (bootstrapTimer && typeof bootstrapTimer.unref === 'function') bootstrapTimer.unref();
  }
}());
