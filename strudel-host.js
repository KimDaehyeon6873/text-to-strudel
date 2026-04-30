// strudel-host.js — postMessage RPC bridge inside the sandboxed Strudel iframe.
//
// Protocol:
//   parent -> iframe: {type:'rpc', id, cmd, payload}
//   iframe -> parent: {type:'rpc-result', id, ok, result|error}
//   iframe -> parent: {type:'event', name:'ready'|'evalError', detail}
//
// All replies use postMessage(event.source, '*', ...) — the iframe's origin is
// opaque (sandbox without allow-same-origin) so no useful targetOrigin exists.
// Source-validation happens on the parent side; the iframe trusts only window.parent
// for unsolicited 'event' messages.

(function () {
  var TARGET_ORIGIN = '*';
  var READY_TIMEOUT_MS = 15000;
  var EVAL_ERROR_CHECK_MS = 400;

  var editorEl = document.getElementById('strudelEditor');
  var ready = false;

  function reply(source, data) {
    if (!source) return;
    try { source.postMessage(data, TARGET_ORIGIN); } catch (_) {}
  }

  function emitEvent(name, detail) {
    if (!window.parent) return;
    try {
      window.parent.postMessage({ type: 'event', name: name, detail: detail }, TARGET_ORIGIN);
    } catch (_) {}
  }

  function getRepl() {
    if (!editorEl) return null;
    if (editorEl.editor && editorEl.editor.repl) return editorEl.editor.repl;
    if (editorEl.repl) return editorEl.repl;
    return null;
  }

  function getEvalError() {
    var repl = getRepl();
    if (!repl || !repl.state) return null;
    var err = repl.state.evalError || repl.state.error || null;
    if (!err) return null;
    return (typeof err === 'string') ? err : (err.message || String(err));
  }

  var startedAt = Date.now();
  var readyTimer = setInterval(function () {
    if (editorEl && editorEl.editor && typeof editorEl.editor.evaluate === 'function') {
      clearInterval(readyTimer);
      ready = true;
      emitEvent('ready', {});
    } else if (Date.now() - startedAt > READY_TIMEOUT_MS) {
      clearInterval(readyTimer);
      emitEvent('ready', { error: 'init timeout' });
    }
  }, 100);

  function scheduleEvalErrorCheck() {
    setTimeout(function () {
      var msg = getEvalError();
      if (msg) emitEvent('evalError', { message: msg });
    }, EVAL_ERROR_CHECK_MS);
  }

  var handlers = {
    setCode: function (payload) {
      if (!ready) throw new Error('editor not ready');
      var code = (payload && typeof payload.code === 'string') ? payload.code : '';
      editorEl.editor.setCode(code);
      return true;
    },
    evaluate: function () {
      if (!ready) throw new Error('editor not ready');
      editorEl.editor.evaluate(true);
      scheduleEvalErrorCheck();
      return true;
    },
    stop: function () {
      if (!ready) return true;
      editorEl.editor.stop();
      return true;
    },
    getCode: function () {
      if (!ready) throw new Error('editor not ready');
      return editorEl.editor.code || '';
    },
  };

  window.addEventListener('message', function (event) {
    var msg = event.data || {};
    if (msg.type !== 'rpc') return;
    var id = msg.id;
    var fn = handlers[msg.cmd];
    if (!fn) {
      reply(event.source, { type: 'rpc-result', id: id, ok: false, error: 'unknown cmd: ' + msg.cmd });
      return;
    }
    try {
      var result = fn(msg.payload);
      reply(event.source, { type: 'rpc-result', id: id, ok: true, result: result });
    } catch (e) {
      reply(event.source, { type: 'rpc-result', id: id, ok: false, error: (e && e.message) || String(e) });
    }
  });
})();
