import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const parentFiles = ['index.html', 'index.amber.html'];

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function contentSecurityPolicy(html) {
  const tag = html.match(/<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/i)?.[0] || '';
  return tag.match(/\bcontent="([^"]*)"/i)?.[1]
    || tag.match(/\bcontent='([^']*)'/i)?.[1]
    || '';
}

for (const file of parentFiles) {
  test(`${file} uses a sandboxed same-site Strudel host`, () => {
    const html = read(file);
    const iframe = html.match(/<iframe\b[^>]*\bid=["']strudelFrame["'][^>]*>/i)?.[0] || '';

    assert.match(iframe, /\bsrc=["']strudel-host\.html["']/i);
    assert.match(iframe, /\bsandbox=["']allow-scripts["']/i);
    assert.doesNotMatch(iframe, /allow-same-origin/i);
  });

  test(`${file} parent CSP excludes unsafe evaluation and allows only same-site frames`, () => {
    const html = read(file);
    const csp = contentSecurityPolicy(html);

    assert.match(csp, /\bscript-src\s+'self'(?:\s|;)/);
    assert.doesNotMatch(csp, /'unsafe-eval'/);
    assert.match(csp, /\bframe-src\s+'self'(?:\s|;)/);
    assert.match(csp, /\bobject-src\s+'none'(?:\s|;)/);
  });
}

test('Strudel host keeps unsafe evaluation isolated behind a restrictive CSP', () => {
  const html = read('strudel-host.html');
  const csp = contentSecurityPolicy(html);

  assert.match(csp, /\bdefault-src\s+'none'(?:\s|;)/);
  assert.match(csp, /\bscript-src\b[^;]*'unsafe-eval'/);
  assert.doesNotMatch(csp, /\bconnect-src\b[^;]*(?:^|\s)\*(?:\s|;)/);
  assert.doesNotMatch(csp, /\bframe-src\b/);
});

test('Strudel dependency is version-pinned and protected with SRI', () => {
  const html = read('strudel-host.html');
  const tag = html.match(/<script\b[^>]*src=["']https:\/\/unpkg\.com\/@strudel\/repl@[^"']+["'][^>]*>/i)?.[0] || '';

  assert.match(tag, /\bsrc=["']https:\/\/unpkg\.com\/@strudel\/repl@1\.3\.0\/dist\/index\.js["']/);
  assert.match(tag, /\bintegrity=["']sha384-lCEvnEkKT0yduqm8nTtM4FQxz6oegFdhDdI1nOaIpPHuQ8v1PLH7ATGwV66YH\+Ot["']/);
  assert.match(tag, /\bcrossorigin=["']anonymous["']/);
});

test('Strudel host CSP nonce authorizes the local bridge script in an opaque-origin iframe', () => {
  const html = read('strudel-host.html');
  const csp = contentSecurityPolicy(html);
  const cspNonce = csp.match(/\bscript-src\b[^;]*'nonce-([^']+)'/)?.[1];
  const localScript = html.match(/<script\b[^>]*src=["']strudel-host\.js["'][^>]*>/i)?.[0] || '';
  const scriptNonce = localScript.match(/\bnonce=["']([^"']+)["']/i)?.[1];

  assert.ok(cspNonce, 'child script-src must contain a nonce source');
  assert.equal(scriptNonce, cspNonce, 'local bridge nonce must match the child CSP nonce');
});

test('Strudel host bridge is local and does not weaken SRI loading', () => {
  const html = read('strudel-host.html');

  assert.match(html, /<script\b[^>]*src=["']strudel-host\.js["'][^>]*><\/script>/i);
  assert.doesNotMatch(html, /<script(?!\b[^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i);
});
