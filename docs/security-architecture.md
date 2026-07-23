# Security Architecture

text-to-strudel is a static browser application. Its primary security boundary separates the trusted parent application from the Strudel runtime that evaluates generated and user-edited patterns.

## Trust Boundaries

```text
Parent origin
├─ index.html / index.amber.html
├─ app.js
│  ├─ prompt and UI state
│  ├─ API key storage and direct provider requests
│  ├─ CompositionPlan generation and orchestration
│  └─ MessageChannel RPC client
└─ iframe sandbox="allow-scripts"
   └─ opaque origin
      ├─ strudel-host.html / strudel-host.js
      ├─ @strudel/repl@1.3.0
      └─ evaluated Strudel patterns
```

### Trusted parent

The parent page owns provider credentials, provider `fetch` calls, the prompt UI, musical planning, and editor orchestration. Its CSP allows scripts only from the application origin and does not allow `unsafe-eval`. It permits frames only from the application origin.

The parent sends generated or edited Strudel source to the iframe. That source can contain comments derived from the prompt, but the API key is never part of the editor RPC payload.

### Sandboxed Strudel host

`strudel-host.html` is loaded with `sandbox="allow-scripts"` and without `allow-same-origin`. The browser therefore assigns the document an opaque origin. Strudel and evaluated patterns cannot use the parent origin's `localStorage` or access the parent DOM through same-origin APIs.

The host has its own restrictive CSP. It starts with `default-src 'none'`, permits `unsafe-eval` only inside this sandbox, and allowlists the script, media, connection, image, style, and worker sources needed by Strudel. Because `'self'` does not consistently match an opaque sandbox origin, a matching CSP/script nonce authorizes the local external bridge. The policy blocks objects, forms, and base-URL changes and sends no referrer.

### External services

- `@strudel/repl@1.3.0` loads from unpkg with SHA-384 Subresource Integrity and `crossorigin="anonymous"`.
- Strudel can fetch audio and sample resources only from the origins allowed by the child CSP.
- Gemini, OpenAI, and Anthropic requests go directly from the trusted parent page to the selected provider over HTTPS. There is no application backend or credential proxy.

## Threat Model

| Threat | Mitigation | Residual risk |
|:---|:---|:---|
| Evaluated Strudel code reads the API key or parent storage | Opaque-origin iframe without `allow-same-origin`; the key is never sent over editor RPC | A browser sandbox vulnerability could defeat this boundary |
| Strudel's required dynamic evaluation weakens the application page | `unsafe-eval` exists only in the child CSP; the parent CSP excludes it | Compromised child code can act within the child CSP's network and runtime permissions |
| CDN content changes after review | Exact `1.3.0` version pin and SHA-384 SRI | Availability still depends on the CDN; changing the dependency requires reviewing and updating the SRI hash |
| Arbitrary cross-window messages control the editor | A one-time initialization transfers a `MessagePort`; later commands use only that capability | A compromised trusted parent controls the port by design |
| Malformed, oversized, stale, or reordered RPC commands | Command allowlist, exact schemas, serializability and size checks, revision matching, sequential queues, and timeouts | These checks limit the protocol; they do not make evaluated Strudel code safe outside the sandbox |
| API key survives longer than intended | Memory-only storage is the default and clears on reload/page close | JavaScript memory, DevTools, extensions, and the trusted parent can access the key while the page is open |
| User knowingly persists an API key | Plaintext disclosure and explicit confirmation before writing to `localStorage` | Same-profile users, extensions, DevTools, or parent-origin script compromise can read it |
| Older releases already stored an API key | Legacy keys remain marked as persisted instead of being mislabeled as session-only | The legacy plaintext remains until the user clears or replaces it |

## API Key Persistence Modes

### Session only (default)

The key is held in an in-memory, per-page provider map. It is not written to `localStorage` and disappears on reload or when the tab closes. Verification timestamps and the selected provider are non-secret metadata and may remain in `localStorage`.

### Persist on this device

After the user enables persistence and confirms the plaintext warning, the key is written under a provider-specific `localStorage` entry. Saving that provider in session mode removes its stored key. Clearing a key removes both memory and persisted copies.

Persistence is a usability option, not encrypted secret storage. Use it only on a trusted browser profile.

## CSP and RPC Invariants

Changes must preserve these invariants:

1. The editor iframe uses `sandbox="allow-scripts"` and never adds `allow-same-origin`.
2. The parent CSP does not include `unsafe-eval` and restricts `frame-src` to `'self'`.
3. The child CSP keeps `default-src 'none'`; only the child `script-src` permits `unsafe-eval`.
4. The local external bridge script carries the same nonce declared by the child `script-src`; do not rely on `'self'` alone inside the opaque-origin iframe.
5. The Strudel URL remains pinned to `@strudel/repl@1.3.0` with the reviewed SHA-384 SRI value unless both are deliberately updated together.
6. The child retries its bootstrap ping until the parent accepts initialization; it then accepts exactly one parent-originated `strudel:init` message with exactly one transferred port, stops retrying, and removes the global listener.
7. The long-lived capability is the transferred `MessagePort`; API keys are never sent through it.
8. RPC accepts only `setCode`, `getCode`, `evaluate`, and `stop`, with exact schemas, bounded payloads, valid IDs/revisions, ordered execution, and matching responses.

## Non-goals

This browser architecture does not protect against:

- malware, OS-level memory capture, or a compromised browser;
- privileged browser extensions, DevTools users, or another user of the same browser profile;
- malicious code executing in the trusted parent origin;
- disclosure to the selected AI provider, which necessarily receives the API key and prompt directly;
- plaintext recovery of an API key after the user explicitly enables persistence; or
- provider, CDN, or sample-host availability and their own data-handling policies.

## Verification

Install dependencies and run the automated checks:

```bash
npm install
npm test
npm run typecheck
npx playwright install
npm run e2e
```

The unit suite includes static CSP/SRI assertions, API-key storage and legacy-state tests, parent `EditorPort` tests, and child protocol validation. Playwright covers generation and playback, CSP errors, explicit persistence, legacy-key labeling, and responsive access across the configured desktop and mobile browser projects.

For a release, also inspect the deployed response headers and browser console. A hosting platform can add or override HTTP security headers beyond the checked `<meta>` policies, and automated playback success does not replace an audible manual check.
