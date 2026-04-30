# Phase 0 Prototype Results

> Tier 2 viability gate per `.sisyphus/plans/security-plan.md` §2.
> Run `prototype/iframe-test/parent.html` (any static server, e.g. `python3 -m http.server`) and record outcomes below.

## Setup
- Strudel version: `@strudel/repl@1.3.0` (SRI sha384-lCEvnEkKT0yduqm8nTtM4FQxz6oegFdhDdI1nOaIpPHuQ8v1PLH7ATGwV66YH+Ot)
- iframe: `<iframe sandbox="allow-scripts">` (no allow-same-origin)

## Check 1 — Audio playback in sandboxed iframe
| Browser | Audible? | Notes |
|---|---|---|
| Chrome (latest) | ☐ pass / ☐ fail | |
| Firefox (latest) | ☐ pass / ☐ fail | |
| Safari (latest) | ☐ pass / ☐ fail | |

## Check 2 — Keyboard input + Ctrl+Enter inside iframe
| Browser | Works? | Notes |
|---|---|---|
| Chrome  | ☐ pass / ☐ fail | |
| Firefox | ☐ pass / ☐ fail | |
| Safari  | ☐ pass / ☐ fail | |

## Check 3 — postMessage RTT
| Browser | p50 (ms) | p95 (ms) | Pass (<50ms p95)? |
|---|---|---|---|
| Chrome  |  |  | ☐ |
| Firefox |  |  | ☐ |
| Safari  |  |  | ☐ |

## Check 4 — localStorage / window.name isolation
Run "Probe parent storage from iframe" button and paste the reply JSON:

```json

```

Expected: `localStorageRead` empty/null, `windowNameRead` empty (or different from parent's), `parentLocationHrefRead` throws SecurityError.

## GO / NO-GO

- [ ] All four checks pass on Chrome, Firefox, Safari → **GO** (continue to PR #1)
- [ ] Any check fails → **NO-GO** (pivot to Tier 1 — Web Crypto + passphrase only)

Decision: ___________________
Recorded by: _______________
Date: _____________________
