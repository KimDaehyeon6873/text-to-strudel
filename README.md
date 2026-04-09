# text-to-strudel

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
  - [Algorithmic Mode](#algorithmic-mode-no-api-key)
  - [AI Creative Mode](#ai-creative-mode-with-api-key)
- [Genre Guide](#genre-guide)
- [Architecture](#architecture)
- [API Setup](#api-setup)
- [Refine and Mood Controls](#refine-and-mood-controls)
- [Keyboard Shortcuts](#keyboard-shortcuts)
- [License](#license)
- [Credits](#credits)

---

## Features

- **9 genre modes:** EDM, Jazz, Classical, Blues, Ambient, Lo-fi, World (5 subgenres), Random, Fusion
- **Interactive Strudel editor:** Edit generated code live, press `Ctrl+Enter` to re-evaluate instantly
- **Refine buttons:** Instantly adjust tracks -- faster / slower / brighter / darker / spacious / dry / louder / quieter (always algorithmic, instant, no API cost)
- **Mood buttons:** Shift the vibe -- dark / euphoric / dreamy / aggressive. Compound parameter shifts in algorithmic mode; creative reinterpretation via LLM in AI mode
- **Long-press repeat:** Hold down any `±` mixer button for continuous adjustment
- **Regenerate:** Same input, different result. Algorithmic mode increments a seed counter; AI mode raises temperature (up to 1.20 for Claude/OpenAI, 1.50 for Gemini) and adds a variation hint
- **Deterministic output:** In algorithmic mode, the same `text + genre + seed` always produces the exact same music
- **Self-healing AI:** Auto-fixes GM pad naming hallucinations from LLM output (e.g., `gm_pad_1_new_age` -> `gm_pad_new_age`)
- **Zero friction:** No server, no npm, no build step. Open the HTML file and go
- **6-12 layers per generation:** drums, percussion, bass, lead, countermelody, chords, arp, texture/noise -- split or combine as the music demands
- **Full Strudel component reference** injected as LLM context: 92 scales, 100+ GM instruments, 58 effects, FM/wavetable/additive synthesis, sample manipulation, 8 drum banks
- **29 code structure patterns** across 8 categories provided to the LLM as compositional idioms

---

## Quick Start

1. Open `index.html` in any modern browser (or serve via any static HTTP server).
2. Type anything in the text input -- a word, a phrase, a memory, a feeling.
3. Select a genre (EDM is the default).
4. Click **Generate & Play**. Music starts automatically.
5. Edit the code in the editor below. Press **Ctrl+Enter** to apply your changes.
6. Use the **Refine** and **Mood** buttons for quick adjustments.
7. Click **Regenerate** for a different interpretation of the same input.
8. Click **Stop** or press **Ctrl+.** to silence everything.

> Want AI Creative Mode? Click **API Settings** before generating, select Gemini, Claude, or OpenAI, enter your API key, and click Save. See [API Setup](#api-setup) for details.

---

## How It Works

### Algorithmic Mode (no API key)

The algorithmic pipeline is fully deterministic. Given the same input text, genre, and seed counter, it produces identical output every time.

**1. Text Analysis**

The input text is analyzed for five qualities, each normalized to `0-1`:

| Quality | Derived From |
|:---|:---|
| **Energy** | Unique character density, punctuation ratio, uppercase ratio, word count |
| **Brightness** | Vowel-to-consonant ratio |
| **Weight** | Average word length |
| **Space** | Whitespace ratio, short phrase bonus |
| **Complexity** | Unique character ratio relative to total characters |

**2. Genre Resolution**

Each of the 7 base genres defines:
- Tempo range, scale pool, key pool
- Multiple sound option sets (instruments/waveforms per role)
- Drum patterns and drum bank options
- Chord progressions (scale degree arrays)
- Genre-specific effect functions for lead, bass, and chords

**Random** mode pulls scales from one genre, sounds from another, and drums from a third. **Fusion** mode picks two genres and blends their properties -- averaged tempo ranges, concatenated scale pools, mixed sound assignments.

**World** mode selects from 5 subgenres: Flamenco, Japanese, Indian, Eastern European, and Arabic, each with tradition-specific scales, keys, and instruments.

**3. Code Generation & Arrangement**

The generator produces complete Strudel code featuring motif-based melodies with call-and-response structure, walking bass lines (8 types scaled by energy), 6 voicing types for chords, and genre-specific dynamic drums.

It also applies **12 artist-inspired techniques** probabilistically based on text analysis:

| Technique | Triggered By | Effect |
|:---|:---|:---|
| `.off()` | High energy | Time-shifted melodic copy |
| `.superimpose()` | High brightness | Detuning / unison width |
| `.jux(rev)` | High space | Stereo width via reversed right channel |
| `.echoWith()` | High energy | Rhythmic pitched echoes |
| `.degradeBy()` | Always available | Organic feel through random event removal |
| Perlin filter | High weight | Organic filter drift via noise function |
| ...and more | | |

---

### AI Creative Mode (with API key)

When an API key is configured, the tool sends the input text to **Gemini 3.1 Flash Lite**, **Claude Haiku 4.5**, or **OpenAI GPT-5.4 Nano** with a carefully constructed prompt.

- **System Prompt (~1225 tokens):** Instructs the model to interpret text as feeling, imagery, and narrative. Includes a creative process framework, music theory principles, and 10 critical reminders for Strudel arrangement.
- **User Message (~3100 tokens):** Contains the input text, genre context, the complete Strudel component reference (92 scales, 100+ GM instruments, 58+ effects), and 29 structural idioms.
- **Temperature Scaling:** Each Regenerate press increases the temperature to guarantee fresh variations.

---

## Genre Guide

| Genre | BPM Range | Typical Sounds | Layers |
|:---|:---|:---|:---|
| **EDM** | 124-140 | Sawtooth/square leads, sine bass, TR808/909 | drums, perc, bass, lead, countermelody, chords, arp, texture |
| **Jazz** | 84-148 | Rhodes, acoustic bass, vibraphone, sax | drums, perc, bass, lead, countermelody, chords, texture |
| **Classical** | 62-116 | Piano, strings, flute, oboe, cello | bass, lead, countermelody, chords, arp, texture |
| **Blues** | 72-108 | Overdriven guitar, harmonica, clean guitar | drums, perc, bass, lead, countermelody, chords, texture |
| **Ambient** | 50-76 | Sine/triangle, celesta, blown bottle, pads | bass, pad, lead, arp, texture |
| **Lo-fi** | 68-86 | Electric piano, vibraphone, music box | drums, perc, bass, lead, countermelody, chords, texture |
| **World** | 78-126 | Koto, sitar, nylon guitar, accordion, oboe | drums, perc, bass, lead, countermelody, chords, texture |
| **Random** | Varies | Mixed from random genre combination | drums, perc, bass, lead, countermelody, chords, arp, texture |
| **Fusion** | Averaged | Mixed from two genres | drums, perc, bass, lead, countermelody, chords, arp, texture |

**World Subgenres:** Flamenco (phrygian dominant, nylon guitar), Japanese (hirajoshi/in-sen, koto/shakuhachi), Indian (phrygian dominant, sitar), Eastern European (ukrainian dorian/hungarian minor, accordion/violin), Arabic (double harmonic major/persian, oboe).

---

## Architecture

The project is intentionally minimalist, consisting of just two files:

- `index.html` (566 lines) -- UI shell and styles. Dark theme (`#08080f`), 2-column layout. Contains the `<strudel-editor>` web component wrapper.
- `app.js` (2056 lines) -- All application logic, including the seeded PRNG, text analysis, genre definitions, main code generator, and API provider abstraction.

---

## API Setup

### Gemini (Google AI)

1. Get an API key from [aistudio.google.com](https://aistudio.google.com)
2. Click **API Settings** in text-to-strudel
3. Select **Gemini**, paste your key (`AIza...`), and click **Save**

Uses `gemini-3.1-flash-lite-preview` via the Generative Language REST API. **Free tier is enough.**

### Claude (Anthropic)

1. Get an API key from [console.anthropic.com](https://console.anthropic.com)
2. Click **API Settings** in text-to-strudel
3. Select **Claude**, paste your key (`sk-ant-...`), and click **Save**

Uses `claude-haiku-4-5-20251001` via direct browser-to-API calls. No proxy server needed.

### OpenAI

1. Get an API key from [platform.openai.com](https://platform.openai.com)
2. Click **API Settings** in text-to-strudel
3. Select **OpenAI**, paste your key (`sk-...`), and click **Save**

Uses `gpt-5.4-nano` via standard REST API endpoints.

### No API Key

Without an API key, the tool runs in fully algorithmic mode. No network requests are made. The output is deterministic and runs entirely in the browser.

API keys are stored in your browser's `localStorage` and never leave your device except in direct API calls to the selected provider.

---

## Refine and Mood Controls

These appear after the first generation and operate on the currently loaded code.

### Refine Buttons (always algorithmic)

Always instant and free. Hold down any button for continuous adjustment.

| Button | Effect |
|:---|:---|
| faster / slower | BPM +/-8 (max 400, min 40) |
| brighter / darker | Low-pass filter x1.4 / x0.6 |
| spacious / dry | Reverb `.room()` +/-0.15 |
| louder / quieter | Gain x1.15 / x0.85 |

### Mood Buttons (compound)

Compound algorithmic adjustments by default. With an API key, mood buttons send the code to the LLM for creative reinterpretation.

| Button | Algorithmic Mode | AI Mode |
|:---|:---|:---|
| **dark** | slower + darker + more reverb | "make it darker and moodier" |
| **euphoric** | faster + brighter + louder | "make it euphoric and uplifting" |
| **dreamy** | slower + darker + double reverb boost | "make it dreamy and floating" |
| **aggressive** | faster + brighter + louder | "make it aggressive and intense" |

---

## Keyboard Shortcuts

| Shortcut | Action |
|:---|:---|
| `Enter` | Generate & Play (from the text input field) |
| `Shift+Enter` | New line in text input |
| `Ctrl+Enter` | Re-evaluate code in the Strudel editor |
| `Ctrl+.` | Stop playback (in the Strudel editor) |

---

## License

**AGPL-3.0**

This project is licensed under the GNU Affero General Public License v3.0 due to its dependency on `@strudel/repl`, which is AGPL-3.0 licensed. The `@strudel/repl` library is loaded unmodified via CDN script tag.

---

## Credits

- **[Strudel](https://strudel.cc)** by Alex McLean and contributors -- the live coding environment that makes this possible.
- **Google Gemini API** -- optional AI creative mode via Gemini 3.1 Flash Lite.
- **Anthropic Claude API** -- optional AI creative mode via Claude Haiku 4.5.
- **OpenAI API** -- optional AI creative mode via GPT-5.4 Nano.

No third-party code was copied into this project. All 29 code structure patterns are original structural idioms, not reproductions of existing compositions.
