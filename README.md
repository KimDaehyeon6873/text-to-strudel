# text-to-strudel

**Turn any text into live-coded music. No server. No install. Just a browser.**

`AGPL-3.0` | `Zero dependencies` | `Runs offline (algorithmic mode)` | `~1700 lines total`

---

text-to-strudel is a browser-based tool that converts arbitrary text input into playable, editable music using [Strudel](https://strudel.cc), the JavaScript port of TidalCycles. Type a word, a sentence, a feeling -- pick a genre -- and listen. The generated code appears in a live editor where you can modify it in real time.

Two modes of operation: a fully deterministic algorithmic pipeline that needs nothing but a browser, and an AI creative mode (Claude Haiku 4.5 or Gemini 3.1 Flash Lite) that interprets your text as feeling and imagery rather than literal transcription.

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

## Features

- **9 genre modes**: EDM, Jazz, Classical, Blues, Ambient, Lo-fi, World (5 subgenres), Random, Fusion
- **Interactive Strudel editor**: edit generated code live, Ctrl+Enter to re-evaluate instantly
- **Refine buttons**: faster / slower / brighter / darker / spacious / dry / louder / quieter
- **Mood buttons**: dark / euphoric / dreamy / aggressive -- compound parameter shifts in algorithmic mode, creative reinterpretation in AI mode
- **Regenerate**: same input, different result. Algorithmic mode increments a seed counter; AI mode raises temperature (0.90 to 1.20 for Claude, 0.90 to 1.50 for Gemini) and adds a variation hint
- **Deterministic output**: in algorithmic mode, the same text + genre + seed always produces the same music
- **Post-generation validation**: auto-fixes GM pad naming hallucinations from LLM output (e.g., `gm_pad_1_new_age` to `gm_pad_new_age`)
- **No server, no npm, no build step**: open the HTML file and go
- **Full Strudel component reference** injected as LLM context: 92 scales, 100+ GM instruments, 58 effects, FM/wavetable/additive synthesis, sample manipulation, 8 drum banks
- **29 code structure patterns** across 8 categories provided to the LLM as compositional idioms
- **Genre-specific arrangement lengths** (e.g., EDM: intro 8 -> build 8 -> drop 16 -> break 8)

## Quick Start

1. Open `text-to-strudel.html` in any modern browser (or serve via any static HTTP server).
2. Type anything in the text input -- a word, a phrase, a memory, a feeling.
3. Select a genre (EDM is the default).
4. Click **Generate & Play**. Music starts automatically.
5. Edit the code in the editor below. Press **Ctrl+Enter** to apply your changes.
6. Use the **Refine** and **Mood** buttons for quick adjustments.
7. Click **Regenerate** for a different interpretation of the same input.
8. Click **Stop** or press **Ctrl+.** to silence everything.

For AI creative mode, click **API Settings** before generating, select Claude or Gemini, enter your API key, and click Save. See [API Setup](#api-setup) for details.

## How It Works

### Algorithmic Mode (no API key)

The algorithmic pipeline is fully deterministic. Given the same input text, genre, and seed counter, it produces identical output every time.

**Step 1: Text Analysis**

The input text is analyzed for five qualities, each normalized to 0-1:

| Quality      | Derived From                                         |
|-------------|------------------------------------------------------|
| **Energy**      | Unique character density, punctuation ratio, uppercase ratio, word count |
| **Brightness**  | Vowel-to-consonant ratio                             |
| **Weight**      | Average word length                                  |
| **Space**       | Whitespace ratio, short phrase bonus                 |
| **Complexity**  | Unique character ratio relative to total characters  |

**Step 2: Genre Resolution**

Each of the 7 base genres (EDM, Jazz, Classical, Blues, Ambient, Lo-fi, World) defines:
- Tempo range, scale pool, key pool
- Multiple sound option sets (instruments/waveforms per role)
- Drum patterns and drum bank options
- Chord progressions (scale degree arrays)
- Layer configuration
- Genre-specific effect functions for lead, bass, and chords

**Random** mode pulls scales from one genre, sounds from another, and drums from a third. **Fusion** mode picks two genres and blends their properties -- averaged tempo ranges, concatenated scale pools, mixed sound assignments.

**World** mode selects from 5 subgenres: Flamenco, Japanese, Indian, Eastern European, and Arabic, each with tradition-specific scales, keys, and instruments.

**Step 3: Code Generation**

The generator produces complete Strudel code with:

- **Melodies**: Motif-based (3-4 notes) with call-and-response structure. Motifs start on chord tones (0, 2, 4). Responses vary via reversal, inversion, transposition, or fragmentation. Anchor points enforce chord tones every 3rd position. Occasional note elongation (`@2`) for phrasing.
- **Bass lines**: Walking bass from 8 pattern types selected by energy level -- driving roots at high energy, sparse patterns at low energy, chromatic approaches and syncopation in the middle.
- **Chords**: 6 voicing types -- triads, wide voicings, sus4, 7ths, power chords, add9.
- **Arpeggios**: 6 arpeggio patterns with inversions and gaps.
- **Drums**: Genre-specific patterns with dynamically generated gain patterns (varied hi-hat dynamics, energy-scaled kick/snare levels).

**Step 4: Arrangement and Techniques**

- **Staggered layer entry** via `.mask()`: 65% chance of staggered arrangement where bass enters 2-5 cycles in, lead enters after bass, optional delayed arp entry.
- **Periodic variation** via `.every(N, fn)`: 50% chance of adding cyclical transformations (reverse, double speed, transposition).
- **Filter fade-ins** on drums for intro feel.
- **Breathing degradation** on chords: `degradeBy(sine.range(...).slow(...))` for organic texture.
- **12 artist-inspired techniques** applied probabilistically based on text analysis:

| Technique        | Triggered By       | Effect                                      |
|-----------------|--------------------|----------------------------------------------|
| `.off()`         | High energy         | Time-shifted melodic copy                    |
| `.superimpose()` | High brightness     | Detuning / unison width                      |
| `.jux(rev)`      | High space          | Stereo width via reversed right channel      |
| `.echoWith()`    | High energy         | Rhythmic pitched echoes                      |
| `.echo()`        | High space          | Spatial echoes                               |
| Euclidean struct | High energy         | Euclidean rhythm distribution                |
| `.degradeBy()`   | Always available    | Organic feel through random event removal    |
| Perlin filter    | High weight         | Organic filter drift via noise function      |
| `.sometimes()`   | High complexity     | Probabilistic per-cycle variation            |
| Fake sidechain   | High weight         | Patterned gain for pumping effect            |
| `.scaleLayer()`  | High complexity     | Parallel harmonic processing                 |

### AI Creative Mode (with API key)

When an API key is configured, the tool sends the input text to Claude Haiku 4.5 (Anthropic Messages API) or Gemini 3.1 Flash Lite (Google Generative Language API) with a carefully constructed prompt.

**System Prompt (~1225 tokens)**

The system prompt instructs the model to interpret text as feeling, imagery, and narrative rather than literal letter-to-note mappings. It includes:
- A creative process framework (what does this feel like, look like, what story lives inside it)
- A worked example of creative reasoning (not included in output)
- Output format requirements (valid Strudel code only, `$:` prefix, 4-7 layers, poetic comments)
- Quality criteria distinguishing good from boring output
- Music theory principles: voice leading, 4-part harmony, anchor points, tension-release, call-and-response, rhythmic counterpoint, dynamic arc
- Mood parameter reference (dark, euphoric, melancholic, aggressive, dreamy, peaceful, energetic) with specific numerical adjustments
- 10 critical reminders covering motifs, dynamics, space, intentionality, scale choice, surprise, arrangement, variation, texture, and movement

**User Message (~3100 tokens)**

The user message contains:
1. The input text
2. Genre context -- a starting point description with typical arrangement structures and encouragement to break conventions
3. The complete Strudel component reference: all synth types, all 58+ effects with parameters, all 92 scales grouped by character, all 100+ GM instruments, 8 drum banks, all pattern modifiers
4. 29 code structure patterns across 8 categories (organization, melody/harmony, rhythm/time, timbre/texture, sample manipulation, spatial/dynamics, transitions, arrangement)

**Temperature Scaling**

Each Regenerate press increases the temperature:
- Claude: 0.90 + (seedCounter * 0.05), capped at 1.20
- Gemini: 0.90 + (seedCounter * 0.08), capped at 1.50

A variation hint is appended to the prompt when seedCounter > 0, asking for a different scale, tempo, mood, or approach.

**Refine via LLM**

In AI mode, Refine and Mood buttons send the current code back to the LLM with a modification instruction (e.g., "modify this code to make it darker and moodier") at temperature 0.7.

## Genre Guide

| Genre       | BPM Range | Scales                                               | Typical Sounds                              | Layers                              |
|------------|-----------|------------------------------------------------------|---------------------------------------------|--------------------------------------|
| **EDM**        | 124-140   | minor, phrygian, harmonic minor, dorian              | Sawtooth/square leads, sine bass, TR808/909 | drums, bass, lead, chords, arp       |
| **Jazz**       | 84-148    | dorian, mixolydian, lydian, bebop, altered            | Rhodes, acoustic bass, vibraphone, sax      | drums, bass, lead, chords            |
| **Classical**  | 62-116    | major, minor, harmonic minor, melodic minor, lydian  | Piano, strings, flute, oboe, cello          | bass, lead, chords, arp              |
| **Blues**       | 72-108    | minor blues, major blues, mixolydian, dorian         | Overdriven guitar, harmonica, clean guitar  | drums, bass, lead, chords            |
| **Ambient**    | 50-76     | lydian, major pentatonic, whole tone, dorian         | Sine/triangle, celesta, blown bottle, pads  | bass, pad, lead, arp                 |
| **Lo-fi**      | 68-86     | minor pentatonic, dorian, minor, mixolydian          | Electric piano, vibraphone, music box       | drums, bass, lead, chords            |
| **World**      | 78-126    | Tradition-specific (see subgenres)                   | Koto, sitar, nylon guitar, accordion, oboe  | drums, bass, lead, chords            |
| **Random**     | Varies    | Mixed from random genre combination                  | Mixed from random genre combination         | drums, bass, lead, chords, arp       |
| **Fusion**     | Averaged  | Concatenated from two genres                         | Mixed from two genres                       | drums, bass, lead, chords, arp       |

**World Subgenres**: Flamenco (phrygian dominant, nylon guitar), Japanese (hirajoshi/in-sen, koto/shakuhachi), Indian (phrygian dominant, sitar), Eastern European (ukrainian dorian/hungarian minor, accordion/violin), Arabic (double harmonic major/persian, oboe).

## Architecture

The project consists of two files:

### `text-to-strudel.html` (277 lines)

UI shell and styles. Dark theme (#08080f background). Contains:
- Text input area
- Genre selector buttons with per-genre accent colors
- API settings collapsible panel (provider select, key input, save)
- Generate & Play / Regenerate / Stop controls
- Refine and Mood button rows (hidden until first generation)
- `<strudel-editor>` web component wrapper
- Status display with animated playing indicator
- Script tags loading `@strudel/repl` from CDN and `text-to-strudel.js`

### `text-to-strudel.js` (1411 lines)

All application logic:

| Section                  | Lines (approx.) | Purpose                                                    |
|-------------------------|------------------|------------------------------------------------------------|
| Seeded PRNG              | 10-21            | Deterministic random from `text + genre + seedCounter`     |
| Text analysis            | 23-60            | Energy, brightness, weight, space, complexity extraction   |
| Genre definitions        | 62-223           | 7 base genres with scales, sounds, drums, progressions, FX |
| Melody generation        | 225-289          | Motif-based call-response with chord tone anchoring        |
| Pattern helpers          | 291-376          | Walking bass (8 types), chords (6 voicings), arps (6 patterns), drum gains, evocative comments |
| Artist techniques        | 378-461          | 12 techniques applied probabilistically by text analysis   |
| Random/Fusion builders   | 463-508          | Cross-genre hybridization                                  |
| Main code generator      | 510-679          | Assembles complete Strudel code with arrangement           |
| System prompt            | 682-755          | Creative philosophy, music theory, mood parameters, 10 reminders |
| Component reference      | 766-863          | Full Strudel API: synths, effects, scales, instruments, drums, modifiers |
| Genre context            | 865-876          | Per-genre starting points with arrangement structures      |
| Code patterns            | 878-1029         | 29 structural idioms across 8 categories                   |
| User message builder     | 1031-1050        | Assembles input + genre context + reference + patterns     |
| Provider abstraction     | 1052-1075        | Claude/Gemini routing                                      |
| Claude API call          | 1077-1101        | Anthropic Messages API with temperature scaling            |
| Gemini API call          | 1103-1128        | Google Generative Language API with temperature scaling    |
| Post-generation validation | 1130-1147      | GM pad name hallucination fixes                            |
| Editor integration       | 1149-1189        | `<strudel-editor>` web component control                   |
| UI wiring                | 1191-1411        | Event handlers, refine logic, API key management           |

## API Setup

### Claude (Anthropic)

1. Get an API key from [console.anthropic.com](https://console.anthropic.com)
2. In text-to-strudel, click **API Settings**
3. Select **Claude** from the dropdown
4. Paste your key (starts with `sk-ant-...`)
5. Click **Save**

The tool uses `claude-haiku-4-5-20251001` with the `anthropic-dangerous-direct-browser-access` header for direct browser-to-API calls. No proxy server needed.

### Gemini (Google AI)

1. Get an API key from [aistudio.google.com](https://aistudio.google.com)
2. In text-to-strudel, click **API Settings**
3. Select **Gemini** from the dropdown
4. Paste your key (starts with `AIza...`)
5. Click **Save**

The tool uses `gemini-3.1-flash-lite-preview` via the Generative Language REST API.

### No API Key

Without an API key, the tool runs in fully algorithmic mode. No network requests are made. The output is deterministic and runs entirely in the browser.

API keys are stored in `localStorage` under `strudel_muse_api_key` and `strudel_muse_provider`. They never leave your browser except in direct API calls to the selected provider.

## Refine and Mood Controls

These appear after the first generation and operate on the currently loaded code.

### Refine Buttons (parameter adjustments)

| Button     | Algorithmic Mode                         | AI Mode                                   |
|-----------|------------------------------------------|-------------------------------------------|
| faster     | BPM +8 (max 200)                        | LLM rewrite with "make it faster"         |
| slower     | BPM -8 (min 40)                         | LLM rewrite with "make it slower"         |
| brighter   | All `.lpf()` values x1.4 (max 12000)    | LLM rewrite with "make it brighter"       |
| darker     | All `.lpf()` values x0.6 (min 100)      | LLM rewrite with "make it darker"         |
| spacious   | All `.room()` values +0.15 (max 1.0)    | LLM rewrite with "make it more reverb"    |
| dry        | All `.room()` values -0.15 (min 0.0)    | LLM rewrite with "make it drier"          |
| louder     | All `.gain()` values x1.15 (max 1.0)    | LLM rewrite with "make it louder"         |
| quieter    | All `.gain()` values x0.85 (min 0.05)   | LLM rewrite with "make it quieter"        |

### Mood Buttons (compound transformations)

| Button      | Algorithmic Mode                                  | AI Mode                             |
|------------|---------------------------------------------------|--------------------------------------|
| dark        | slower + darker + more reverb                     | "make it darker and moodier"         |
| euphoric    | faster + brighter + louder                        | "make it euphoric and uplifting"     |
| dreamy      | slower + darker + double reverb boost             | "make it dreamy and floating"        |
| aggressive  | faster + brighter + louder                        | "make it aggressive and intense"     |

## Keyboard Shortcuts

| Shortcut       | Action                                           |
|---------------|---------------------------------------------------|
| **Enter**         | Generate & Play (from the text input field)      |
| **Shift+Enter**   | New line in text input                           |
| **Ctrl+Enter**    | Re-evaluate code in the Strudel editor           |
| **Ctrl+.**        | Stop playback (in the Strudel editor)            |

## License

**AGPL-3.0**

This project is licensed under the GNU Affero General Public License v3.0 due to its dependency on `@strudel/repl`, which is AGPL-3.0 licensed. The `@strudel/repl` library is loaded unmodified via CDN script tag.

## Credits

- **[Strudel](https://strudel.cc)** by Alex McLean and contributors -- the live coding environment that makes this possible. Loaded via `@strudel/repl` from unpkg CDN.
- **Anthropic Claude API** -- optional AI creative mode via Claude Haiku 4.5.
- **Google Gemini API** -- optional AI creative mode via Gemini 3.1 Flash Lite.

No third-party code was copied into this project. No artist code is included. All 29 code structure patterns are original structural idioms, not reproductions of existing compositions.
