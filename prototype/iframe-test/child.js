  // We are inside <iframe sandbox="allow-scripts"> with no allow-same-origin,
  // so our origin is opaque ("null") and we cannot specify a useful
  // targetOrigin for postMessage replies — we must use '*'.
  const PARENT_TARGET_ORIGIN = '*';

  const editorEl = document.getElementById('strudelEditor');
  const statusEl = document.getElementById('status');

  let editorReady = false;

  function reply(source, data) {
    try { source.postMessage(data, PARENT_TARGET_ORIGIN); } catch (e) { /* ignore */ }
  }

  // Poll for editor.editor (the underlying StrudelMirror instance) up to 10s.
  const startedAt = performance.now();
  const readyTimer = setInterval(() => {
    if (editorEl && editorEl.editor && typeof editorEl.editor.evaluate === 'function') {
      clearInterval(readyTimer);
      editorReady = true;
      statusEl.textContent = 'ready';
      statusEl.classList.add('ready');
      if (window.parent) reply(window.parent, { type: 'ready' });
    } else if (performance.now() - startedAt > 10000) {
      clearInterval(readyTimer);
      statusEl.textContent = 'editor failed to initialise within 10s';
      if (window.parent) reply(window.parent, { type: 'ready', ok: false, error: 'editor init timeout' });
    }
  }, 100);

  function tryRead(fn) {
    try {
      const v = fn();
      return { ok: true, value: v == null ? String(v) : String(v) };
    } catch (e) {
      return { ok: false, error: (e && e.message) ? e.message : String(e) };
    }
  }

  window.addEventListener('message', (event) => {
    const msg = event.data || {};
    const src = event.source;
    if (!src) return;

    switch (msg.type) {
      case 'ping': {
        reply(src, { type: 'pong', id: msg.id });
        return;
      }

      case 'eval': {
        if (!editorReady) {
          reply(src, { type: 'evalResult', ok: false, error: 'editor not ready' });
          return;
        }
        try {
          editorEl.editor.setCode(String(msg.code || ''));
          editorEl.editor.evaluate(true);
          reply(src, { type: 'evalResult', ok: true });
        } catch (e) {
          reply(src, { type: 'evalResult', ok: false, error: (e && e.message) || String(e) });
        }
        return;
      }

      case 'stop': {
        try {
          if (editorReady) editorEl.editor.stop();
          reply(src, { type: 'stopResult', ok: true });
        } catch (e) {
          reply(src, { type: 'stopResult', ok: false, error: (e && e.message) || String(e) });
        }
        return;
      }

      case 'probe': {
        const localStorageRead = tryRead(() => {
          // Parent set: localStorage['tts_proto_sentinel'] = 'parent-only-secret-XYZ'
          // Inside opaque-origin sandbox, localStorage should be unavailable
          // OR scoped to a different storage partition (so the read returns null).
          const v = localStorage.getItem('tts_proto_sentinel');
          return v;
        });
        const windowNameRead = tryRead(() => {
          // Parent set window.name = 'parent-name-secret-ABC'. The iframe's own
          // window.name is independent; reading parent.window.name should throw.
          return window.name;
        });
        const parentLocationHrefRead = tryRead(() => {
          // Cross-origin (opaque vs real origin) access to parent.location.href
          // must throw a SecurityError.
          return window.parent.location.href;
        });
        const parentNameRead = tryRead(() => {
          // window.name on the parent window — also expected to throw or be opaque.
          return window.parent.name;
        });
        reply(src, {
          type: 'probeResult',
          localStorageRead,
          windowNameRead,
          parentLocationHrefRead,
          parentNameRead,
          ownOrigin: (function () { try { return location.origin; } catch (e) { return String(e); } })(),
        });
        return;
      }

      default:
        reply(src, { type: 'unknown', received: msg.type || null });
    }
  });
