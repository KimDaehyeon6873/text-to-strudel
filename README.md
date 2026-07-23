# text-to-strudel

<img width="1362" height="212" alt="text-to-strudel" src="https://github.com/user-attachments/assets/26cbbed6-cc50-4469-a4fa-3882d370b053" />

**Turn text into live-coded music in the browser.**

[한국어](README-ko.md) · [Strudel](https://strudel.cc) · [Security architecture](docs/security-architecture.md) · [AGPL-3.0](LICENSE)

text-to-strudel turns a phrase into a coherent musical interpretation and editable Strudel code. Algorithmic mode is local and deterministic. An optional API key enables richer LLM-based interpretation and natural-language editing.

## Features

- EDM, Jazz, Classical, Blues, Ambient, Lo-fi, World, Random, and multi-genre Fusion modes
- A shared `CompositionPlan` for key, harmony, phrase, bass, groove, form, sounds, and arrangement
- Chord-aware bass and melodies derived from one voice-led `chord(...).dict("ireal")` progression
- Genre-specific harmony, including jazz ii–V–I turnarounds, classical cadences, and true 12-bar blues
- 4–7 purposeful layers instead of stacking every available part
- Focused **New melody**, **New groove**, and **New arrangement** variations, plus a full **New take**
- Unicode- and Hangul-aware deterministic text analysis
- Sandboxed Strudel execution separated from the parent application and API keys
- Two interfaces that share the same engine: Matrix and Amber

## Quick Start

Serve the project over local HTTP:

```bash
python3 -m http.server 8080
```

Open `http://localhost:8080`, enter text, choose a genre, and select **Generate & Play**. The iframe and CSP architecture expects an HTTP(S) origin; opening `index.html` directly with a `file:` URL is not a supported launch path.

The browser app has no build step. It loads the pinned `@strudel/repl@1.3.0` runtime from unpkg, so the first load requires network access.

## Music Engine

### 1. Deterministic cue and structural analysis

Algorithmic mode normalizes input with Unicode NFKC and processes Unicode code points. It combines:

- a finite set of English and Korean affect cues for bright/dark, intense/calm, and heavy/airy qualities;
- structural measurements such as word count, punctuation, casing, character density, average word length, and character diversity; and
- a deterministic fingerprint of the full normalized text, genre, and variation state for seeded musical choices.

This analyzer proposes a musical interpretation; it does not perform general contextual or semantic understanding. Distinct full texts can still produce different seeded choices even when their metric summaries are similar.

| Metric | Current role in algorithmic output |
|:---|:---|
| Energy | Tempo, phrase and bass activity, drum dynamics, optional percussion, and selected techniques |
| Brightness | Harmony-profile matching and filter ranges |
| Weight | Filter range and texture level |
| Space | Room, spacing-oriented techniques, filtering movement, and optional texture |
| Tension | Harmony-profile matching |
| Complexity | Calculated and shown in the generated mood comment; it does not independently drive rendered music |
| Valence | Calculated and shown in the generated mood comment; it does not independently drive rendered music |

AI creative mode sends the prompt directly from the browser to the selected provider for a richer semantic interpretation.

### 2. Shared harmony and voice leading

`createCompositionPlan()` selects a key, harmonic profile, form, tempo, phrase, bass pattern, sounds, and arrangement. `renderCompositionPlan()` then declares one shared harmony:

```js
const harmony = chord("<Dm7 G7 C^7 A7>").dict("ireal")
```

The bass follows its roots, the chord layer uses anchored voicings, and lead/accent phrases use `harmony.n(...).voicing()`. This keeps the parts harmonically related instead of giving each layer an independent note pool.

Algorithmic output is deterministic for the same normalized text, genre, and variation state.

### 3. Purposeful layers and form

Each take renders 4–7 roles chosen for the music: drums, bass, harmony, lead, an answering accent or arpeggio, percussion, and texture. Every role has an arrangement mask and a routing purpose:

| Orbit | Roles |
|:---|:---|
| 1 | Drums and percussion |
| 2 | Bass |
| 3 | Harmony |
| 4 | Lead |
| 5 | Countermelody or arpeggiated accent |
| 6 | Texture and air |

Most arrangements use a 16-cycle intro/build/break/release form. Ambient gets slower fade/bloom forms. Blues preserves 12 harmonic bars inside a 24-cycle, two-chorus arrangement.

## Variations

Focused variation buttons are available in algorithmic mode:

| Action | Changes | Preserves |
|:---|:---|:---|
| **New melody** | Lead and answering phrase | Harmony, groove, sounds, form |
| **New groove** | Drum choice, drum dynamics, groove-seeded percussion | Harmony and melody |
| **New arrangement** | Form, sounds, optional roles, techniques, and arrangement FX | Harmony symbols, bass pattern, lead phrase |
| **New take** | Harmony, melody, groove, and arrangement together | Input text and selected genre |

Focused variations patch only the relevant layers in the current editor code, preserving unrelated tone, tempo, sound-polish, and manual edits. **New take** intentionally creates a new musical identity instead.

**New groove** is disabled when the composition has no drums, such as Classical or Ambient.

## Sound Polish

The sound-polish panel can adjust tempo, gain, cutoff, resonance, high-pass filtering, octave, reverb, delay, feedback, rhythmic density, swing, distortion, bit depth, and harmonic tone. Availability is evaluated against the current code: controls at a limit or without a matching musical target are disabled.

Tone buttons reharmonize the shared progression while preserving its form; a blues take remains 12 bars after a tone change.

Mood buttons are distinct macros:

- **dark:** slower, darker, lower, minor
- **euphoric:** faster, brighter, louder, Lydian, more reverb
- **dreamy:** slower, darker, more reverb/delay, pentatonic
- **aggressive:** faster, louder, denser, more resonant/distorted, Phrygian

With an API key, mood buttons request an AI reinterpretation. Other sound-polish adjustments remain immediate local edits.

## Genre Guide

| Genre | Harmonic/form character |
|:---|:---|
| EDM | Minor, Dorian, major-release, or Phrygian tension profiles |
| Jazz | Major ii–V–I, minor turnaround, or modal bridge with extended chords |
| Classical | Authentic, minor-lament, or deceptive cadences |
| Blues | I7–IV7–V7 12-bar shuffle/slow-burn progression and 24-cycle form |
| Ambient | Suspended Lydian, Dorian orbit, or spacious pentatonic movement |
| Lo-fi | Extended seventh/ninth-chord loops with circular forms |
| World | Modal drone, open fifths, or harmonic-minor cadence with regional sounds |
| Random | Independently combines harmonic, timbral, and groove sources |
| Fusion | Uses the first selected genre for harmony and combines sounds/groove across selections |

World mode includes Flamenco, Japanese, Indian, Eastern European, and Arabic sound palettes.

## AI Creative Mode and API Keys

Open **API**, select Gemini, Claude, or OpenAI, and save a provider key. AI mode can generate a new interpretation and apply natural-language edits to the current Strudel code.

API key storage is per provider:

- **Session only (default):** the key stays in JavaScript memory for the current page and is cleared on reload or when the tab closes.
- **Persist on this device:** after an explicit disclosure and confirmation, the key is stored as plaintext in browser `localStorage`. Use this only in a trusted browser profile.
- Keys saved by older releases remain in `localStorage` and are marked as persisted rather than silently relabeled as session-only.

This remains a browser-only application. Provider requests and API keys go directly from the browser to the selected provider; no project server secures, proxies, or hides them. Browser extensions, DevTools, malicious code in the trusted parent page, or another user of the same browser profile may access a persisted key.

The focused algorithmic variation buttons are hidden in AI mode; use **New take** or the **Edit** field for creative changes.

## Runtime Isolation

The parent page owns UI state, API keys, provider requests, and orchestration. Strudel and evaluated patterns run in `strudel-host.html`, an iframe with `sandbox="allow-scripts"` and therefore an opaque origin. The parent transfers one `MessagePort` during initialization; subsequent editor commands use that port rather than a persistent global `message` listener.

The parent CSP excludes `unsafe-eval`. Only the sandboxed host permits the evaluation required by Strudel, under a separate restrictive CSP. Because CSP `'self'` does not consistently match an opaque sandbox origin, the child CSP and local external bridge script use a matching nonce. The child retries a bootstrap ping until the parent accepts the one-time `MessagePort` initialization. The Strudel dependency is pinned to `@strudel/repl@1.3.0` and protected by SHA-384 Subresource Integrity. See [Security Architecture](docs/security-architecture.md) for the trust boundaries, invariants, and non-goals.

## Project Structure and Tests

```text
index.html                     Matrix interface and parent CSP
index.amber.html               Amber interface and parent CSP
app.js                         Composition engine, provider calls, key storage, and iframe RPC client
strudel-host.html              Sandboxed Strudel host, child CSP, and pinned SRI dependency
strudel-host.js                Validated MessagePort RPC server
package.json                   Node, TypeScript, and Playwright scripts
test/                          Unit and static security regression tests
e2e/                           Playwright browser tests
docs/musicality-checklist.md   A/B listening checklist
docs/security-architecture.md  Browser trust boundaries and threat model
README.md / README-ko.md       English and Korean documentation
```

Install the development tools, then run the checks:

```bash
npm install
npm test
npm run typecheck
npx playwright install
npm run e2e
```

`npm run e2e` starts a local HTTP server automatically and runs desktop Chromium, Firefox, WebKit, and the configured mobile browser projects. On Linux CI or a new machine, Playwright may also require system dependencies; use `npx playwright install --with-deps` when appropriate.

## Keyboard Shortcuts

| Shortcut | Action |
|:---|:---|
| `Enter` | Generate from the text field, save an API key, or apply an edit |
| `Shift+Enter` | Insert a line break in the text field |
| `Ctrl+Enter` | Re-evaluate the editor |
| `Ctrl+.` | Stop playback |
| `Ctrl+Z` | Undo in the editor |

## License and Credits

Licensed under [AGPL-3.0](LICENSE). The app uses [Strudel](https://strudel.cc) by Alex McLean and contributors, loaded as the pinned `@strudel/repl@1.3.0` browser dependency.
