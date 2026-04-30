# text-to-strudel

<img width="1362" height="212" alt="text-to-strudel banner" src="https://github.com/user-attachments/assets/26cbbed6-cc50-4469-a4fa-3882d370b053" />

**Turn any text into live-coded music. No server. No install. Just a browser.**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Tests](https://img.shields.io/badge/tests-32%2F32-brightgreen.svg)](#tests--type-check)
[![Type Check](https://img.shields.io/badge/tsc-0%20errors-brightgreen.svg)](#tests--type-check)

---

**text-to-strudel** is a single-page browser tool that turns arbitrary text into playable, editable music using [Strudel](https://strudel.cc), the JavaScript port of TidalCycles. Type a word, a sentence, or a feeling — pick a genre — listen. The generated code lands in a live editor you can keep modifying.

> **Two modes.** A fully deterministic **Algorithmic Mode** that needs nothing but a browser, and an **AI Creative Mode** (Gemini 3.1 Flash Lite, Claude Haiku 4.5, or OpenAI GPT-5.4 Nano) that interprets your text as feeling and imagery rather than literal transcription.

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [DJ Mixer](#dj-mixer)
- [Natural Language Edit](#natural-language-edit)
- [Genre Guide](#genre-guide)
- [API Setup](#api-setup)
- [Security Model](#security-model)
- [Themes](#themes)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [Architecture](#architecture)
- [Tests & Type Check](#tests--type-check)
- [License](#license)
- [Credits](#credits)

---

## Features

- **9 genre modes:** EDM, Jazz, Classical, Blues, Ambient, Lo-fi, World (5 subgenres), Random, Fusion.
- **Fusion toggle:** check the Fusion box, then select multiple genres to combine. Any number of genres.
- **Live Strudel editor:** edit generated code in place, `Ctrl+Enter` to re-evaluate.
- **DJ Mixer:** 13 channel strips (BPM, gain, cutoff, resonance, highpass, octave, reverb, delay, feedback, density, swing, distortion, bitcrush) + tone (6 scales) + mood (4 presets). 2-column grid. Long-press for continuous adjustment.
- **Natural-language edit:** type a change in plain English. The LLM modifies the program surgically and preserves unrelated structure. (Requires API key.)
- **Mood buttons:** dark / euphoric / dreamy / aggressive — compound parameter shifts in algo mode; creative reinterpretation via LLM in AI mode.
- **Regenerate:** same input, different result. Algo mode increments seed; AI mode adjusts temperature / topP per regen.
- **Dynamic error recovery:** if generated code has runtime errors, the system detects them via `repl.state.evalError`, sends code + error back to the LLM for a fix, retries up to 3 times, then falls back to algorithmic `tryFixFromError`.
- **Deterministic algo output:** same `text + genre + seed` → identical code, byte for byte.
- **6–12 layers per generation:** drums, percussion, bass, lead, countermelody, chords, arp, texture/noise.
- **Two themes:** Matrix (green-on-black, 2-column, JetBrains Mono) and Amber (warm dark, single-column, Outfit + Red Hat Mono).
- **Hardened by default:** API keys live in `sessionStorage` (cleared when the tab closes); persistence is opt-in. CSP locks down `frame-ancestors`, `base-uri`, `form-action`, `object-src`, with an explicit allow-list for every Strudel sample host. SRI on the Strudel REPL bundle.
- **Cancellable + timed-out fetches:** every LLM call uses `AbortController` with a hard 60s timeout. A new generate cancels the prior in-flight call.
- **Zero friction, zero build:** no server, no npm, no bundler. Open the HTML file and go. `npm test` and `npm run typecheck` are *optional* dev tooling.

---

## Quick Start

1. Open `index.html` in any modern browser, or serve the directory with any static HTTP server (`python3 -m http.server 8000`).
2. Type anything in the text input — a word, a phrase, a memory, a feeling.
3. Pick a genre (EDM is the default). Tick **Fusion** to combine multiple genres.
4. Click **Generate & Play**. Music starts automatically.
5. Use the **DJ Mixer** to tweak parameters, or type a change in the **Edit** field (AI mode).
6. Click **Regen** for a different interpretation of the same input.
7. Click **Stop** or press **Ctrl+.** to silence everything.

> Want AI Creative Mode? Click **api**, select a provider, paste your key, press Enter. See [API Setup](#api-setup).

---

## How It Works

### Algorithmic Mode (no API key)

The pipeline is fully deterministic. Same input + genre + seed → identical output.

**1. Text Analysis** — five qualities (each 0–1):

| Quality | Derived From |
|:---|:---|
| **Energy** | unique character density, punctuation, uppercase, word count |
| **Brightness** | vowel-to-consonant ratio (ASCII vowels + Hangul syllable contribution) |
| **Weight** | average word length |
| **Space** | whitespace ratio, short-phrase bonus |
| **Complexity** | unique character ratio |

> Hangul note: each Korean syllable contributes 0.5 to the vowel count, since every syllable contains exactly one medial vowel along with one or two consonants. Pure-Hangul input therefore produces a sensible, finite brightness — not zero.

**2. Genre Resolution** — each genre defines tempo range, scale pool, sound sets, drum patterns, chord progressions, and layer-specific FX functions. **Random** mixes 3 genres. **Fusion** blends N selected genres (averaged tempos, concatenated scales, mixed sounds).

**3. Code Generation** — motif-based melodies with call-and-response, walking bass (8 types), 6 chord voicings, genre drums, plus 12 artist-inspired techniques applied probabilistically (`.off`, `.superimpose`, `.jux`, `.echoWith`, `.degradeBy`, Perlin filter, etc.).

**4. Arrangement** — staggered layer entry via `.mask()`, periodic variation via `.every()`, filter fade-ins, breathing degradation.

### AI Creative Mode (with API key)

The tool sends the input to **Gemini 3.1 Flash Lite**, **Claude Haiku 4.5**, or **OpenAI GPT-5.4 Nano**.

- **System prompt (~1300 tokens):** creative-process framework, music theory principles, mood parameters, 17 critical reminders.
- **User message (~3100 tokens):** input text, genre context with arrangement structures, complete Strudel component reference (92 scales, 100+ instruments, 58 effects), 29 structural idioms.
- **Error recovery:** on runtime error, the system feeds code + error back to the LLM for a fix, up to 3 retries, then falls back to algorithmic repair.
- **Refusal handling:** explicit error messages on Claude `stop_reason: 'refusal'`, OpenAI `finish_reason: 'content_filter'`, and Gemini `finishReason: SAFETY|RECITATION|BLOCKLIST` — no silent empty-code injection.

---

## DJ Mixer

Appears after the first generation. All mixer controls use **algorithmic regex modification** (instant, free, no API calls) regardless of API-key state.

**Channel strips** (2-column grid, each with `[-][+]`):

| Channel | Effect | Range |
|:---|:---|:---|
| BPM | Tempo | 40 – 400 |
| Gain | Volume | 0.05 – 1.0 |
| Cutoff | Low-pass filter | 100 – 12000 Hz |
| Resonance | Filter Q | 0 – 50 |
| Highpass | High-pass filter | 20 – 8000 Hz |
| Octave | Pitch shift | 1 – 7 |
| Reverb | Room size | 0 – 1.0 |
| Delay | Delay send | 0 – 1.0 |
| Feedback | Delay feedback | 0 – 0.95 |
| Density | Euclidean hits | 1 – N |
| Swing | Shuffle feel | off / on |
| Distortion | Waveshape | 0 – 1.0 |
| Bitcrush | Bit depth | 1 – 16 |

**Tone:** major, minor, dorian, phrygian, lydian, pentatonic — replaces the scale across all layers.

**Mood:** dark, euphoric, dreamy, aggressive — compound: adjusts tempo + filter + reverb + gain simultaneously. Uses LLM when an API key is present.

**Long-press:** hold any +/- button for 400 ms to enter continuous adjustment (150 ms repeat). Implemented via single delegated mousedown/touchstart on the mixer container — one listener for the whole grid.

**Click feedback:** green flash = value changed. Red flash = no matching parameter in the code.

In AI mode, click **mixer** in the Edit row to show/hide the mixer.

---

## Natural Language Edit

Available in AI mode. Type any instruction, press Enter or click **apply**.

```
> remove drums and add piano          [apply]
> make the bass more complex
> change everything to Japanese style
> add a breakdown at cycle 16
```

Uses a separate edit-focused system prompt: *"Preserve unrelated code and comments. Prefer minimal edits over full rewrites."* Temperature 0.2 for precision (1.0 for Gemini, which can't go lower per Google guidance). The LLM modifies the existing code surgically rather than rewriting from scratch.

---

## Genre Guide

| Genre | BPM | Layers |
|:---|:---|:---|
| **EDM** | 124 – 140 | drums, perc, bass, lead, countermelody, chords, arp, texture |
| **Jazz** | 84 – 148 | drums, perc, bass, lead, countermelody, chords, texture |
| **Classical** | 62 – 116 | bass, lead, countermelody, chords, arp, texture |
| **Blues** | 72 – 108 | drums, perc, bass, lead, countermelody, chords, texture |
| **Ambient** | 50 – 76 | bass, pad, lead, arp, texture |
| **Lo-fi** | 68 – 86 | drums, perc, bass, lead, countermelody, chords, texture |
| **World** | 78 – 126 | drums, perc, bass, lead, countermelody, chords, texture |
| **Random** | varies | mixed from 3 random genres |
| **Fusion** | averaged | blended from N selected genres |

**World subgenres:** Flamenco, Japanese, Indian, Eastern European, Arabic — each with tradition-specific scales, keys, and instruments.

---

## API Setup

| Provider | Model | Key format | Console |
|:---|:---|:---|:---|
| **Gemini** (default) | `gemini-3.1-flash-lite-preview` | `AIza...` | [aistudio.google.com](https://aistudio.google.com) |
| **Claude** | `claude-haiku-4-5-20251001` | `sk-ant-...` | [console.anthropic.com](https://console.anthropic.com) |
| **OpenAI** | `gpt-5.4-nano` | `sk-...` | [platform.openai.com](https://platform.openai.com) |

1. Click **api** in the side panel.
2. Pick a provider from the dropdown.
3. Paste your key, press Enter (auto-verifies via the provider's `/v1/models` endpoint).
4. Green = verified. Red = invalid (with HTTP status). Timeout messages on slow networks.

**Verification details**

- Verify pings use `AbortController` with a 10 s timeout.
- A successful verify writes a timestamp under `tts_verified_at_<provider>`. Subsequent calls trust it for **24 h**, then re-verify.
- A real `callLLM()` failing with `401` or `403` invalidates the timestamp immediately. The UI re-prompts.
- `429` (rate-limit) and `403` (billing/region) are reported with explicit copy.

**Temperature handling**

- **Gemini:** fixed at 1.0 (Google recommends not lowering for Gemini 3+). Variation via `topP` (0.9 → 0.99 per regen).
- **Claude:** 0.9 → 1.2 per regen. Range 0.0 – 1.2.
- **OpenAI:** 0.9 → 1.2 per regen. Requires `reasoning: {effort: 'none'}` for temperature support.

---

## Security Model

This is a static client-side site. The trade-offs are visible and documented.

| Surface | Mitigation |
|:---|:---|
| Strudel REPL evaluates user-typed code via `unsafe-eval` | Required by Strudel; cannot be removed without dropping the live editor. |
| LLM API keys in browser storage | Default = `sessionStorage` (cleared with the tab). Optional persist = `localStorage` (toggle in the API panel). |
| Sticky verified flag (old behavior) | Replaced with 24 h TTL + automatic invalidate on 401/403 from real calls. |
| Supply-chain compromise of `@strudel/repl` CDN | SRI hash on the `<script>` tag. Bundle pinned to `@1.3.0`. |
| Sample/data hosts in `connect-src` and `media-src` | Explicit allow-list: `raw.githubusercontent.com`, `*.githubusercontent.com`, `felixroos.github.io`, `cdn.freesound.org`, `shabda.ndre.gr`, `kabel.salat.dev`, `strudel.cc`, `*.strudel.cc`. |
| Clickjacking, base-tag injection, form hijacking | CSP `frame-ancestors 'none'`, `base-uri 'self'`, `form-action 'none'`, `object-src 'none'`. |
| Referrer leakage to APIs | `<meta name="referrer" content="no-referrer">`. |
| Network hang / runaway request | 60 s hard timeout per LLM call (10 s for verify). |
| Race between repeated Generate clicks | Channel-based cancellation (`generate` / `refine` / `edit` / `fix` / `verify`); a new request aborts the prior in-flight one. `Stop` cancels everything. |
| Empty / refused LLM response silently overwriting good code | Explicit checks for `refusal`, `content_filter`, `SAFETY`, and empty content. Surfaces as a status error instead of injecting garbage. |

Pinning + grep recipe for upgrading Strudel:

```bash
curl -s https://unpkg.com/@strudel/repl@<version>/dist/index.js \
  | grep -oE 'https?://[a-zA-Z0-9.-]+' | sort -u
```

Add any new host to both `connect-src` and `media-src` in `index.html` and `index.amber.html`. Update the integrity hash on the `<script>` tag.

---

## Themes

| Theme | File | Aesthetic |
|:---|:---|:---|
| **Matrix** | `index.html` | green on black, JetBrains Mono, 2-column, CRT scanlines, sharp corners |
| **Amber** | `index.amber.html` | warm amber on dark, Outfit + Red Hat Mono, single-column, film grain, rounded pills |

Both share the same `app.js`. All features work identically. Switch by opening a different HTML file.

---

## Keyboard Shortcuts

| Shortcut | Action |
|:---|:---|
| `Enter` | Generate & Play (from text input) / Save API key / Apply edit |
| `Shift+Enter` | New line in text input |
| `Ctrl+Enter` | Re-evaluate code in editor |
| `Ctrl+.` | Stop playback |
| `Ctrl+Z` | Undo in editor |

---

## Architecture

```
text-to-strudel/
  index.html           Matrix theme (~585 lines)
  index.amber.html     Amber theme  (~294 lines)
  app.js               All logic    (~2330 lines, // @ts-check, JSDoc-typed)
  package.json         Optional dev tooling (test + typecheck scripts)
  test/
    smoke.test.mjs     32 node:test cases
  README.md
  README-ko.md         Korean docs translation (separate from UI)
  LICENSE              AGPL-3.0
```

**`app.js`** is one file by design — opening `index.html` and pressing F12 should let anyone trace any feature in under five minutes. Sections are flagged with `// ---- HEADER ----` comments:

| Section | What |
|:---|:---|
| `TUNING` / `MODELS` / `NET` | tunable constants (BPM/gain/filter ranges, model IDs, fetch timeouts, verify TTL) |
| `createRNG`, `analyzeText` | seeded PRNG + 5-feature text analysis (Hangul-aware) |
| `GENRES`, `TECHNIQUES`, `GENRE_CONTEXT` | genre defs + 12 artist-inspired techniques + LLM context |
| `generateCode` | algorithmic pipeline: motif → bass → chords → arp → texture → arrangement |
| `callLLM` | unified provider dispatch — Gemini, OpenAI, Claude — with timeout + cancel + refusal handling |
| `setCodeAndPlay` + `tryFixFromError` + `fixWithLLM` | error-recovery loop |
| `REFINERS` table + `algoRefine` | 30-entry refex transform table for mixer +/- buttons |
| API key UI IIFE | sessionStorage by default, opt-in persist, TTL verify |
| Mixer event delegation IIFE | one mousedown/touchstart on the mixer covers all 30 buttons |

**Two HTMLs** share the same DOM IDs and class names. Picking a theme is just opening a different file.

---

## Tests & Type Check

```bash
npm test           # 32 node:test smoke tests
npm run typecheck  # tsc --checkJs against JSDoc annotations (0 errors)
```

`app.js` opts into TypeScript checking with `// @ts-check` at the top and JSDoc `@type` / `@typedef` annotations throughout. The check covers DOM type narrowing (`HTMLInputElement` placeholders, `HTMLButtonElement.disabled`, `dataset` on `HTMLElement`), the `Provider` and `Channel` enums on `callLLM()`, the `Analysis` shape from `analyzeText()`, and the Strudel REPL custom-element augmentation. JSDoc only — no `tsconfig.json`, no `.ts` files, no compile step. The same `app.js` ships unmodified to the browser.

The 32 smoke tests cover the pure-function surface:

- `analyzeText` — empty defaults, English finite values in [0, 1], **Hangul brightness regression guard**, Korean + English mixed input
- `createRNG` — seed determinism, divergence between unrelated seeds
- `stripFences` — triple-backtick removal
- `stripFnCall` — **nested-paren regression guard** for `.foo(x.bar(1,2)).baz()`
- `nameOnlyInsideStrings` — string-only vs real-call detection
- `tryFixFromError` — `'X is not defined'` commenting that **preserves mini-notation string mentions**, `setBPM → setcpm`, `line(a,b,n) → saw.range`, `'X is not a function'` substitution
- `normalize` — gm_pad numbered-name rewriting
- `algoRefine` — BPM up/down with TUNING.BPM clamps, gain factor clamping, unknown direction returns code unchanged
- `generateCode` — **deterministic snapshot regression guard** + seed divergence
- `saveApiKey` / `getApiKey` — persist=false (sessionStorage only), persist=true (both stores), `''` clears both, sessionStorage prefer + localStorage fallback warming the session cache
- `isVerified` / `invalidateVerified` — 24 h TTL window enforcement, timestamp clearing
- `cancelInflight` — controller cleanup
- `isAbortError` — AbortError name + 'aborted' message detection

Tests run via `vm.runInContext` with stubbed `document`, `localStorage`, `sessionStorage`, `fetch`, `AbortController`, and `CustomEvent` so `app.js` loads as-is without a DOM. No transpile, no test framework dependency beyond Node's built-in `node:test`.

---

## License

**AGPL-3.0-only** &middot; Copyright (C) 2026 DaehyeonKim &middot; [LICENSE](./LICENSE)

Licensed under the GNU Affero General Public License v3.0 due to its dependency on [`@strudel/repl`](https://www.npmjs.com/package/@strudel/repl), which is AGPL-3.0. The library is loaded unmodified via CDN with an SRI integrity hash and pinned to `1.3.0`.

### AGPL §13 — Remote Network Interaction

If you fork this project and host a modified version anywhere users interact with it over a network (including GitHub Pages, Netlify, Vercel, your own server, or embedded inside another product), AGPL §13 obliges you to **prominently offer those users access to the corresponding source code of *your* version**. The footer of each theme already exposes a "source" link to this repository — keep that pattern (or equivalent) in any fork.

### Third-Party Runtime Data

Audio samples, drum-machine definitions, and webaudiofont data are fetched at runtime from external hosts (see the [Security Model](#security-model) allow-list). They are *not* bundled or redistributed by this project. Their licenses live with their original publishers — most are public-domain, CC0, or CC-BY:

| Host | What | Upstream license |
|:---|:---|:---|
| `raw.githubusercontent.com/tidalcycles/Dirt-Samples` | TidalCycles drum samples | GPL-3.0 (per the upstream `LICENSE`) |
| `raw.githubusercontent.com/felixroos/dough-samples` | drum-machine definitions | per upstream repo |
| `raw.githubusercontent.com/tidalcycles/uzu-drumkit` | uzu drum kit | per upstream repo |
| `felixroos.github.io/webaudiofontdata` | GM SoundFont samples | per upstream (mostly MIT/CC) |
| `cdn.freesound.org` | freesound previews | per individual upload (CC-BY / CC0 / etc.) |
| `shabda.ndre.gr` | speech synthesis | per upstream |

When you redistribute *generated music* that contains these samples, the sample licenses apply to your redistribution — text-to-strudel does not grant any rights it does not own.

---

## Credits

- **[Strudel](https://strudel.cc)** by Alex McLean and contributors — the live coding environment that makes this possible.
- **Google Gemini API** — AI creative mode via Gemini 3.1 Flash Lite.
- **Anthropic Claude API** — AI creative mode via Claude Haiku 4.5.
- **OpenAI API** — AI creative mode via GPT-5.4 Nano.

No third-party code was copied into this project. The 29 code-structure patterns documented in the LLM context message are original structural idioms, not reproductions of existing compositions.
