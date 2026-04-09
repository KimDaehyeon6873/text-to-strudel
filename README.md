# text-to-strudel

<img width="1362" height="212" alt="스크린샷 2026-04-09 오후 5 27 47" src="https://github.com/user-attachments/assets/26cbbed6-cc50-4469-a4fa-3882d370b053" />

**Turn any text into live-coded music. No server. No install. Just a browser.**

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

---

**text-to-strudel** is a browser-based tool that converts arbitrary text input into playable, editable music using [Strudel](https://strudel.cc), the JavaScript port of TidalCycles. Type a word, a sentence, a feeling -- pick a genre -- and listen. The generated code appears in a live editor where you can modify it in real time.

> **Two modes of operation:** Choose between a fully deterministic **Algorithmic Mode** that needs nothing but a browser, or an **AI Creative Mode** (Gemini 3.1 Flash Lite, Claude Haiku 4.5, or OpenAI GPT-5.4 Nano) that interprets your text as feeling and imagery rather than literal transcription.

---

## Table of Contents

- [Features](#features)
- [Quick Start](#quick-start)
- [How It Works](#how-it-works)
- [DJ Mixer](#dj-mixer)
- [Natural Language Edit](#natural-language-edit)
- [Genre Guide](#genre-guide)
- [Architecture](#architecture)
- [API Setup](#api-setup)
- [Themes](#themes)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [License](#license)
- [Credits](#credits)

---

## Features

- **9 genre modes:** EDM, Jazz, Classical, Blues, Ambient, Lo-fi, World (5 subgenres), Random, Fusion
- **Fusion toggle:** Check the Fusion box, then select multiple genres to combine. Any number of genres.
- **Interactive Strudel editor:** Edit generated code live, press `Ctrl+Enter` to re-evaluate instantly
- **DJ Mixer:** 13 channel strips (BPM, gain, cutoff, resonance, highpass, octave, reverb, delay, feedback, density, swing, distortion, bitcrush) + tone (6 scales) + mood (4 presets). 2-column grid. Long-press for continuous adjustment.
- **Natural language Edit:** Type what you want to change in plain English. LLM modifies the code surgically, preserving structure. (Requires API key)
- **Mood buttons:** dark / euphoric / dreamy / aggressive. Compound parameter shifts in algo mode; creative reinterpretation via LLM in AI mode.
- **Regenerate:** Same input, different result. Algorithmic mode increments seed; AI mode adjusts temperature/topP.
- **Dynamic error recovery:** If generated code has errors, the system auto-detects them, sends code + error to LLM for fix, retries up to 3 times. Falls back to algorithmic pattern-matching if no API key.
- **Deterministic output:** In algorithmic mode, the same `text + genre + seed` always produces the exact same music.
- **6-12 layers per generation:** drums, percussion, bass, lead, countermelody, chords, arp, texture/noise.
- **Two themes:** Matrix (green-on-black, 2-column, JetBrains Mono) and Amber (warm dark, single-column, Outfit + Red Hat Mono).
- **Zero friction:** No server, no npm, no build step. Open the HTML file and go.

---

## Quick Start

1. Open `index.html` in any modern browser (or serve via any static HTTP server).
2. Type anything in the text input -- a word, a phrase, a memory, a feeling.
3. Select a genre (EDM is the default). Check **Fusion** to combine multiple genres.
4. Click **Generate & Play**. Music starts automatically.
5. Use the **DJ Mixer** to tweak parameters, or type a change in the **Edit** field.
6. Click **Regen** for a different interpretation of the same input.
7. Click **Stop** or press **Ctrl+.** to silence everything.

> Want AI Creative Mode? Click **API**, select a provider, enter your key, press Enter. See [API Setup](#api-setup).

---

## How It Works

### Algorithmic Mode (no API key)

The algorithmic pipeline is fully deterministic. Given the same input text, genre, and seed counter, it produces identical output every time.

**1. Text Analysis** -- The input is analyzed for five qualities (0-1):

| Quality | Derived From |
|:---|:---|
| **Energy** | Unique character density, punctuation, uppercase, word count |
| **Brightness** | Vowel-to-consonant ratio |
| **Weight** | Average word length |
| **Space** | Whitespace ratio, short phrase bonus |
| **Complexity** | Unique character ratio |

**2. Genre Resolution** -- Each genre defines tempo range, scale pool, sound sets, drum patterns, chord progressions, and layer-specific FX functions. **Random** mixes 3 genres. **Fusion** blends N selected genres (averaged tempos, concatenated scales, mixed sounds).

**3. Code Generation** -- Motif-based melodies with call-and-response, walking bass (8 types), 6 chord voicings, genre drums, plus 12 artist-inspired techniques applied probabilistically (.off, .superimpose, .jux, .echoWith, .degradeBy, Perlin filter, etc.).

**4. Arrangement** -- Staggered layer entry via `.mask()`, periodic variation via `.every()`, filter fade-ins, breathing degradation.

### AI Creative Mode (with API key)

The tool sends the input to **Gemini 3.1 Flash Lite**, **Claude Haiku 4.5**, or **OpenAI GPT-5.4 Nano**.

- **System Prompt (~1300 tokens):** Creative process framework, music theory principles, mood parameters, 17 critical reminders.
- **User Message (~3100 tokens):** Input text, genre context with arrangement structures, complete Strudel component reference (92 scales, 100+ instruments, 58 effects), 29 structural idioms.
- **Error Recovery:** If the generated code has runtime errors, the system detects them via `repl.state.evalError`, sends code + error back to LLM for fix, retries up to 3 times. Falls back to algorithmic `tryFixFromError` if LLM fix fails.

---

## DJ Mixer

Appears after first generation. All mixer controls use **algorithmic regex modification** (instant, free, no API calls) regardless of whether an API key is set.

**Channel Strips** (2-column grid, each with [-][+]):

| Channel | Effect | Range |
|:---|:---|:---|
| BPM | Tempo | 40 - 400 |
| Gain | Volume | 0.05 - 1.0 |
| Cutoff | Low-pass filter | 100 - 12000 Hz |
| Resonance | Filter Q | 0 - 50 |
| Highpass | High-pass filter | 20 - 8000 Hz |
| Octave | Pitch shift | 1 - 7 |
| Reverb | Room size | 0 - 1.0 |
| Delay | Delay send | 0 - 1.0 |
| Feedback | Delay feedback | 0 - 0.95 |
| Density | Euclidean hits | 1 - N |
| Swing | Shuffle feel | off / on |
| Distortion | Waveshape | 0 - 1.0 |
| Bitcrush | Bit depth | 1 - 16 |

**Tone:** major, minor, dorian, phrygian, lydian, pentatonic (replaces scale in all layers)

**Mood:** dark, euphoric, dreamy, aggressive (compound: adjusts tempo + filter + reverb + gain simultaneously. Uses LLM when API key is available.)

**Long-press:** Hold any +/- button for 400ms to start continuous adjustment (150ms repeat).

**Click feedback:** Green flash = value changed. Red flash = no matching parameter in code.

In LLM mode, click **[mixer]** in the Edit row to show/hide the mixer.

---

## Natural Language Edit

Appears in AI mode (requires API key). Type any instruction and press Enter or click Apply.

```
> remove drums and add piano          [Apply]
> make the bass more complex
> change everything to Japanese style
> add a breakdown at cycle 16
```

Uses a separate edit-focused system prompt: "Preserve unrelated code and comments. Prefer minimal edits over full rewrites." Temperature 0.2 for precision. The LLM modifies the existing code surgically rather than rewriting from scratch.

---

## Genre Guide

| Genre | BPM | Layers |
|:---|:---|:---|
| **EDM** | 124-140 | drums, perc, bass, lead, countermelody, chords, arp, texture |
| **Jazz** | 84-148 | drums, perc, bass, lead, countermelody, chords, texture |
| **Classical** | 62-116 | bass, lead, countermelody, chords, arp, texture |
| **Blues** | 72-108 | drums, perc, bass, lead, countermelody, chords, texture |
| **Ambient** | 50-76 | bass, pad, lead, arp, texture |
| **Lo-fi** | 68-86 | drums, perc, bass, lead, countermelody, chords, texture |
| **World** | 78-126 | drums, perc, bass, lead, countermelody, chords, texture |
| **Random** | Varies | Mixed from 3 random genres |
| **Fusion** | Averaged | Blended from N selected genres |

**World Subgenres:** Flamenco, Japanese, Indian, Eastern European, Arabic -- each with tradition-specific scales, keys, and instruments.

---

## Architecture

```
text-to-strudel/
  index.html          Matrix theme (green-on-black, 2-column, JetBrains Mono)
  index.amber.html    Amber theme (warm dark, single-column, Outfit + Red Hat Mono)
  app.js              All logic (shared by both themes)
  LICENSE             AGPL-3.0
  README.md
  README-ko.md        Korean documentation
```

- **index.html** (~570 lines) -- 2-column layout: left panel (controls, mixer) is fixed, right pane (code editor) scrolls independently. Matrix green aesthetic with CRT scanline overlay. CodeMirror syntax colors overridden to all-green spectrum.
- **index.amber.html** (274 lines) -- Single-column layout with amber accent, film grain overlay, pill-shaped buttons. Same HTML structure and IDs -- fully interchangeable with `app.js`.
- **app.js** (~2060 lines) -- Seeded PRNG, text analysis, 7 genre definitions, melody/bass/chord/arp generators, 13 mixer channel strip handlers, 3 LLM provider integrations, dynamic error recovery loop, natural language edit, system prompt + component reference.

---

## API Setup

| Provider | Model | Key format | Docs |
|:---|:---|:---|:---|
| **Gemini** (default) | gemini-3.1-flash-lite-preview | `AIza...` | [aistudio.google.com](https://aistudio.google.com) |
| **Claude** | claude-haiku-4-5-20251001 | `sk-ant-...` | [console.anthropic.com](https://console.anthropic.com) |
| **OpenAI** | gpt-5.4-nano | `sk-...` | [platform.openai.com](https://platform.openai.com) |

1. Click **API** in the app
2. Select provider from dropdown
3. Paste your key, press **Enter** (auto-verifies)
4. Green checkmark = verified. Red cross = invalid.

Keys are stored per-provider in `localStorage`. Switching providers loads that provider's saved key automatically. Verified status persists across sessions. Click outside the API panel to close it.

**Temperature handling per provider:**
- **Gemini:** Fixed at 1.0 (Google recommends not lowering for Gemini 3+). Variation via `topP` (0.9 -> 0.99 per regen).
- **Claude:** 0.9 -> 1.2 per regen. Range 0.0-1.2.
- **OpenAI:** 0.9 -> 1.2 per regen. Requires `reasoning: {effort: "none"}` for temperature support.

---

## Themes

| Theme | File | Aesthetic |
|:---|:---|:---|
| **Matrix** | `index.html` | Green on black, JetBrains Mono, 2-column, CRT scanlines, sharp corners |
| **Amber** | `index.amber.html` | Warm amber on dark, Outfit + Red Hat Mono, single-column, film grain, rounded pills |

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

## License

**AGPL-3.0**

This project is licensed under the GNU Affero General Public License v3.0 due to its dependency on `@strudel/repl`, which is AGPL-3.0 licensed. The library is loaded unmodified via CDN.

---

## Credits

- **[Strudel](https://strudel.cc)** by Alex McLean and contributors -- the live coding environment that makes this possible.
- **Google Gemini API** -- AI creative mode via Gemini 3.1 Flash Lite.
- **Anthropic Claude API** -- AI creative mode via Claude Haiku 4.5.
- **OpenAI API** -- AI creative mode via GPT-5.4 Nano.

No third-party code was copied into this project. All 29 code structure patterns are original structural idioms, not reproductions of existing compositions.
