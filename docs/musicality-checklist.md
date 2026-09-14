# Musicality A/B Listening Checklist

Compare **A = `main` baseline** with **B = current candidate** at matched playback volume. Generate each item twice: the original take, then **New take**. Also try **melody**, **groove**, and **arrangement** variation once each.

## Fixed corpus

| Prompt | Genre |
|---|---|
| `햇살이 번지는 여름 바람` | EDM |
| `비 내리는 새벽, 혼자 남은 불빛` | Jazz |
| `고요한 호수 위로 달이 떠오른다` | Classical |
| `돌아갈 수 없는 오래된 길` | Blues |
| `구름 사이로 숨이 천천히 열린다` | Ambient |
| `낡은 사진과 따뜻한 커피` | Lo-fi |
| `붉은 사막을 건너는 밤의 행렬` | World |

## Rubric (1–5; higher is better)

- **Coherence** — layers sound like one piece with a shared tonal center and pulse.
- **Motif recognition** — the lead idea is memorable and perceptibly returns or develops.
- **Cadence** — phrases resolve or turn around intentionally rather than stopping arbitrarily.
- **Section contrast** — intro, body, break/peak, and release are audibly distinct.
- **Clutter control** — parts leave space; no frequency or rhythmic pile-up. *(5 = cleanest.)*
- **Control predictability** — each variation/mixer button changes only the promised dimension and remains musical.

Record A/B scores before discussing preference. Prefer B only when it improves the total without reducing control predictability by more than one point.

## Current candidate: phrase playback and groove

- **Input identity:** Compare `0123456789` with `9876543210`, then add spaces and repeated groups. Check whether contour, breathing room, and returning figures reflect those changes. Also try punctuation, emoji, Hangul, and arbitrary identifiers.
- **Variation range:** Run several focused variations. Listen for new rhythms, motifs, sounds, and section entrances while the shared key, pulse, cadence, and unaffected layers remain stable. See the [measured diversity and real-audio report](music-qa/README.md) for the test corpus, spectrograms, and limits of those measurements.
- **Melody attacks:** Listen for each written note, including notes after the downbeat. Melodic rhythm now precedes shared harmony (`n(...).set(harmony)`); the former `harmony.n(...)` ordering could suppress later attacks.
- **Drum balance:** Check that kick and snare no longer double up when hats play. Each drum voice receives its own velocity before stacking, followed by a shared mixer gain.
- **Phrase space:** Listen for the recurring opening motif, its development, and a beat of space at four-bar endings. The answer should enter during lead rests; FX tails may overlap.
- **Genre contrast:** Compare sustained Classical/Ambient harmony with Jazz/Lo-fi syncopation and Blues backbeats. Check that swing is shared by the ensemble and that Straighten remains effective after focused variations.
- **Stable harmony:** Jazz lead variations should preserve chord-tone pitches. Arrangement effects change dynamics or panning without reversing, transposing, or scrambling the composed phrase.
- **Voicing coverage:** Ambient suspensions, World open fifths, and EDM diminished chords use the pinned ireal dictionary's supported spellings (`sus`, `5`, `o7`). Check that those harmonic bars produce sound rather than unexplained silence.

`npm run e2e -- e2e/music-events.spec.mjs` evaluates generated code in the pinned Strudel runtime and checks actual note onsets, drum hit multiplicity, finite pitches, and lead/answer gates. Unit tests also check phrase lengths, motif returns, rest occupancy, and focused-variation preservation. These are structural checks; they do not replace the A/B listening scores above.

Implementation references: [shared voicings and rhythm-first bass/melody examples](https://strudel.cc/understand/voicings/), [swing and note duration](https://strudel.cc/learn/time-modifiers/), [gain and velocity](https://strudel.cc/learn/effects/).
