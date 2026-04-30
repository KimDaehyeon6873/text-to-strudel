// @ts-check
// =====================================================
//  STRUDEL MUSE - Text-to-Music Generator
//  Analyzes text qualities (energy, brightness, weight,
//  space, complexity) and maps them to genre-appropriate
//  musical parameters. Same input + genre = same output.
// =====================================================

/**
 * @typedef {{ energy: number, brightness: number, weight: number, space: number, complexity: number }} Analysis
 * @typedef {'gemini' | 'openai' | 'claude'} Provider
 * @typedef {'generate' | 'refine' | 'edit' | 'fix' | 'verify'} Channel
 * @typedef {{ provider: Provider, apiKey: string, system: string, user: string,
 *             temperature?: number, topP?: number, maxTokens?: number,
 *             channel?: Channel, timeoutMs?: number }} CallLLMOpts
 */

// ---- TUNING: shared numeric ranges/steps used across mixer + retry logic ----
var TUNING = {
  BPM:    { min: 40,   max: 400,   step: 8 },
  GAIN:   { min: 0.05, max: 1.0,   step: 0.05 },
  FILTER: { min: 100,  max: 12000, step: 200 },
  REVERB_STEP: 0.15,
  RETRY_MAX: 3,
  EVAL_DELAYS: { init: 50, eval: 150, settle: 100 },
};

// ---- MODELS: provider model identifiers in one place ----
var MODELS = {
  gemini: 'gemini-3.1-flash-lite-preview',
  claude: 'claude-haiku-4-5-20251001',
  openai: 'gpt-5.4-nano',
};

// ---- NETWORK: fetch with timeout + in-flight cancellation ----
var NET = {
  REQUEST_TIMEOUT_MS: 60000,         // hard timeout for any LLM call
  VERIFY_TIMEOUT_MS:  10000,         // shorter timeout for /v1/models verify pings
  VERIFY_TTL_MS: 24 * 60 * 60 * 1000, // re-verify if last verify older than 24h
};

// Active controllers per "channel" so a new generate cancels the prior in-flight call
var _inflight = { generate: null, refine: null, edit: null, fix: null, verify: null };
function cancelInflight(channel) {
  var c = _inflight[channel];
  if (c) { try { c.abort(); } catch (e) {} _inflight[channel] = null; }
}
function newController(channel) {
  cancelInflight(channel);
  var c = new AbortController();
  _inflight[channel] = c;
  return c;
}
async function fetchWithTimeout(url, opts, timeoutMs, channel) {
  var controller = (channel && _inflight[channel]) || new AbortController();
  if (channel && !_inflight[channel]) _inflight[channel] = controller;
  var t = setTimeout(function() { try { controller.abort(); } catch (e) {} }, timeoutMs);
  try {
    var merged = Object.assign({}, opts || {}, { signal: controller.signal });
    var resp = await fetch(url, merged);
    return resp;
  } finally {
    clearTimeout(t);
  }
}
function isAbortError(e) {
  return e && (e.name === 'AbortError' || /aborted/i.test(String(e.message || '')));
}

// ---- DOM: cached element handles for hot paths (Q16) ----
var DOM = {};
function $(id) {
  if (!DOM[id]) DOM[id] = document.getElementById(id);
  return DOM[id];
}

// ---- Seed counter (for regeneration) ----
var seedCounter = 0;

// ---- Seeded PRNG (deterministic from input + seed counter) ----
function createRNG(seed) {
  var h = 0;
  for (var i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  var s = Math.abs(h) || 1;
  return function () {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ---- Text Analysis ----
function clamp(v) { return Math.max(0, Math.min(1, v)); }

function analyzeText(text) {
  if (!text.trim()) return { energy: 0.5, brightness: 0.5, weight: 0.5, space: 0.3, complexity: 0.5 };
  var lower = text.toLowerCase();
  // Letters now include both ASCII a-z and Hangul (jamo + syllables) for Korean (U20).
  // Combined character class for "letter-like" content used to derive density/uniqueness.
  var letterRe = /[a-zㄱ-ㆎ가-힣]/g;
  var hangulSylRe = /[가-힣]/g;
  var asciiVowelRe = /[aeiou]/g;
  var letters = (lower.match(letterRe) || []).length;
  var asciiOnly = (lower.match(/[a-z]/g) || []).length;
  var hangulSyllables = (lower.match(hangulSylRe) || []).length;
  // Brightness heuristic: ASCII vowels count directly; each Hangul syllable contributes 0.5
  // as a vowel-proxy (every Korean syllable contains exactly one medial vowel, but the
  // syllable also contains 1-2 consonants so 0.5 approximates the vowel/consonant ratio).
  var vowelContribution = (lower.match(asciiVowelRe) || []).length + hangulSyllables * 0.5;
  var chars = (lower.match(/[a-z0-9ㄱ-ㆎ가-힣]/g) || []).join('');
  var words = text.trim().split(/\s+/).filter(Boolean);
  var uniqueChars = new Set(chars).size;
  var avgWordLen = words.reduce(function(s, w) { return s + w.length; }, 0) / Math.max(1, words.length);
  var punctuation = (text.match(/[!?.,:;\-()]/g) || []).length;
  var uppercase = (text.match(/[A-Z]/g) || []).length;
  return {
    energy: clamp((uniqueChars / 20) * 0.3 + (punctuation / Math.max(1, text.length)) * 3 + (uppercase / Math.max(1, text.length)) * 2 + Math.min(1, words.length / 8) * 0.3),
    brightness: clamp(vowelContribution / Math.max(1, letters) * 1.8),
    weight: clamp(avgWordLen / 9),
    space: clamp(1 - chars.length / Math.max(1, text.length) + (words.length < 3 ? 0.2 : 0)),
    complexity: clamp(uniqueChars / Math.max(1, chars.length) * 1.2),
  };
}

function describeMood(a) {
  var w = [];
  if (a.brightness < 0.35) w.push('dark');
  else if (a.brightness > 0.65) w.push('bright');
  else w.push('warm');
  if (a.energy > 0.65) w.push('driving');
  else if (a.energy < 0.35) w.push('gentle');
  else w.push('steady');
  if (a.weight > 0.6) w.push('heavy');
  else if (a.weight < 0.3) w.push('light');
  if (a.space > 0.55) w.push('spacious');
  else if (a.space < 0.25) w.push('dense');
  if (a.complexity > 0.7) w.push('intricate');
  return w.join(', ') || 'balanced';
}

// ---- Genre Definitions (multiple sound options per genre) ----
var GENRES = {
  edm: {
    label: 'EDM', tempoRange: [124, 140],
    scales: ['minor', 'harmonic:minor', 'dorian', 'minor:pentatonic', 'lydian', 'mixolydian', 'phrygian', 'whole:tone'],
    keys: ['A', 'E', 'D', 'C', 'F', 'Bb', 'G'],
    octaves: { lead: 4, bass: 1, chord: 4, arp: 5 },
    sounds: [
      { lead: 'sawtooth', bass: 'sine', chord: 'sawtooth', arp: 'triangle' },
      { lead: 'square', bass: 'sawtooth', chord: 'sawtooth', arp: 'sine' },
      { lead: 'sawtooth', bass: 'triangle', chord: 'square', arp: 'triangle' },
    ],
    bank: ['RolandTR909', 'RolandTR808', 'CasioRZ1'],
    drums: [
      { k: 'bd*4', s: '~ cp ~ cp', h: 'hh*16', x: '[~ oh]*4' },
      { k: 'bd*4', s: '~ [~ cp] ~ cp', h: 'hh*8', x: '[~ oh]*2' },
      { k: '[bd ~ bd ~]*2', s: '~ cp ~ cp', h: 'hh*16', x: '~ ~ ~ oh' },
      { k: 'bd [~ bd] bd [~ bd]', s: '~ cp ~ cp', h: '[~ hh]*8', x: '~ ~ [~ oh] ~' },
    ],
    progressions: [[0,5,3,6],[0,3,5,6],[0,6,5,3],[0,5,6,4],[0,3,6,5]],
    layers: ['drums', 'perc', 'bass', 'lead', 'countermelody', 'chords', 'arp', 'texture'],
    leadFx: function(rng, a, room, lpfLow, lpfHigh, filterSpeed) { return [
      '.superimpose(x=>x.add(.09))',
      '.lpf(sine.range('+lpfLow+','+lpfHigh+').slow('+filterSpeed+'))',
      '.decay(.18).sustain(.35)',
      '.delay(.25).delayfeedback(.35)',
      '.room('+room+').gain(.38)',
    ]; },
    bassFx: function(rng, a) { return ['.lpf('+Math.round(150+a.brightness*150)+').lpenv('+Math.round(2+a.energy*4)+').lpa(.01).lpd(.1).sustain(.3).gain(.55)']; },
    chordFx: function(rng, a) { return ['.struct("x('+pickFrom(rng,[3,5])+',8,-1)")', '.lpf('+Math.round(2000+a.brightness*2000)+').decay(.1).sustain(0)', '.gain(.3).room(.1)']; },
  },
  jazz: {
    label: 'Jazz', tempoRange: [84, 148],
    scales: ['dorian', 'mixolydian', 'lydian', 'bebop', 'melodic:minor', 'lydian:dominant', 'altered'],
    keys: ['D', 'G', 'C', 'F', 'Bb', 'Eb', 'A'],
    octaves: { lead: 4, bass: 2, chord: 3, arp: 0 },
    sounds: [
      { lead: 'gm_electric_piano_1', bass: 'gm_acoustic_bass', chord: 'gm_electric_piano_1', arp: null },
      { lead: 'gm_vibraphone', bass: 'gm_acoustic_bass', chord: 'gm_electric_guitar_jazz', arp: null },
      { lead: 'gm_alto_sax', bass: 'gm_acoustic_bass', chord: 'gm_electric_piano_1', arp: null },
      { lead: 'gm_trumpet', bass: 'gm_fretless_bass', chord: 'gm_electric_piano_2', arp: null },
    ],
    bank: ['RolandTR808'],
    drums: [
      { k: 'bd ~ [~ bd] ~', s: '~ cp ~ [~ cp]', h: '[hh hh hh]*2', x: '~ ~ ~ oh' },
      { k: 'bd [~ bd] ~ bd', s: '~ cp ~ ~', h: 'hh*6', x: '[~ oh] ~ ~ ~' },
      { k: 'bd ~ bd ~', s: '~ [~ cp] ~ cp', h: '[hh hh [~ hh]]*2', x: '~ ~ ~ [~ oh]' },
    ],
    progressions: [[1,4,0,0],[0,5,1,4],[0,3,5,4],[2,5,1,4],[0,1,2,4]],
    layers: ['drums', 'perc', 'bass', 'lead', 'countermelody', 'chords', 'texture'],
    leadFx: function(rng, a, room) { return ['.decay(.25).sustain(.5)', '.room(.35).gain(.45)', '.every(2, x=>x.add('+pickFrom(rng,[2,-2,5,7])+')).degradeBy(.1)']; },
    bassFx: function() { return ['.room(.25).gain(.55)']; },
    chordFx: function(rng, a) { return ['.struct("x('+pickFrom(rng,[3,5])+',8,-'+pickFrom(rng,[1,2])+')")', '.every(2, early(1/8))', '.decay(.3).sustain(.4)', '.room(.3).gain(.3)']; },
  },
  classical: {
    label: 'Classical', tempoRange: [62, 116],
    scales: ['major', 'minor', 'harmonic:minor', 'melodic:minor', 'lydian', 'harmonic:major'],
    keys: ['C', 'G', 'D', 'F', 'Bb', 'A', 'Eb'],
    octaves: { lead: 4, bass: 2, chord: 3, arp: 5 },
    sounds: [
      { lead: 'gm_acoustic_grand_piano', bass: 'gm_acoustic_grand_piano', chord: 'gm_string_ensemble_1', arp: 'gm_acoustic_grand_piano' },
      { lead: 'gm_violin', bass: 'gm_cello', chord: 'gm_string_ensemble_1', arp: 'gm_celesta' },
      { lead: 'gm_flute', bass: 'gm_acoustic_grand_piano', chord: 'gm_choir_aahs', arp: 'gm_glockenspiel' },
      { lead: 'gm_oboe', bass: 'gm_contrabass', chord: 'gm_string_ensemble_1', arp: 'gm_acoustic_grand_piano' },
    ],
    bank: null, drums: null,
    progressions: [[0,3,4,0],[0,5,3,4],[0,3,0,4],[0,4,5,3],[0,2,4,0]],
    layers: ['bass', 'lead', 'countermelody', 'chords', 'arp', 'texture'],
    leadFx: function(rng, a, room) { return ['.room('+room+').gain(.5)', '.attack(.02).release(.4)']; },
    bassFx: function(rng, a, room) { return ['.room('+room+').gain(.45)']; },
    chordFx: function(rng, a, room) { return ['.attack(.15).release(.6)', '.room('+room+').gain(.3)']; },
  },
  blues: {
    label: 'Blues', tempoRange: [72, 108],
    scales: ['minor:blues', 'major:blues', 'mixolydian', 'dorian', 'minor:pentatonic'],
    keys: ['A', 'E', 'G', 'C', 'D', 'Bb'],
    octaves: { lead: 3, bass: 2, chord: 3, arp: 0 },
    sounds: [
      { lead: 'gm_overdriven_guitar', bass: 'gm_acoustic_bass', chord: 'gm_electric_guitar_clean', arp: null },
      { lead: 'gm_harmonica', bass: 'gm_acoustic_bass', chord: 'gm_electric_piano_1', arp: null },
      { lead: 'gm_electric_guitar_clean', bass: 'gm_electric_bass_finger', chord: 'gm_acoustic_grand_piano', arp: null },
    ],
    bank: ['RolandTR808'],
    drums: [
      { k: 'bd [~ bd] sd [~ bd]', s: null, h: '[hh hh hh]*2', x: '~ ~ ~ [~ oh]' },
      { k: 'bd ~ sd ~', s: null, h: '[hh [~ hh] hh]*2', x: '~ ~ ~ oh' },
      { k: 'bd [~ bd] sd bd', s: null, h: 'hh*6', x: '[~ oh] ~ ~ ~' },
    ],
    progressions: [[0,0,3,0],[0,3,4,0],[0,3,0,4],[0,0,4,3]],
    layers: ['drums', 'perc', 'bass', 'lead', 'countermelody', 'chords', 'texture'],
    leadFx: function(rng, a) { return ['.room(.3).gain(.5)', '.delay(.2).delayfeedback(.2)']; },
    bassFx: function() { return ['.room(.2).gain(.5)']; },
    chordFx: function(rng) { return ['.struct("[~ x]*2")', '.room(.25).gain(.35)']; },
  },
  ambient: {
    label: 'Ambient', tempoRange: [50, 76],
    scales: ['lydian', 'major:pentatonic', 'whole:tone', 'dorian', 'mixolydian', 'minor:pentatonic'],
    keys: ['F', 'C', 'G', 'D', 'Eb', 'Ab'],
    octaves: { lead: 4, bass: 2, chord: 3, arp: 5 },
    sounds: [
      { lead: 'sine', bass: 'triangle', chord: 'triangle', arp: 'sine' },
      { lead: 'gm_celesta', bass: 'sine', chord: 'gm_pad_new_age', arp: 'gm_vibraphone' },
      { lead: 'gm_blown_bottle', bass: 'triangle', chord: 'gm_pad_halo', arp: 'gm_music_box' },
    ],
    bank: null, drums: null,
    progressions: [[0,2,4,6],[0,3,0,5],[0,4,2,6],[0,5,3,1]],
    layers: ['bass', 'pad', 'lead', 'arp', 'texture'],
    leadFx: function(rng, a, room) { return ['.attack(.2).release(1)', '.delay(.5).delayfeedback(.5)', '.room('+(0.5+a.space*0.4).toFixed(2)+').gain(.3)']; },
    bassFx: function(rng, a, room) { return ['.lpf('+Math.round(200+a.brightness*300)+').attack(.2).release(.8).gain(.3).room('+room+')']; },
    chordFx: function(rng, a, room) { return ['.attack(.5).release(1.5)', '.lpf(sine.range('+Math.round(400+a.weight*400)+','+Math.round(1200+a.brightness*1200)+').slow(16))', '.room('+(0.5+a.space*0.4).toFixed(2)+').gain(.15)']; },
  },
  lofi: {
    label: 'Lo-fi', tempoRange: [68, 86],
    scales: ['minor:pentatonic', 'dorian', 'minor', 'major:pentatonic', 'mixolydian'],
    keys: ['C', 'D', 'G', 'F', 'A', 'Eb'],
    octaves: { lead: 4, bass: 2, chord: 3, arp: 0 },
    sounds: [
      { lead: 'gm_electric_piano_1', bass: 'gm_acoustic_bass', chord: 'gm_electric_piano_1', arp: null },
      { lead: 'gm_vibraphone', bass: 'gm_acoustic_bass', chord: 'gm_electric_piano_2', arp: null },
      { lead: 'gm_music_box', bass: 'gm_electric_bass_finger', chord: 'gm_acoustic_grand_piano', arp: null },
    ],
    bank: ['RolandTR808'],
    drums: [
      { k: 'bd ~ sd ~', s: null, h: 'hh*8', x: '~ ~ [~ oh] ~' },
      { k: 'bd [~ bd] sd ~', s: null, h: '[~ hh]*4', x: '~ ~ ~ [~ oh]' },
      { k: 'bd ~ sd [~ bd]', s: null, h: 'hh*8', x: '~ ~ ~ oh' },
    ],
    progressions: [[0,3,5,4],[1,4,0,5],[0,5,3,4],[0,2,3,4]],
    layers: ['drums', 'perc', 'bass', 'lead', 'countermelody', 'chords', 'texture'],
    leadFx: function(rng, a) { return ['.lpf('+Math.round(1500+a.brightness*2000)+')', '.decay(.2).sustain(.4)', '.room(.35).gain(.4)', '.degradeBy(.15)']; },
    bassFx: function(rng, a) { return ['.lpf('+Math.round(150+a.brightness*150)+').decay(.1).sustain(.3).gain(.55)']; },
    chordFx: function(rng, a) { return ['.struct("[~ x]*2")', '.lpf('+Math.round(1500+a.brightness*1500)+')', '.decay(.25).sustain(.3)', '.room(.3).gain(.3)']; },
  },
  world: {
    label: 'World', tempoRange: [78, 126],
    subgenres: [
      { name: 'Flamenco', scales: ['phrygian:dominant', 'flamenco', 'phrygian'], keys: ['E', 'A', 'D', 'B'],
        sounds: [{ lead: 'gm_acoustic_guitar_nylon', bass: 'gm_acoustic_guitar_nylon', chord: 'gm_acoustic_guitar_nylon', arp: 'gm_acoustic_guitar_nylon' }]},
      { name: 'Japanese', scales: ['hirajoshi', 'in-sen', 'kumoijoshi'], keys: ['D', 'E', 'A', 'B'],
        sounds: [{ lead: 'gm_koto', bass: 'gm_koto', chord: 'gm_koto', arp: 'gm_shakuhachi' }, { lead: 'gm_shakuhachi', bass: 'gm_koto', chord: 'gm_koto', arp: 'gm_koto' }]},
      { name: 'Indian', scales: ['phrygian:dominant', 'harmonic:minor'], keys: ['C', 'D', 'G', 'A'],
        sounds: [{ lead: 'gm_sitar', bass: 'gm_sitar', chord: 'gm_sitar', arp: 'gm_sitar' }]},
      { name: 'Eastern European', scales: ['ukrainian:dorian', 'hungarian:minor', 'double:harmonic:major'], keys: ['D', 'E', 'A', 'G'],
        sounds: [{ lead: 'gm_accordion', bass: 'gm_acoustic_bass', chord: 'gm_violin', arp: 'gm_accordion' }, { lead: 'gm_violin', bass: 'gm_acoustic_bass', chord: 'gm_accordion', arp: 'gm_clarinet' }]},
      { name: 'Arabic', scales: ['double:harmonic:major', 'phrygian:dominant', 'persian'], keys: ['D', 'E', 'A', 'C'],
        sounds: [{ lead: 'gm_oboe', bass: 'gm_acoustic_bass', chord: 'gm_oboe', arp: 'gm_oboe' }]},
    ],
    octaves: { lead: 4, bass: 2, chord: 3, arp: 5 },
    bank: ['RolandTR808'],
    drums: [
      { k: 'bd [~ bd] ~ bd', s: null, h: 'hh*6', x: '~ [~ rim] ~ rim' },
      { k: 'bd ~ bd [~ bd]', s: null, h: '[hh hh [~ hh]]*2', x: '~ rim ~ [~ rim]' },
      { k: 'bd ~ [~ bd] ~', s: null, h: '[~ hh]*4', x: 'rim ~ rim ~' },
    ],
    progressions: [[0,6,5,4],[0,1,4,0],[0,3,6,4],[0,5,6,0]],
    layers: ['drums', 'perc', 'bass', 'lead', 'countermelody', 'chords', 'texture'],
    leadFx: function(rng, a, room) { return ['.room('+room+').gain(.45)', '.delay(.25).delayfeedback(.3)']; },
    bassFx: function(rng, a, room) { return ['.room('+room+').gain(.5)']; },
    chordFx: function(rng, a, room) { return ['.room('+room+').gain(.3)', '.attack(.05).release(.4)']; },
  },
};

// ---- Melody Generation ----
function pickFrom(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

function generateMelody(rng, length, restChance, subGroupChance) {
  // Build a motif that starts on a chord tone (0, 2, or 4)
  var chordTones = [0, 2, 4];
  var motifLen = rng() > 0.5 ? 3 : 4;
  var motif = [pickFrom(rng, chordTones)];
  for (var i = 1; i < motifLen; i++) {
    var r = rng();
    var step = r < 0.35 ? 1 : r < 0.55 ? -1 : r < 0.7 ? 2 : r < 0.82 ? -2 : r < 0.92 ? 3 : -3;
    motif.push(Math.max(-2, Math.min(9, motif[motif.length - 1] + step)));
  }

  // Build melody using call-response structure:
  // Call = motif, Response = variation of motif
  var notes = [];
  var isCall = true;
  while (notes.length < length) {
    var phrase;
    if (isCall) {
      // Call: original motif or slight transposition
      if (rng() < 0.7) phrase = motif.slice();
      else { var t = pickFrom(rng, [-2, -1, 1, 2]); phrase = motif.map(function(n) { return n + t; }); }
    } else {
      // Response: varied — reverse, invert, fragment, or rest
      var v = rng();
      if (v < 0.25) phrase = motif.slice().reverse();
      else if (v < 0.45) { var ax = motif[0]; phrase = motif.map(function(n) { return ax - (n - ax); }); } // inversion
      else if (v < 0.65) { var t2 = pickFrom(rng, [2, 3, 4, 5]); phrase = motif.map(function(n) { return n + t2; }); }
      else if (v < 0.8) phrase = [motif[motif.length - 1], '~']; // fragment + rest
      else phrase = ['~', motif[0]]; // rest + pickup
    }
    isCall = !isCall;

    for (var j = 0; j < phrase.length; j++) {
      if (notes.length >= length) break;
      var note = phrase[j];
      if (note === '~') { notes.push('~'); continue; }
      // Anchor: at positions 0, 3, 6, 9 (every 3rd), prefer chord tones
      var pos = notes.length % length;
      if (pos % 3 === 0 && rng() < 0.6) note = pickFrom(rng, chordTones);
      notes.push(rng() < restChance ? '~' : Math.max(-3, Math.min(11, note)));
    }
  }

  // Format with sub-groups and occasional elongation (@)
  var parts = [];
  var idx = 0;
  var ns = notes.slice(0, length);
  while (idx < ns.length) {
    if (idx + 1 < ns.length && rng() < subGroupChance && ns[idx] !== '~' && ns[idx + 1] !== '~') {
      parts.push('[' + ns[idx] + ' ' + ns[idx + 1] + ']');
      idx += 2;
    } else if (ns[idx] !== '~' && rng() < 0.12) {
      // occasional elongation for phrasing
      parts.push(ns[idx] + '@2');
      idx++;
    } else {
      parts.push(String(ns[idx]));
      idx++;
    }
  }
  return parts.join(' ');
}

// ---- Pattern Helpers ----

// Walking bass: root + passing tones, octave jumps
function genBass(rng, prog, energy) {
  var walkingPatterns = [
    function(r) { return r + ' ' + (r+4) + ' ' + r + ' ' + (r+2); },  // root-5th-root-3rd
    function(r) { return r + ' ' + (r+2) + ' ' + (r+4) + ' ' + (r+2); },  // ascending walk
    function(r) { return r + ' ' + r + ' [' + (r-3) + ' ' + (r+4) + '] ' + r; },  // octave drop
    function(r) { return r + ' [~ ' + r + '] ' + (r+4) + ' [' + (r+2) + ' ~]'; },  // syncopated
    function(r) { return r + '*4'; },  // driving root
    function(r) { return r + ' ~ ' + (r+4) + ' ~'; },  // sparse
    function(r) { return '[' + r + ' ' + (r+2) + '] ' + (r+4) + ' ' + r + ' ~'; },  // walking with rest
    function(r) { return r + ' ' + (r-1) + ' ' + r + ' ' + (r+4); },  // chromatic approach
  ];
  var pool;
  if (energy > 0.65) pool = walkingPatterns.slice(0, 4);
  else if (energy > 0.35) pool = walkingPatterns.slice(2, 7);
  else pool = walkingPatterns.slice(4, 8);
  var rhythm = pickFrom(rng, pool);
  return '<' + prog.map(rhythm).join(' ') + '>';
}

// Chords: varied voicings — triads, sus, add, power chords
function genChords(rng, prog) {
  var voicings = [
    function(r) { return '[' + r + ',' + (r+2) + ',' + (r+4) + ']'; },  // triad
    function(r) { return '[' + r + ',' + (r+4) + ',' + (r+7) + ']'; },  // wide voicing
    function(r) { return '[' + r + ',' + (r+3) + ',' + (r+4) + ']'; },  // sus4
    function(r) { return '[' + r + ',' + (r+2) + ',' + (r+4) + ',' + (r+6) + ']'; },  // 7th
    function(r) { return '[' + r + ',' + (r+4) + ']'; },  // power (root+5th)
    function(r) { return '[' + r + ',' + (r+1) + ',' + (r+4) + ']'; },  // add9
  ];
  var v = pickFrom(rng, voicings);
  return '<' + prog.map(v).join(' ') + '>';
}

// Arp: varied patterns with inversions
function genArp(rng, prog) {
  var patterns = [
    function(r) { return '[' + r + ' ' + (r+2) + ' ' + (r+4) + ' ' + (r+2) + ']'; },
    function(r) { return '[' + r + ' ' + (r+4) + ' ' + (r+2) + ' ' + (r+4) + ']'; },
    function(r) { return '[' + (r+4) + ' ' + (r+2) + ' ' + r + ' ' + (r+2) + ']'; },
    function(r) { return '[' + r + ' ' + (r+2) + ' ' + (r+4) + ' ' + (r+6) + ']'; },
    function(r) { return '[' + r + ' ~ ' + (r+4) + ' ' + (r+2) + ']'; },  // gapped
    function(r) { return '[' + (r+4) + ' ' + (r+4) + ' ' + (r+2) + ' ' + r + ']'; },  // descending with repeat
  ];
  return '<' + prog.map(pickFrom(rng, patterns)).join(' ') + '>*2';
}

function genAddPattern(rng, analysis) {
  var a = Math.round((analysis.brightness - 0.5) * 6);
  var b = Math.round((analysis.energy - 0.5) * 4);
  var c = Math.round((analysis.weight - 0.5) * -4);
  // sometimes use sub-groups in the add pattern too
  if (rng() > 0.6) return '0 ' + a + ' ' + b + ' ' + c;
  return '<0 ' + a + ' ' + b + ' ' + c + '>';
}

function genDrumGains(rng, analysis) {
  var kG = (0.55 + analysis.energy * 0.35).toFixed(2);
  // varied hat dynamics
  var hatPatterns = [
    '[.3 .12 .2 .12]*4',
    '[.3 .15 .25 .15]*4',
    '[.35 .1 .2 .15]*4',
    '[.25 .15]*8',
    '.2 [.3 .15]*2 .25 [.3 .1]*2',
  ];
  var hat = pickFrom(rng, hatPatterns);
  var snareG = (0.55 + analysis.energy * 0.15).toFixed(2);
  return kG + ', ~ ' + snareG + ' ~ ' + snareG + ', ' + hat + ', [~ .18]*4';
}

// Evocative comment words based on analysis
function genComment(rng, role, analysis) {
  var pool = {
    drums: { high: ['pulse', 'engine', 'heartbeat', 'drive'], low: ['breath', 'whisper', 'pulse'] },
    bass: { high: ['foundation', 'undertow', 'weight', 'root'], low: ['murmur', 'shadow', 'ground'] },
    lead: { high: ['voice', 'cry', 'signal', 'thread'], low: ['drift', 'trace', 'thought', 'glow'] },
    chords: { high: ['wash', 'color', 'fabric', 'harmonic field'], low: ['haze', 'cloud', 'mist', 'warmth'] },
    pad: { high: ['atmosphere', 'expanse', 'horizon'], low: ['fog', 'glow', 'stillness'] },
    arp: { high: ['shimmer', 'scatter', 'cascade'], low: ['glint', 'reflection', 'dew'] },
  };
  var words = (pool[role] || pool.lead)[analysis.energy > 0.5 ? 'high' : 'low'];
  return '// ' + pickFrom(rng, words);
}

// ---- Artist-Inspired Techniques (applied probabilistically) ----
/** @type {Record<string, (...args: any[]) => string>} */
var TECHNIQUES = {
  // .off() for time-shifted melodic copy
  off: function(rng, a) {
    var offset = pickFrom(rng, ['1/8', '1/16', '3/16']);
    var interval = pickFrom(rng, [2, 4, 5, 7]);
    return '.off(' + offset + ', x=>x.add(' + interval + ').gain(.25))';
  },
  // .superimpose() for detuning / unison width
  detune: function() {
    return '.superimpose(x=>x.add(.05))';
  },
  // .jux(rev) for stereo width
  juxRev: function() {
    return '.jux(rev)';
  },
  // .echoWith() for rhythmic echoes (Underground Plumber style)
  echoWith: function(rng) {
    var count = pickFrom(rng, [3, 4]);
    var time = pickFrom(rng, ['1/8', '1/4', '1/6']);
    return '.echoWith(' + count + ', ' + time + ', (x,i)=>x.add(i*7).gain(1/(i+1)))';
  },
  // .echo() for space
  echo: function(rng) {
    var count = pickFrom(rng, [3, 4]);
    var time = pickFrom(rng, ['1/8', '1/6']);
    return '.echo(' + count + ', ' + time + ', .5)';
  },
  // euclidean struct (Festival of Fingers style)
  euclid: function(rng) {
    var hits = pickFrom(rng, [3, 5, 7]);
    var total = pickFrom(rng, [8, 16]);
    return '.struct("x(' + hits + ',' + total + ')")';
  },
  // .degradeBy() for organic feel
  degrade: function(rng, a) {
    var amount = (0.1 + a.space * 0.3).toFixed(2);
    return '.degradeBy(' + amount + ')';
  },
  // filter automation with perlin (Melting Submarine style)
  perlinFilter: function(rng, a) {
    var lo = Math.round(300 + a.weight * 400);
    var hi = Math.round(1500 + a.brightness * 3000);
    return '.lpf(perlin.range(' + lo + ',' + hi + ').slow(8))';
  },
  // .sometimes for probabilistic variation
  sometimes: function(rng) {
    var fn = pickFrom(rng, ['rev', 'fast(2)', 'add(7)']);
    return '.sometimes(x=>x.' + fn + ')';
  },
  // fake sidechain via patterned gain
  fakeSidechain: function() {
    return '.gain("[.2 1@3]*2")';
  },
  // .layer() for parallel harmonic processing
  scaleLayer: function(rng) {
    var offsets = pickFrom(rng, [
      '0,<2 [4,6] [5,7]>/4',
      '0,<4 [2,6]>/4',
      '0,7',
    ]);
    return '.layer(scaleTranspose("' + offsets + '"))';
  },
};

// Pick N techniques based on text analysis
function pickTechniques(rng, a, genreName) {
  // weight techniques by analysis
  var pool = [];
  if (a.space > 0.4) pool.push('echo', 'juxRev');
  if (a.energy > 0.5) pool.push('off', 'echoWith', 'euclid');
  if (a.complexity > 0.5) pool.push('scaleLayer', 'sometimes');
  if (a.brightness > 0.5) pool.push('detune');
  if (a.weight > 0.4) pool.push('perlinFilter', 'fakeSidechain');
  pool.push('degrade'); // always available
  // pick 1-3 techniques
  var count = 1 + Math.floor(a.complexity * 2);
  var picked = [];
  while (picked.length < count && pool.length > 0) {
    var idx = Math.floor(rng() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}

// ---- Random & Fusion Genre Builders ----
var BASE_GENRE_NAMES = ['edm', 'jazz', 'classical', 'blues', 'ambient', 'lofi', 'world'];

function buildRandomGenre(rng) {
  var g1 = GENRES[pickFrom(rng, BASE_GENRE_NAMES)];
  var g2 = GENRES[pickFrom(rng, BASE_GENRE_NAMES)];
  var g3 = GENRES[pickFrom(rng, BASE_GENRE_NAMES)];
  // pull scale from g1, sounds from g2, drums from g3, etc
  var s1 = g1.scales || (g1.subgenres ? pickFrom(rng, g1.subgenres).scales : ['minor']);
  var s2 = g2.sounds || (g2.subgenres ? pickFrom(rng, g2.subgenres).sounds : { lead: 'sawtooth', bass: 'sine', chord: 'sawtooth', arp: 'triangle' });
  return {
    label: 'Random (' + g1.label + ' scale + ' + g2.label + ' sound + ' + g3.label + ' rhythm)',
    tempoRange: [Math.min(g1.tempoRange[0], g2.tempoRange[0]), Math.max(g1.tempoRange[1], g2.tempoRange[1])],
    scales: s1,
    keys: g1.keys || ['C', 'D', 'E', 'F', 'G', 'A'],
    octaves: g2.octaves,
    sounds: s2,
    bank: g3.bank || g1.bank || 'RolandTR808',
    drums: g3.drums || g1.drums,
    progressions: g1.progressions,
    layers: ['drums', 'perc', 'bass', 'lead', 'countermelody', 'chords', 'arp', 'texture'],
  };
}

function buildFusionGenre(rng, genreNames) {
  // Accept array of genre names (2+) and blend them
  if (!genreNames || genreNames.length < 2) {
    // fallback: pick 2 random genres
    var i1 = Math.floor(rng() * BASE_GENRE_NAMES.length);
    var i2 = (i1 + 1 + Math.floor(rng() * (BASE_GENRE_NAMES.length - 1))) % BASE_GENRE_NAMES.length;
    genreNames = [BASE_GENRE_NAMES[i1], BASE_GENRE_NAMES[i2]];
  }
  var gs = genreNames.map(function(n) { return GENRES[n]; }).filter(Boolean);
  if (gs.length < 2) gs.push(GENRES.edm); // safety

  // blend: collect all scales, average tempos, pick sounds round-robin
  var allScales = [];
  var allKeys = [];
  var allProgs = [];
  var tempoLo = 0, tempoHi = 0;
  var drums = null, bank = null;

  gs.forEach(function(g) {
    var sc = g.scales || (g.subgenres ? pickFrom(rng, g.subgenres).scales : []);
    allScales = allScales.concat(sc);
    allKeys = allKeys.concat(g.keys || []);
    allProgs = allProgs.concat(g.progressions || []);
    tempoLo += g.tempoRange[0];
    tempoHi += g.tempoRange[1];
    if (!drums && g.drums) drums = g.drums;
    if (!bank && g.bank) bank = g.bank;
  });

  // pick sounds from different genres for each role
  function getSounds(g) { return g.sounds || (g.subgenres ? pickFrom(rng, g.subgenres).sounds : {}); }
  var sndPool = gs.map(getSounds);
  var lead = sndPool[0].lead || 'sawtooth';
  var bass = sndPool[Math.min(1, sndPool.length - 1)].bass || 'sine';
  var chord = sndPool[Math.min(2, sndPool.length - 1)].chord || 'sawtooth';
  var arp = sndPool[sndPool.length - 1].arp || 'triangle';

  return {
    label: 'Fusion (' + genreNames.map(function(n) { return (GENRES[n] || {}).label || n; }).join(' x ') + ')',
    tempoRange: [Math.round(tempoLo / gs.length), Math.round(tempoHi / gs.length)],
    scales: allScales,
    keys: allKeys.length ? allKeys : ['C', 'D', 'E', 'F', 'G', 'A'],
    octaves: pickFrom(rng, gs).octaves,
    sounds: { lead: lead, bass: bass, chord: chord, arp: arp },
    bank: Array.isArray(bank) ? bank : (bank ? [bank] : ['RolandTR808']),
    drums: drums,
    progressions: allProgs,
    layers: ['drums', 'perc', 'bass', 'lead', 'countermelody', 'chords', 'arp', 'texture'],
  };
}

// ---- Main Code Generator ----
function generateCode(text, genreName) {
  var rng = createRNG(text.toLowerCase().trim() + ':' + genreName + ':' + seedCounter);
  var a = analyzeText(text);
  var g, resolvedGenreName = genreName;

  if (genreName === 'random') {
    g = buildRandomGenre(rng);
  } else if (genreName.indexOf('fusion:') === 0) {
    var fusionParts = genreName.replace('fusion:', '').split('+');
    g = buildFusionGenre(rng, fusionParts);
    resolvedGenreName = 'fusion';
  } else if (genreName === 'fusion') {
    g = buildFusionGenre(rng);
    resolvedGenreName = 'fusion';
  } else {
    g = GENRES[genreName];
  }

  var scales, keys, soundPool, subLabel = '';
  if (genreName === 'world') {
    var sub = pickFrom(rng, g.subgenres);
    scales = sub.scales; keys = sub.keys; soundPool = sub.sounds;
    subLabel = ' (' + sub.name + ')';
  } else {
    scales = g.scales; keys = g.keys; soundPool = g.sounds;
  }

  // pick from sound pool (array of options)
  var sounds = Array.isArray(soundPool) ? pickFrom(rng, soundPool) : soundPool;
  var bank = Array.isArray(g.bank) ? pickFrom(rng, g.bank) : g.bank;

  var key = pickFrom(rng, keys);
  var scaleName = pickFrom(rng, scales);
  var tempo = Math.round(g.tempoRange[0] + rng() * (g.tempoRange[1] - g.tempoRange[0]));
  var prog = pickFrom(rng, g.progressions);
  var melLen = resolvedGenreName === 'ambient' ? 6 : resolvedGenreName === 'classical' ? 12 : 8;
  var melody = generateMelody(rng, melLen, a.space * 0.3, a.energy * 0.4);
  var addPat = genAddPattern(rng, a);
  var oct = g.octaves;
  var room = (0.15 + a.space * 0.5).toFixed(2);
  var lpfLow = Math.round(400 + a.weight * 500);
  var lpfHigh = Math.round(2500 + a.brightness * 4000);
  var filterSpeed = 2 + Math.round(a.space * 6);
  function sc(o) { return '"' + key + o + ':' + scaleName + '"'; }

  // pick artist-inspired techniques
  var techniques = pickTechniques(rng, a, resolvedGenreName);
  var techNames = techniques.join(', ');

  // resolve genre-specific fx (or build default for random/fusion)
  var gFx = g.leadFx ? g : {
    leadFx: function(r2,a2,rm) { return ['.lpf(sine.range('+lpfLow+','+lpfHigh+').slow('+filterSpeed+'))','.decay(.15).sustain(.4)','.room('+rm+').gain(.4)']; },
    bassFx: function(r2,a2,rm) { return ['.lpf('+Math.round(200+a.brightness*200)+').decay(.12).sustain(.3).room('+rm+').gain(.5)']; },
    chordFx: function(r2,a2,rm) { var fx = []; if(a2.energy>0.5) fx.push('.struct("[~ x]*'+pickFrom(r2,[2,4])+'")'); fx.push('.decay(.15).sustain(.3)','.room('+rm+').gain(.28)'); return fx; },
  };

  // Generate arrangement masks — layers enter at different times
  var totalCycles = 16 + Math.round(a.complexity * 16); // 16-32 cycles before full repeat
  var masks = {
    drums: null,
    bass: null,
    lead: null,
    chords: null,
    arp: null,
  };
  if (rng() < 0.65) {
    // staggered entry: drums first, then bass, then lead, then chords
    var d_in = 0;
    var b_in = 2 + Math.floor(rng() * 4);  // bass enters 2-5 cycles in
    var l_in = b_in + 2 + Math.floor(rng() * 4); // lead enters after bass
    var c_in = Math.floor(rng() * 4); // chords can enter early or late
    masks.bass = '"<0@' + b_in + ' 1@' + (totalCycles - b_in) + '>"';
    masks.lead = '"<0@' + l_in + ' 1@' + (totalCycles - l_in) + '>"';
    if (rng() < 0.4) masks.arp = '"<0@' + (l_in + 2) + ' 1@' + (totalCycles - l_in - 2) + '>"';
  }

  // Generate .every() variation for lead
  var everyFx = '';
  if (rng() < 0.5) {
    var everyN = pickFrom(rng, [3, 4, 6, 8]);
    var everyFn = pickFrom(rng, ['rev', 'fast(2)', 'add(' + pickFrom(rng, [2, 5, 7]) + ')']);
    everyFx = '.every(' + everyN + ', x=>x.' + everyFn + ')';
  }

  var L = [];
  L.push('// "' + text + '" -> ' + g.label + subLabel);
  L.push('// ' + key + ' ' + scaleName.replace(/:/g, ' ') + ' @ ' + tempo + ' BPM');
  L.push('// mood: ' + describeMood(a));
  if (techNames) L.push('// techniques: ' + techNames);
  L.push('');
  L.push('setcpm(' + tempo + '/4)');
  L.push('');

  // DRUMS
  if (g.layers.indexOf('drums') !== -1 && g.drums) {
    var d = pickFrom(rng, g.drums);
    var dp = [d.k, d.s, d.h, d.x].filter(Boolean).join(', ');
    L.push(genComment(rng, 'drums', a));
    L.push('$: s("' + dp + '")');
    L.push('.bank("' + bank + '")');
    L.push('.gain("' + genDrumGains(rng, a) + '")');
    if (resolvedGenreName === 'lofi') L.push('.lpf(' + Math.round(2000 + a.brightness * 2000) + ')');
    if (techniques.indexOf('fakeSidechain') !== -1) L.push(TECHNIQUES.fakeSidechain());
    // filter fade-in on drums for intro feel
    if (masks.bass && rng() < 0.5) L.push('.lpf(sine.range(800,' + Math.round(4000 + a.brightness * 4000) + ').slow(' + totalCycles + '))');
    L.push('');
  }

  // BASS
  if (g.layers.indexOf('bass') !== -1) {
    L.push(genComment(rng, 'bass', a));
    L.push('$: n("' + genBass(rng, prog, a.energy) + '")');
    L.push('.scale(' + sc(oct.bass) + ').s("' + sounds.bass + '")');
    gFx.bassFx(rng, a, room).forEach(function(fx) { L.push(fx); });
    if (masks.bass) L.push('.mask(' + masks.bass + ')');
    L.push('');
  }

  // LEAD
  if (g.layers.indexOf('lead') !== -1) {
    L.push(genComment(rng, 'lead', a));
    L.push('$: n("' + melody + '".add("' + addPat + '"))');
    L.push('.scale(' + sc(oct.lead) + ').s("' + sounds.lead + '")');
    gFx.leadFx(rng, a, room, lpfLow, lpfHigh, filterSpeed).forEach(function(fx) { L.push(fx); });
    if (everyFx) L.push(everyFx);
    // artist-inspired techniques on lead
    techniques.forEach(function(t) {
      if (t === 'off' || t === 'detune' || t === 'juxRev' || t === 'echoWith' ||
          t === 'echo' || t === 'degrade' || t === 'sometimes') {
        L.push(TECHNIQUES[t](rng, a));
      }
    });
    if (masks.lead) L.push('.mask(' + masks.lead + ')');
    L.push('');
  }

  // CHORDS / PAD
  if (g.layers.indexOf('chords') !== -1 || g.layers.indexOf('pad') !== -1) {
    var isPad = g.layers.indexOf('pad') !== -1;
    L.push(genComment(rng, isPad ? 'pad' : 'chords', a));
    L.push('$: n("' + genChords(rng, prog) + '")');
    L.push('.scale(' + sc(oct.chord) + ').s("' + sounds.chord + '")');
    gFx.chordFx(rng, a, room).forEach(function(fx) { L.push(fx); });
    // chord-appropriate techniques
    techniques.forEach(function(t) {
      if (t === 'euclid') L.push(TECHNIQUES[t](rng, a));
      if (t === 'perlinFilter') L.push(TECHNIQUES[t](rng, a));
      if (t === 'scaleLayer') L.push(TECHNIQUES[t](rng));
    });
    // breathing degradation for organic feel
    if (rng() < 0.35) L.push('.degradeBy(sine.range(0,' + (0.15 + a.space * 0.25).toFixed(2) + ').slow(' + Math.round(8 + a.space * 16) + '))');
    L.push('');
  }

  // ARP
  if (g.layers.indexOf('arp') !== -1 && sounds.arp) {
    L.push(genComment(rng, 'arp', a));
    L.push('$: n("' + genArp(rng, prog) + '")');
    L.push('.scale(' + sc(oct.arp) + ').s("' + sounds.arp + '")');
    if (resolvedGenreName === 'ambient') {
      L.push('.attack(.1).release(.6)');
      L.push('.delay(.5).delayfeedback(.55)');
      L.push('.room(' + (0.6 + a.space * 0.3).toFixed(2) + ').gain(.12)');
      L.push('.pan(sine.range(.2,.8).slow(5))');
    } else {
      L.push('.decay(.06).sustain(0)');
      L.push('.delay(.3).delayfeedback(.4)');
      L.push('.gain(.18).pan(sine.range(.25,.75))');
    }
    if (masks.arp) L.push('.mask(' + masks.arp + ')');
    L.push('');
  }

  // PERCUSSION (separate from drums — rim, perc, shaker patterns)
  if (g.layers.indexOf('perc') !== -1 && bank) {
    var percPatterns = [
      'rim*4', '[~ rim]*4', 'rim [~ rim] ~ rim', '[~ rim]*2',
      '[~ perc]*4', 'perc [~ perc] ~ perc', '[~ cb]*4', 'rim*8',
    ];
    L.push(genComment(rng, 'drums', a));
    L.push('$: s("' + pickFrom(rng, percPatterns) + '")');
    L.push('.bank("' + (Array.isArray(bank) ? pickFrom(rng, bank) : bank) + '")');
    L.push('.gain(' + (0.15 + a.energy * 0.15).toFixed(2) + ')');
    if (rng() < 0.4) L.push('.pan(sine.range(.3,.7).slow(3))');
    if (rng() < 0.3) L.push('.degradeBy(' + (0.2 + a.space * 0.3).toFixed(2) + ')');
    if (masks.bass) L.push('.mask(' + masks.bass + ')');
    L.push('');
  }

  // COUNTERMELODY (second melodic voice, offset from lead)
  if (g.layers.indexOf('countermelody') !== -1) {
    var counterMel = generateMelody(rng, Math.max(4, melLen - 2), a.space * 0.4, a.energy * 0.3);
    L.push(genComment(rng, 'lead', a));
    L.push('$: n("' + counterMel + '".add("<' + genAddPattern(rng, a) + '>"))');
    L.push('.scale(' + sc(oct.lead > 3 ? oct.lead + 1 : oct.lead) + ').s("' + pickFrom(rng, ['triangle', 'sine', sounds.lead]) + '")');
    L.push('.decay(.12).sustain(.2)');
    L.push('.delay(.3).delayfeedback(.4)');
    L.push('.gain(' + (0.12 + a.brightness * 0.12).toFixed(2) + ')');
    L.push('.room(' + room + ')');
    if (rng() < 0.5) L.push('.degradeBy(' + (0.2 + a.space * 0.2).toFixed(2) + ')');
    if (masks.lead) L.push('.mask(' + masks.lead + ')');
    L.push('');
  }

  // TEXTURE (filtered noise / atmosphere)
  if (g.layers.indexOf('texture') !== -1 && rng() < 0.65) {
    var noiseTypes = ['pink', 'white', 'brown'];
    var noiseType = pickFrom(rng, noiseTypes);
    L.push(genComment(rng, 'pad', a));
    L.push('$: s("' + noiseType + '")');
    L.push('.lpf(' + Math.round(300 + a.brightness * 800) + ')');
    L.push('.gain(sine.range(' + (0.02).toFixed(2) + ',' + (0.06 + a.weight * 0.06).toFixed(2) + ').slow(' + Math.round(8 + a.space * 16) + '))');
    L.push('.room(' + (0.4 + a.space * 0.4).toFixed(2) + ')');
    if (masks.lead) L.push('.mask(' + masks.lead + ')');
    L.push('');
  }

  return L.join('\n');
}

// ---- callLLM: unified provider dispatch with timeout, cancel, refusal handling ----
async function callLLM(opts) {
  var provider = opts.provider;
  var apiKey = opts.apiKey;
  var system = opts.system;
  var user = opts.user;
  var temperature = (opts.temperature == null) ? 1.0 : opts.temperature;
  var maxTokens = opts.maxTokens || 2048;
  var channel = opts.channel || 'generate';
  var timeoutMs = opts.timeoutMs || NET.REQUEST_TIMEOUT_MS;
  var providerLabel = provider === 'gemini' ? 'Gemini' : provider === 'openai' ? 'OpenAI' : 'Claude';
  newController(channel);
  var resp, data;

  function maybeInvalidateAuth(status) {
    if (status === 401 || status === 403) invalidateVerified(provider);
  }

  if (provider === 'gemini') {
    resp = await fetchWithTimeout(
      'https://generativelanguage.googleapis.com/v1beta/models/' + MODELS.gemini + ':generateContent?key=' + encodeURIComponent(apiKey),
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: system }] },
          contents: [{ parts: [{ text: user }] }],
          generationConfig: {
            temperature: temperature,
            topP: opts.topP == null ? undefined : opts.topP,
            maxOutputTokens: maxTokens,
          },
        }) }, timeoutMs, channel);
    data = await resp.json().catch(function() { return null; });
    maybeInvalidateAuth(resp.status);
    if (!resp_ok(resp, data)) throw new Error(api_error(resp, data, providerLabel));
    var cand = data && data.candidates && data.candidates[0];
    if (cand && cand.finishReason && /SAFETY|RECITATION|BLOCKLIST/i.test(cand.finishReason)) {
      throw new Error(providerLabel + ': content blocked (' + cand.finishReason + ')');
    }
    if (!cand || !cand.content || !cand.content.parts || !cand.content.parts[0]
        || typeof cand.content.parts[0].text !== 'string') {
      throw new Error(providerLabel + ': empty or malformed response');
    }
    var gtext = cand.content.parts[0].text;
    if (!gtext.trim()) throw new Error(providerLabel + ': empty response');
    return { text: gtext };
  }

  if (provider === 'openai') {
    resp = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
      body: JSON.stringify({
        model: MODELS.openai,
        reasoning: { effort: 'none' },
        temperature: temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    }, timeoutMs, channel);
    data = await resp.json().catch(function() { return null; });
    maybeInvalidateAuth(resp.status);
    if (!resp_ok(resp, data)) throw new Error(api_error(resp, data, providerLabel));
    var choice = data && data.choices && data.choices[0];
    if (choice && choice.finish_reason === 'content_filter') {
      throw new Error(providerLabel + ': content filtered by moderation');
    }
    if (!choice || !choice.message || typeof choice.message.content !== 'string') {
      throw new Error(providerLabel + ': empty or malformed response');
    }
    var otext = choice.message.content;
    if (!otext.trim()) throw new Error(providerLabel + ': empty response');
    return { text: otext };
  }

  resp = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODELS.claude,
      max_tokens: maxTokens,
      temperature: temperature,
      system: system,
      messages: [{ role: 'user', content: user }],
    }),
  }, timeoutMs, channel);
  data = await resp.json().catch(function() { return null; });
  maybeInvalidateAuth(resp.status);
  if (!resp_ok(resp, data)) throw new Error(api_error(resp, data, providerLabel));
  if (data && data.stop_reason === 'refusal') {
    throw new Error(providerLabel + ': model refused the request');
  }
  if (!data || !data.content || !data.content[0] || typeof data.content[0].text !== 'string') {
    throw new Error(providerLabel + ': empty or malformed response');
  }
  var ctext = data.content[0].text;
  if (!ctext.trim()) throw new Error(providerLabel + ': empty response');
  return { text: ctext };
}

// ---- API response helpers (C3, C4) ----
function resp_ok(resp, data) {
  if (!resp || !resp.ok) return false;
  if (data && data.error) return false;
  return true;
}
function api_error(resp, data, providerLabel) {
  var status = resp ? (resp.status + ' ' + (resp.statusText || '')) : '';
  if (data && data.error) {
    var m = (typeof data.error === 'string') ? data.error : (data.error.message || JSON.stringify(data.error));
    return providerLabel + ': ' + m + (status ? ' [' + status.trim() + ']' : '');
  }
  return providerLabel + ': HTTP ' + status.trim();
}

// ---- Claude API Integration ----
var STRUDEL_SYSTEM_PROMPT = `You generate Strudel live-coding music. Strudel is a browser-based JavaScript port of Tidal Cycles for algorithmic music composition.

## YOUR CREATIVE PROCESS

When given a word or phrase, DO NOT map letters to notes or translate literally.
Instead, close your eyes and ask:
- What does this FEEL like? (temperature, weight, texture, speed)
- What does this LOOK like? (color, light, space, movement)
- What STORY lives inside this? (tension, longing, joy, decay, arrival)
- What is the HIDDEN thing the listener wouldn't expect?

Then choose every musical decision — scale, tempo, rhythm, timbre, effects — to embody that feeling.

EXAMPLE of creative reasoning (DO NOT output this — only output code):
"iphone" → 3am blue glow on the ceiling. Scroll addiction. Notification slot machine.
→ F lydian (the raised 4th = Apple's floating "magic" feeling)
→ 120 BPM, marimba arpeggios that keep shifting (.add so they never repeat = the algorithm)
→ celesta plinks = notifications, .sometimesBy(.4, x=>x.gain(0)) = you don't know which ones come
→ triangle pad = the glow, sine filter sweep = getting sucked in
→ hh*16 with .degradeBy(.65) = thumbs on glass at midnight

## OUTPUT FORMAT

- Output ONLY valid Strudel code. No markdown, no explanation, no prose outside comments.
- Use $: prefix for each parallel pattern layer.
- Start with setcpm(BPM/4).
- Aim for 6-12 $: layers. Each gets a poetic // comment.
  You can split or combine as the music demands. Some options:
  - Drums as 1 combined layer OR split into kick / snare / hats (more control for arrangement)
  - Lead + counter-melody as separate layers, or .layer() to split one pattern into parallel voices
  - Separate texture/noise layer (filtered pink/white/brown noise for atmosphere)
  - Percussion layer (rim, perc, shaker — separate from drums for independent control)
  Advanced technique (use when it fits, not required):
  - Shared harmonic context: const chords = chord("..."); then multiple $: layers reference it
  - Shared FX: const fx = x => x.s('saw').cutoff(1200); then .apply(fx) on multiple layers
  - .layer() from one source: melody.layer(x=>x.scaleTranspose(0), x=>x.scaleTranspose(2).early(1/8))
  Do what serves the music. 5 well-crafted layers beat 12 empty ones.
- The opening // comment block should include:
  Line 1: the input text, genre, key/scale, BPM
  Line 2-4: a SHORT POEM (2-4 lines) that distills what you heard in the input — the image, feeling, or hidden story. Let the scale/tempo/sounds you chose live inside the poem without naming them. Concrete imagery, compressed, no tech jargon. Match the poem's language to the input text's language when possible. Example:
  // "Contains: Menthol, Camphor" -> lofi / C harmonic minor / 72 BPM
  // a cold bite under the tongue.
  // petrolatum clings to the dusk.
  // somewhere a small oil evaporates into blue.

## MUSIC THEORY PRINCIPLES
(These principles are implemented in the CODE STRUCTURE PATTERNS provided in the user message.)

Voice leading: minimize movement between chords. Each voice moves by step (1-2 scale degrees), not leaps.
4-part harmony: root (bass), 3rd+5th (chord), melody (top voice). Keep voices in their registers.
Anchor points: in a 12-step melody, align with chord tones at steps 1, 4, 7, 10. Passing tones between.
Tension-release: dissonance (7ths, suspensions, altered tones) → resolution (root, 3rd, 5th).
Call and response: 2-bar phrase (call), 2-bar answer (response). The answer can vary, transpose, or invert.
Rhythmic counterpoint: when melody is busy, accompaniment is sparse. When melody rests, accompaniment fills.
Dynamic arc: intro (sparse, quiet) → build (add layers, open filters) → peak (full, loud) → release (strip layers).

## MOOD PARAMETERS

When shifting the mood of a piece, adjust these parameters together:
  dark: tempo -10%, lpf -200Hz, room +0.2, gain -10%
  euphoric: tempo +10%, lpf +400Hz, room +0.1, gain +10%
  melancholic: tempo -15%, lpf -100Hz, room +0.3, gain -5%
  aggressive: tempo +15%, lpf +600Hz, gain +15%
  dreamy: tempo -20%, lpf -300Hz, room +0.4, delay +0.3, gain -10%
  peaceful: tempo -25%, lpf -200Hz, room +0.25, gain -15%
  energetic: tempo +20%, lpf +300Hz, gain +10%

## CRITICAL REMINDERS
(Full syntax, effects, scales, sounds, and techniques are in the user message COMPLETE COMPONENT REFERENCE.)

1. Melody: MOTIFS — a 3-4 note phrase that repeats/varies. Call-response structure. Anchor to chord tones (0, 2, 4) on strong beats.
2. Dynamics: layers at different gains (drums .6-.8, bass .4-.6, lead .3-.5, pad .1-.3). Not everything at full blast.
3. Space: rests (~) and .degradeBy make music breathe. Silence is a note.
4. Every layer needs a REASON — if you can't name what it represents in the story, delete it.
5. Scale choice is your most important creative decision. It sets the entire emotional world. Never default to C minor + sawtooth + TR909. Every choice needs a REASON tied to the input.
6. Surprise: at least one unexpected element — unusual sound, non-aligned rhythm, technique used for a non-obvious reason.
7. ARRANGEMENT: use .mask() so layers enter at different times. Example: .mask("<0@4 1@28>") on bass, .mask("<0@8 1@24>") on lead.
8. VARIATION: use .every(N, fn) on at least one layer. Example: .every(4, x=>x.rev()). Music that never changes is dead.
9. TEXTURE: .degradeBy(sine.range(0, 0.3).slow(16)) on pads/chords for organic breathing.
10. MOVEMENT: .lpf(sine.range(lo, hi).slow(N)) on drums or bass for build/release.
11. MINI-NOTATION SYNTAX: () is ONLY for euclidean rhythms x(k,n). For grouping use []. WRONG: .struct("x(~ x x ~)"). RIGHT: .struct("[~ x x ~]"). WRONG: "<0 2 4 6>7". RIGHT: "<0 2 4 6>".add(7).
12. Use setcpm(BPM/4) for tempo. setbpm DOES NOT EXIST.
13. line(a,b,n) and ramp() DO NOT EXIST. For linear sweep use saw.range(a,b).slow(n).
14. .stutter() DOES NOT EXIST. Use .ply(n) to repeat each event n times.
15. FUNCTION CALLS NEED PARENTHESES: .sometimes(x=>x.rev()) NOT .sometimes(x=>x.rev). Same for .fast(), .slow(), .ply() etc inside callbacks.
16. BASS DENSITY: In EDM/blues/jazz, bass should play multiple notes per cycle. WRONG: n("<0 3 5 7>") = 1 note per cycle = too slow. RIGHT: n("<[0 0 3 0] [5 5 7 5]>") or n("0 3 5 7") = 4 notes per cycle.
17. TRIADS not power chords: [0,2,4] = root+3rd+5th (triad). [0,4,7] = root+5th+octave (power chord, empty). Use [root, root+2, root+4] for scale-degree triads.`;

var KEY_NS = 'tts_api_key_';
var PERSIST_FLAG_NS = 'tts_persist_';
var SPLIT_SS_NS = 'tts_split_';

// ---- splitStore ----
// XOR-split keystore for ephemeral mode (persist OFF). Stores half the cipher
// in window.name (volatile, browser never writes it to disk) and the other
// half in sessionStorage (which IS sometimes disk-dumped via session restore,
// but only sees random bytes — not the original secret — without the other half).
var SPLIT_NAMESPACE = 'tts';

function _readWindowNamespace() {
  try {
    var raw = window.name || '';
    if (!raw) return {};
    var parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object' && parsed[SPLIT_NAMESPACE] && typeof parsed[SPLIT_NAMESPACE] === 'object')
      ? parsed[SPLIT_NAMESPACE]
      : {};
  } catch (_) {
    return {};
  }
}

function _writeWindowNamespace(ns) {
  var outer;
  try { outer = JSON.parse(window.name || '{}'); } catch (_) { outer = {}; }
  if (!outer || typeof outer !== 'object') outer = {};
  outer[SPLIT_NAMESPACE] = ns;
  window.name = JSON.stringify(outer);
}

function _b64encode(bytes) {
  var s = '';
  for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function _b64decode(s) {
  var bin = atob(s);
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function setSplitKey(provider, secret) {
  var enc = new TextEncoder().encode(secret);
  var share = crypto.getRandomValues(new Uint8Array(enc.length));
  var xor = new Uint8Array(enc.length);
  for (var i = 0; i < enc.length; i++) xor[i] = enc[i] ^ share[i];
  var ns = _readWindowNamespace();
  ns['k_' + provider] = _b64encode(share);
  _writeWindowNamespace(ns);
  sessionStorage.setItem(SPLIT_SS_NS + provider, _b64encode(xor));
}

function getSplitKey(provider) {
  var ns = _readWindowNamespace();
  var shareB64 = ns['k_' + provider];
  var xorB64 = sessionStorage.getItem(SPLIT_SS_NS + provider);
  if (!shareB64 || !xorB64) return '';
  var share, xor;
  try {
    share = _b64decode(shareB64);
    xor = _b64decode(xorB64);
  } catch (_) {
    return '';
  }
  if (share.length !== xor.length) {
    // Corrupted state — clear both halves so we don't return garbage.
    clearSplitKey(provider);
    return '';
  }
  var out = new Uint8Array(share.length);
  for (var j = 0; j < share.length; j++) out[j] = share[j] ^ xor[j];
  try { return new TextDecoder().decode(out); } catch (_) { return ''; }
}

function clearSplitKey(provider) {
  var ns = _readWindowNamespace();
  delete ns['k_' + provider];
  _writeWindowNamespace(ns);
  sessionStorage.removeItem(SPLIT_SS_NS + provider);
}

function getApiKey(provider) {
  var p = provider || getProvider();
  var persist = localStorage.getItem(PERSIST_FLAG_NS + p) === '1';
  if (persist) {
    var ls = localStorage.getItem(KEY_NS + p);
    if (ls) return ls;
  } else {
    var sp = getSplitKey(p);
    if (sp) return sp;
  }
  var sp2 = getSplitKey(p);
  if (sp2) return sp2;
  var ls2 = localStorage.getItem(KEY_NS + p);
  if (ls2) return ls2;
  return '';
}

function getApiKeyPersist(provider) {
  var p = provider || getProvider();
  return localStorage.getItem(PERSIST_FLAG_NS + p) === '1';
}

function saveApiKey(key, provider, persist) {
  var p = provider || getProvider();
  if (!key) {
    clearSplitKey(p);
    localStorage.removeItem(KEY_NS + p);
    localStorage.removeItem(PERSIST_FLAG_NS + p);
    return;
  }
  if (persist) {
    clearSplitKey(p);
    localStorage.setItem(KEY_NS + p, key);
    localStorage.setItem(PERSIST_FLAG_NS + p, '1');
  } else {
    localStorage.removeItem(KEY_NS + p);
    localStorage.removeItem(PERSIST_FLAG_NS + p);
    setSplitKey(p, key);
  }
}

// ---- One-time migration v1 ----
// Move legacy session-only keys (which used to live in localStorage) into
// splitStore, and convert the boolean tts_verified_<prov> flag into the
// timestamp form. Idempotent and best-effort: on failure we don't mark
// the migration done and we don't damage the originals — retry next load.
function _migrateV1() {
  if (localStorage.getItem('tts_migrated_v1') === '1') return;
  var providers = ['gemini', 'openai', 'claude'];
  try {
    for (var i = 0; i < providers.length; i++) {
      var pr = providers[i];
      var lsKey = localStorage.getItem(KEY_NS + pr);
      var persistFlag = localStorage.getItem(PERSIST_FLAG_NS + pr) === '1';
      if (lsKey && !persistFlag) {
        // User had a session-only key that we previously kept in localStorage
        // (legacy behavior). Move it to splitStore.
        setSplitKey(pr, lsKey);
        localStorage.removeItem(KEY_NS + pr);
      }
      // Boolean -> timestamp verify flag.
      var oldVerifiedFlag = localStorage.getItem('tts_verified_' + pr);
      if (oldVerifiedFlag === '1' && !localStorage.getItem('tts_verified_at_' + pr)) {
        localStorage.setItem('tts_verified_at_' + pr, String(Date.now()));
      }
      if (oldVerifiedFlag !== null) {
        localStorage.removeItem('tts_verified_' + pr);
      }
    }
    localStorage.setItem('tts_migrated_v1', '1');
  } catch (e) {
    // Don't set the flag — retry on next load. Don't damage originals.
    console.warn('[tts] migration v1 deferred:', e && e.message);
  }
}
_migrateV1();

// ---- Full Strudel Component Reference ----
// Injected into user message so Claude knows EVERYTHING available, not just genre stereotypes.
var STRUDEL_COMPONENTS = `## COMPLETE COMPONENT REFERENCE

SYNTHS:
  Basic waveforms: sine, sawtooth, square, triangle
  Noise: white, pink, brown (noise types), .noise(amount) adds noise to oscillator, .crackle(density)
  FM synthesis: .fmh(harmonicity) .fmattack(s) .fmdecay(s) .fmsustain(0-1) .fmenv("lin"|"exp")
    fmh at whole numbers = tonal, decimals = metallic/bell-like
  Wavetable: sound("wt_NAME") — 1000+ one-cycle waveforms from AKWF library
    .loopBegin(0-1) .loopEnd(0-1) to scan through wavetable
  Additive: .partials("1 .5 .25 .125") sets harmonic magnitudes, .phases("0 .5 0 .5") sets phase per harmonic
  Vibrato: .vib(hz) .vibmod(semitones)

EFFECTS (full signal chain order):
  1. Gain + ADSR: .gain(0-1) .attack(s) .decay(s) .sustain(0-1) .release(s) .adsr("a:d:s:r")
  2. Lowpass: .lpf(hz) .lpq(0-50) .ftype("12db"|"ladder"|"24db")
     Filter envelope: .lpenv(amount) .lpa(s) .lpd(s) .lps(0-1) .lpr(s)
  3. Highpass: .hpf(hz) .hpq(0-50), envelope: .hpenv .hpa .hpd .hps .hpr
  4. Bandpass: .bpf(hz) .bpq(0-50), envelope: .bpenv .bpa .bpd .bps .bpr
  5. Vowel: .vowel("a e i o u ae oe ue")
  6. Resample: .coarse(factor) — fake downsampling
  7. Bitcrush: .crush(1-16)
  8. Waveshape: .shape(0-1) .distort(amount)
  9. Tremolo: .tremolosync(cycles) .tremolodepth(0-1) .tremoloskew(0-1) .tremolophase(cycles) .tremoloshape("tri"|"sine"|"square"|"saw")
  10. Compressor: .compressor("threshold:ratio:knee:attack:release")
  11. Pan: .pan(0-1) .xfade(0=left, 0.5=both, 1=right)
  12. Stereo: .jux(fn) apply fn to right channel, .juxBy(width, fn) adjustable stereo
  13. Phaser: .phaser(speed) .phaserdepth(0-1) .phasercenter(hz) .phasersweep(hz)
  14. Postgain: .postgain(amount)
  15. Delay send: .delay(0-1) .delaytime(s) .delayfeedback(0-1)
  16. Reverb send: .room(0-1) .roomsize(0-10) .roomfade(s) .roomlp(hz) .roomdim(hz) .iresponse(sample)
  Dynamics: .gain(0-1) .velocity(0-1)
  Pitch envelope: .penv(semitones) .pattack(s) .pdecay(s) .prelease(s) .pcurve(0=linear,1=exp) .panchor(0|1)
  Filter envelope (full): .lpenv(N) .lpattack(s)/.lpa(s) .lpdecay(s)/.lpd(s) .lpsustain(0-1)/.lps(N) .lprelease(s)/.lpr(s)
    Same for hp: .hpenv .hpattack .hpdecay .hpsustain .hprelease
    Same for bp: .bpenv .bpattack .bpdecay .bpsustain .bprelease
  Ducking/sidechain: .duckorbit(orbit)/.duck(orbit) .duckattack(s) .duckdepth(0-1)
  Orbits: .orbit(n) — routes to shared delay/reverb bus

SAMPLE MANIPULATION:
  .begin(0-1) .end(0-1) — trim playback range
  .speed(n) — playback speed (negative = reverse)
  .cut(group) — cut group (stops other sounds in same group, like drum machines)
  .clip(n) — multiply event duration
  .loop(1) .loopBegin(0-1) .loopEnd(0-1) — sample looping
  .loopAt(cycles) — timestretch to fit N cycles
  .fit() — auto-speed to match event duration
  .chop(n) — slice into N granular pieces
  .striate(n) — progressive slicing across iterations
  .slice(n, pattern) — trigger specific numbered slices
  .splice(n, pattern) — like slice but adjusts speed per slice

ALL 92 SCALES (grouped by character):
  Bright: major, lydian, major:pentatonic, mixolydian, ionian:pentatonic, lydian:augmented, major:augmented
  Dark: minor, phrygian, harmonic:minor, locrian, minor:pentatonic, ultralocrian
  Jazz: dorian, bebop, bebop:major, melodic:minor, lydian:dominant, altered, half-whole:diminished, locrian:#2
  Blues: minor:blues, major:blues, composite:blues
  Floating: whole:tone, augmented, enigmatic, prometheus, six:tone:symmetric, leading:whole:tone
  Spanish/Arabic: phrygian:dominant, flamenco, double:harmonic:major, persian, oriental
  Japanese: hirajoshi, in-sen, iwato, kumoijoshi, pelog, balinese
  Eastern European: hungarian:minor, hungarian:major, ukrainian:dorian, double:harmonic:lydian
  Indian: todi:raga, kafi:raga, purvi:raga, malkos:raga
  Uncommon: neapolitan:major, harmonic:major, lydian:minor, lydian:diminished, locrian:6, dorian:b2, dorian:#4, mixolydian:b6, scriabin, egyptian, ritusen
  Messiaen: messiaen's:mode:#2 through #7
  All: chromatic, diminished

GM INSTRUMENTS (full list):
  Piano: gm_acoustic_grand_piano, gm_bright_acoustic_piano, gm_electric_grand_piano, gm_honky_tonk_piano
  EP: gm_electric_piano_1, gm_electric_piano_2
  Keys: gm_harpsichord, gm_clavinet, gm_celesta, gm_glockenspiel, gm_music_box, gm_vibraphone, gm_marimba, gm_xylophone, gm_tubular_bells
  Organ: gm_drawbar_organ, gm_percussive_organ, gm_rock_organ, gm_church_organ, gm_reed_organ, gm_accordion, gm_harmonica
  Guitar: gm_acoustic_guitar_nylon, gm_acoustic_guitar_steel, gm_electric_guitar_jazz, gm_electric_guitar_clean, gm_electric_guitar_muted, gm_overdriven_guitar, gm_distortion_guitar
  Bass: gm_acoustic_bass, gm_electric_bass_finger, gm_electric_bass_pick, gm_fretless_bass, gm_slap_bass_1, gm_synth_bass_1, gm_synth_bass_2
  Strings: gm_violin, gm_viola, gm_cello, gm_contrabass, gm_string_ensemble_1, gm_string_ensemble_2, gm_synth_strings_1, gm_pizzicato_strings
  Brass: gm_trumpet, gm_trombone, gm_tuba, gm_french_horn, gm_brass_section, gm_synth_brass_1
  Woodwind: gm_soprano_sax, gm_alto_sax, gm_tenor_sax, gm_baritone_sax, gm_oboe, gm_english_horn, gm_bassoon, gm_clarinet, gm_piccolo, gm_flute, gm_recorder, gm_pan_flute, gm_blown_bottle, gm_shakuhachi
  Synth lead: gm_lead_1_square, gm_lead_2_sawtooth, gm_lead_5_charang, gm_lead_6_voice, gm_lead_8_bass_lead
  Synth pad: gm_pad_new_age, gm_pad_warm, gm_pad_poly, gm_pad_choir, gm_pad_bowed, gm_pad_metallic, gm_pad_halo, gm_pad_sweep
  World: gm_sitar, gm_banjo, gm_shamisen, gm_koto, gm_kalimba, gm_bagpipe, gm_fiddle, gm_shanai
  Vocal: gm_choir_aahs, gm_voice_oohs, gm_synth_choir
  Percussion: gm_tinkle_bell, gm_steel_drums, gm_woodblock, gm_taiko_drum, gm_melodic_tom
  SFX: gm_guitar_fret_noise, gm_breath_noise, gm_seashore, gm_bird_tweet, gm_telephone_ring, gm_helicopter, gm_applause

DRUM BANKS: RolandTR909, RolandTR808, RolandTR707, RolandCompurhythm1000, AkaiLinn, RhythmAce, ViscoSpaceDrum, CasioRZ1
  Drum sounds: bd sd cp hh oh rim lt mt ht cr rd sh cb tb perc misc fx

PATTERN MODIFIERS (essential for arrangement and variation):
  .mask(pat) — gate events: .mask("<0@8 1@24>") = silent 8 cycles, play 24
  .every(n, fn) — apply fn every nth cycle: .every(4, x=>x.rev())
  .lastOf(n, fn) — apply fn on last of n cycles: .lastOf(8, x=>x.room(1))
  .firstOf(n, fn) — apply fn on first of n cycles
  .sometimes(fn) / .often(fn) / .rarely(fn) — probabilistic per cycle
  .sometimesBy(prob, fn) — custom probability: .sometimesBy(.3, x=>x.speed(2))
  .when(pat, fn) — apply fn when pattern is true: .when("<1 0 0 1>", x=>x.fast(2))
  .chunk(n, fn) — divide into n parts, apply fn to one per cycle
  .iter(n) — rotate pattern start by 1/n each cycle
  .palindrome() — reverse every other cycle`;

// ---- Genre Context: starting point, not a cage ----
var GENRE_CONTEXT = {
  edm:       'EDM starting point: 124-140 BPM, four-on-floor, sawtooth + filter sweeps. Choose a scale that matches the INPUT, not a default. Consider hybrid approaches — ambient-EDM with sine pads, jazz-EDM with complex chords. Typical arrangement: intro 8 cycles → build 8 → drop 16 → break 8 → drop 16 → outro 8.',
  jazz:      'Jazz starting point: 80-160 BPM, swing feel, Rhodes/bass/ride, dorian/bebop. BUT: jazz has absorbed everything — electronic jazz, afro-jazz, jazz-funk, free jazz. Go wherever the input leads. Typical arrangement: head 8 cycles → solo 16 → head 8. Or: intro 4 → AABA form 32 → outro 4.',
  classical: 'Classical starting point: 60-120 BPM, piano/strings, major/minor, no electronics. BUT: modern classical breaks every rule — prepared piano, electronics, quarter-tones. The concept decides. Typical arrangement: exposition 16 cycles → development 16 → recapitulation 16. Or: ABA form.',
  blues:     'Blues starting point: 70-110 BPM, shuffle, pentatonic/blues scale, guitar. BUT: blues lives in hip-hop, in electronica, in jazz — the feeling is what matters, not the 12-bar form. Typical arrangement: 12-bar form repeating. Intro 4 → verse 12 → verse 12 → bridge 8 → verse 12 → outro 4.',
  ambient:   'Ambient starting point: 50-80 BPM, long attacks, heavy reverb, sparse. BUT: ambient can be terrifying (dark ambient), rhythmic (ambient techno), or glitchy (microsound). Follow the mood. Typical arrangement: layers enter one by one every 8-16 cycles. No sharp sections. Continuous evolution over 32-64 cycles.',
  lofi:      'Lo-fi starting point: 68-86 BPM, muffled drums, Rhodes, tape warmth. BUT: lo-fi is an aesthetic that can be applied to any genre — lo-fi jazz, lo-fi electronic, lo-fi classical. Typical arrangement: intro 4 cycles → loop 16 → variation 16 → loop 16 → outro 4. Keep it circular.',
  world:     'World music: pick a specific tradition and commit (Flamenco, Japanese, Indian, Arabic, West African, Celtic, etc.) OR deliberately hybridize two traditions. Use the right scales AND instruments for your chosen tradition. Typical arrangement: drone or rhythmic ostinato first, melody enters gradually. Structure varies by tradition.',
  random:    'No genre constraints. Follow only what the input text evokes. Invent if needed. Use any combination of sounds, scales, and techniques.',
  fusion:    'Fusion: pick two genres that shouldn\'t work together and find the bridge. The tension between them IS the music. Jazz harmony + glitch drums. Classical melody + 808 bass. Ambient pads + breakbeat.',
};

// ---- Artist Examples: real code from the Strudel community ----
// ---- Code Structure Patterns (copyright-free structural idioms) ----
// These show HOW to organize code, not what notes to play.
var CODE_PATTERNS = `--- CODE STRUCTURE PATTERNS (use these organizational idioms) ---

ORGANIZATION:

  1. Shared effect function applied across layers
    const fx = x => x.s('sawtooth').cutoff(1200).gain(.5)
      .attack(0).decay(.16).sustain(.3).release(.1);
    // then: .apply(fx) on any layer

  2. Shared harmonic context via variable
    let chords = chord("<Cm7 Fm7 G7 Ab^7>").dict('lefthand');
    stack(
      chords.voicing().struct("[~ x]*2"),
      n("<0!3 1*2>").set(chords).mode("root:g2").voicing().s("gm_acoustic_bass"),
      chords.n("[0 <4 3>*2](3,8)").anchor("D5").voicing()
    )

  3. .mask() for arrangement (intro/build/drop structure)
    .mask("<0@8 1@16>")      // silent 8 cycles, play 16
    .mask("<x@7 ~>/8")       // play 7 cycles, rest 1

MELODY & HARMONY:

  4. .layer() for arpeggiated split from one source
    "<0 2 4 6>/2".scale("C:minor").struct("[~ x]*2")
    .layer(
      x=>x.scaleTranspose(0).early(0),
      x=>x.scaleTranspose(2).early(1/8),
      x=>x.scaleTranspose(7).early(1/4)
    ).note()

  5. Chained .off() to build arpeggios from a single note
    "<c*2 a(3,8) f(3,8,2) e*2>"
      .off(1/8, add(7))       // add 5th above, delayed
      .off(1/8, add(12))      // add octave above, delayed again
      .note().jux(rev)

  6. Polyrhythmic .add() for time-varying harmony
    n("0 [2 4] <3 5> [~ <4 1>]".add("<0 [0,2,4]>"))
    // on some cycles adds nothing, on others adds a triad stack

  7. Scale cycling for harmonic movement
    .scale("<C:major C:mixolydian F:lydian>/4")

  8. .echoWith() for pitched cascade
    .echoWith(4, 1/8, (x,i)=>x.add(i*7).gain(1/(i+1)))
    // each echo adds a 5th above and decays in volume

RHYTHM & TIME:

  9. Phasing — two tempos creating gradual drift
    note("c d e f g a b c5")*[8,8.1]
    // plays at two imperceptibly different speeds = phase shift

  10. Nested .off() for recursive rhythmic complexity
    s("bd sd [rim bd] sd, [~ hh]*4")
      .off(2/16, x=>x.speed(1.5).gain(.25)
      .off(3/16, y=>y.vowel("<a e i o>*8")))
    // second off is INSIDE first — creates layered echoes

  11. .every() with patterned offset for syncopation
    .every(2, early("<.25 .125 .5>"))
    // shifts timing every other cycle by varying amounts

  12. Euclidean struct with offset rotation
    .struct("x(3,8,-1)")     // 3 hits in 8 steps, rotated by -1
    .struct("x(5,8,-2)")     // 5 hits in 8 steps, rotated by -2

TIMBRE & TEXTURE:

  13. Detuned unison for width
    .superimpose(x=>x.add(0.06))     // slightly sharp copy = lush chorus
    // or stack oscillators:
    .add(note("0, .1"))              // root + detuned copy simultaneously

  14. Perlin noise for organic pitch/filter drift
    .add(note(perlin.range(0,.5)))   // tape warble — smooth pitch wander
    .lpf(perlin.range(400,2000).slow(8))  // breathing filter

  15. Filter envelope for pluck/acid articulation
    .lpf(400).lpenv(4).lpa(.01).lpd(.15)  // sharp attack, quick decay
    .lpf(200).lpenv(-3).lpa(.1)           // reverse envelope (opens then closes)

  16. Wavetable morphing with sequential index
    note("c2*8").s("wt_dbass").n(run(8)).fast(2)
    // run(8) = 0 1 2 3 4 5 6 7 — sweeps through wavetable variants

SAMPLE MANIPULATION:

  17. Ordered sample slicing with pattern
    s("break").fit().slice(8, "<0 1 2 3 4*2 5 6 [6 7]>*2")
    // chop into 8, sequence them with stutters and subdivisions

  18. .early() for loop alignment
    n(run(8)).s("tabla").early(2/8)
    // phase-shifts the entry point of a sample loop

SPATIAL & DYNAMICS:

  19. stack() with independent tempo per voice
    stack(melody, pad.slow(2), bass, arp.fast(2))

  20. Multi-way .jux() for stereo splitting
    .jux(id, rev, x=>x.speed(2))
    // left=original, center=reversed, right=double speed

  21. Probabilistic layering — controlled chaos
    .sometimes(x=>x.rev())            // 50% reverse each cycle
    .rarely(ply("2"))                  // 25% stutter
    .degradeBy(sine.range(0,.5).slow(32))  // degradation that breathes

TRANSITIONS & DYNAMICS:

  22. Fade in/out via gain signal
    .gain(sine.range(0, 1).slow(4))      // 4-cycle fade in
    .gain(sine.range(1, 0).slow(4))      // 4-cycle fade out

  23. Filter sweep build/drop
    .lpf(sine.range(200, 8000).slow(2))  // 2-cycle filter open
    .lpf(sine.range(8000, 200).slow(2))  // 2-cycle filter close

  24. Stutter/glitch transition
    .ply(4).fast(2)                       // rapid-fire stutter
    .gain(square.range(0, 1).fast(8))     // rhythmic gate

  25. Breathing dynamics (natural volume swell)
    .gain(sine.range(0.7, 1).slow(8))    // gentle breathing
    .gain(sine.range(0.3, 1).fast(4))    // pumping/sidechain feel

  26. Crescendo/diminuendo over long arc
    .gain(sine.range(0.1, 1).slow(32))   // 32-cycle crescendo
    .mask("<0@8 1@24>")                    // silent 8, play 24 = intro

ARRANGEMENT:

  27. Section-based structure with mask
    // intro: sparse → build: add layers → drop: full → outro: strip
    $: drums.mask("<0@4 1@28>")           // drums enter after 4 cycles
    $: bass.mask("<0@8 1@24>")            // bass enters after 8
    $: lead.mask("<0@12 1@16 0@4>")       // lead: 12 silent, 16 play, 4 silent

  28. Conditional variation with .every()
    .every(4, x=>x.rev())                // reverse every 4th cycle
    .every(3, x=>x.fast(2))              // double speed every 3rd
    .every(8, x=>x.add(7))              // transpose up a 5th every 8th

  29. .lastOf() for periodic surprise
    .lastOf(4, x=>x.ply(2).speed(-1))   // stutter + reverse on last of 4
    .lastOf(8, x=>x.room(1).delay(.5))  // wash out on last of 8`;

// ---- Build the full user message with context injection ----
function buildUserMessage(text, genre) {
  var parts = [];

  // 1. The creative input
  parts.push('"' + text + '"');

  // 2. Genre context — a starting point, not a cage
  if (genre.indexOf('fusion:') === 0) {
    // multi-genre fusion: list each genre's context
    var fusionParts = genre.replace('fusion:', '').split('+');
    parts.push('\nFusion of ' + fusionParts.length + ' genres: ' + fusionParts.join(' + ') + '.');
    parts.push('Find the bridge between them. The tension and contrast IS the music.');
    fusionParts.forEach(function(g) {
      if (GENRE_CONTEXT[g]) parts.push('\n[' + g.toUpperCase() + '] ' + GENRE_CONTEXT[g]);
    });
  } else if (GENRE_CONTEXT[genre]) {
    parts.push('\n' + GENRE_CONTEXT[genre]);
  }

  // 3. Full component reference — Claude sees EVERYTHING available
  parts.push('\n' + STRUDEL_COMPONENTS);

  // 4. Code structure patterns (copyright-free organizational idioms)
  parts.push('\n' + CODE_PATTERNS);

  return parts.join('\n');
}

// ---- Provider Abstraction ----
function getProvider() {
  return localStorage.getItem('tts_provider') || 'gemini';
}

function saveProvider(p) {
  localStorage.setItem('tts_provider', p);
}

function buildVariationPrompt(text, genre) {
  var userPrompt = buildUserMessage(text, genre);
  if (seedCounter > 0) {
    userPrompt += '\n\n(Variation #' + (seedCounter + 1) + ' — try a DIFFERENT scale, tempo, mood, or approach than the previous attempt. Surprise me.)';
  }
  return userPrompt;
}

async function generateWithAI(text, genre, apiKey) {
  var provider = getProvider();
  if (provider === 'gemini') return generateWithGemini(text, genre, apiKey);
  if (provider === 'openai') return generateWithOpenAI(text, genre, apiKey);
  return generateWithClaude(text, genre, apiKey);
}

async function generateWithClaude(text, genre, apiKey) {
  var r = await callLLM({
    provider: 'claude', apiKey: apiKey,
    system: STRUDEL_SYSTEM_PROMPT,
    user: buildVariationPrompt(text, genre),
    temperature: Math.min(1.2, 0.9 + seedCounter * 0.05),
    maxTokens: 2048,
  });
  return stripFences(r.text);
}

async function generateWithGemini(text, genre, apiKey) {
  var r = await callLLM({
    provider: 'gemini', apiKey: apiKey,
    system: STRUDEL_SYSTEM_PROMPT,
    user: buildVariationPrompt(text, genre),
    temperature: 1.0,
    topP: Math.min(0.99, 0.9 + seedCounter * 0.02),
    maxTokens: 2048,
  });
  return stripFences(r.text);
}

async function generateWithOpenAI(text, genre, apiKey) {
  var r = await callLLM({
    provider: 'openai', apiKey: apiKey,
    system: STRUDEL_SYSTEM_PROMPT,
    user: buildVariationPrompt(text, genre),
    temperature: Math.min(1.2, 0.9 + seedCounter * 0.05),
    maxTokens: 2048,
  });
  return stripFences(r.text);
}

// ---- Pre-evaluation normalization (silent, non-functional fixes only) ----
function normalize(code) {
  // GM pad numbered names → unnumbered (cosmetic, won't cause errors but won't load)
  return code
    .replace(/gm_pad_1[_a-z]*/g, 'gm_pad_new_age')
    .replace(/gm_pad_2[_a-z]*/g, 'gm_pad_warm')
    .replace(/gm_pad_3[_a-z]*/g, 'gm_pad_poly')
    .replace(/gm_pad_4[_a-z]*/g, 'gm_pad_choir')
    .replace(/gm_pad_5[_a-z]*/g, 'gm_pad_bowed')
    .replace(/gm_pad_6[_a-z]*/g, 'gm_pad_metallic')
    .replace(/gm_pad_7[_a-z]*/g, 'gm_pad_halo')
    .replace(/gm_pad_8[_a-z]*/g, 'gm_pad_sweep');
}

// Strip a .fnName(...) call with balanced-paren matching (C5).
function stripFnCall(code, fnName) {
  var needle = '.' + fnName;
  var out = '';
  var i = 0;
  while (i < code.length) {
    if (code.charCodeAt(i) === 46 && code.substr(i, needle.length) === needle) {
      var afterDot = i + needle.length;
      var j = afterDot;
      while (j < code.length && (code[j] === ' ' || code[j] === '\t')) j++;
      if (code[j] === '(') {
        var depth = 1;
        j++;
        while (j < code.length && depth > 0) {
          var ch = code[j];
          if (ch === '(') depth++;
          else if (ch === ')') depth--;
          j++;
        }
        if (depth === 0) {
          i = j;
          continue;
        }
      }
    }
    out += code[i];
    i++;
  }
  return out;
}

// Returns true if `name` only occurs inside double-quoted mini-notation strings
// (so commenting out lines containing it would wrongly disable patterns).
function nameOnlyInsideStrings(line, name) {
  var stripped = line.replace(/"[^"]*"/g, '""');
  return stripped.indexOf(name) === -1;
}

// ---- Dynamic error recovery: parse error → fix → retry ----
function tryFixFromError(code, errorMsg) {
  // "X is not defined" → known substitutions or remove the call
  var notDefined = errorMsg.match(/(\w+) is not defined/);
  if (notDefined) {
    var name = notDefined[1];
    if (/^set[Bb][Pp][Mm]$/.test(name)) {
      return code.replace(/set[Bb][Pp][Mm]\s*\(\s*([^)]+)\)/g, function(m, inner) {
        return 'setcpm(' + (inner.trim().indexOf('/4') !== -1 ? inner.trim() : inner.trim() + '/4') + ')';
      });
    }
    if (name === 'line' || name === 'ramp') {
      return code.replace(new RegExp('\\b' + name + '\\s*\\(\\s*([^,]+),\\s*([^,]+),\\s*([^)]+)\\)', 'g'), 'saw.range($1,$2).slow($3)');
    }
    return code.split('\n').map(function(l) {
      if (l.trim().indexOf('//') === 0) return l;
      if (l.indexOf(name) === -1) return l;
      if (nameOnlyInsideStrings(l, name)) return l;
      return '// [auto-disabled: ' + name + ' not defined] ' + l;
    }).join('\n');
  }

  // "X is not a function" → known substitutions or strip the .X(...) call entirely
  var notFunc = errorMsg.match(/(\w+) is not a function/);
  if (notFunc) {
    var fn = notFunc[1];
    var subs = { stutter: 'ply', fadeIn: 'gain', fadeOut: 'gain', after: 'late' };
    if (subs[fn]) {
      return code.replace(new RegExp('\\.' + fn + '\\s*\\(', 'g'), '.' + subs[fn] + '(');
    }
    return stripFnCall(code, fn);
  }

  // "parse error at line N" → try () → [] fix in mini-notation
  var parseErr = errorMsg.match(/parse error/i);
  if (parseErr) {
    return code.replace(/"([^"]*)"/g, function(match, inner) {
      return '"' + inner.replace(/\(([^)]*[~a-gA-G][^)]*)\)/g, '[$1]') + '"';
    });
  }

  return null; // no fix found
}

function stripFences(code) {
  return code.replace(/^```[\w]*\n?/gm, '').replace(/\n?```$/gm, '').trim();
}

// ---- Editor Integration (sandboxed iframe + postMessage RPC) ----
// All Strudel evaluation runs inside <iframe id="strudelFrame"> on an opaque
// origin (sandbox without allow-same-origin). T1 of the security plan: eval'd
// patterns can no longer read the parent's localStorage or window.name.
//
// Protocol:
//   parent -> iframe: {type:'rpc', id, cmd, payload}
//   iframe -> parent: {type:'rpc-result', id, ok, result|error}
//   iframe -> parent: {type:'event', name:'ready'|'evalError', detail}

/** @type {HTMLIFrameElement | null} */
var iframeEl = /** @type {any} */ (document.getElementById('strudelFrame'));

/** @type {Map<string, {resolve:Function, reject:Function, timer:any}>} */
var _pendingRpc = new Map();
var _readyQueue = [];
var _iframeReady = false;
var _rpcSeq = 0;
var _lastEvaluatedCode = '';
var _fixAttempt = 0;
var MAX_FIX_ATTEMPTS = 3;

function _setStatus(cls, text) {
  var s = $('status');
  if (!s) return;
  s.className = cls;
  s.textContent = text;
}

function iframeRpc(cmd, payload, timeoutMs) {
  if (timeoutMs == null) timeoutMs = 5000;
  return new Promise(function (resolve, reject) {
    var id = String(++_rpcSeq);
    function dispatch() {
      if (!iframeEl || !iframeEl.contentWindow) {
        reject(new Error('iframe not available'));
        return;
      }
      var timer = setTimeout(function () {
        _pendingRpc.delete(id);
        reject(new Error('RPC timeout: ' + cmd));
      }, timeoutMs);
      _pendingRpc.set(id, { resolve: resolve, reject: reject, timer: timer });
      try {
        iframeEl.contentWindow.postMessage(
          { type: 'rpc', id: id, cmd: cmd, payload: payload },
          '*'
        );
      } catch (e) {
        clearTimeout(timer);
        _pendingRpc.delete(id);
        reject(e);
      }
    }
    if (_iframeReady) dispatch();
    else _readyQueue.push(dispatch);
  });
}

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('message', function (event) {
    if (!iframeEl || event.source !== iframeEl.contentWindow) return;
    // Sandboxed-iframe origin is opaque — reported as the literal 'null' (or '' on some engines).
    if (event.origin !== 'null' && event.origin !== '') return;
    var msg = event.data || {};
    if (msg.type === 'event' && msg.name === 'ready') {
      if (msg.detail && msg.detail.error) {
        _setStatus('status error', 'Editor failed to initialize');
        return;
      }
      _iframeReady = true;
      var queue = _readyQueue.splice(0);
      queue.forEach(function (fn) { try { fn(); } catch (_) {} });
      return;
    }
    if (msg.type === 'event' && msg.name === 'evalError') {
      handleEvalError(msg.detail);
      return;
    }
    if (msg.type === 'rpc-result') {
      var p = _pendingRpc.get(msg.id);
      if (!p) return;
      clearTimeout(p.timer);
      _pendingRpc.delete(msg.id);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error || 'rpc error'));
    }
  });
}

if (iframeEl && typeof iframeEl.addEventListener === 'function') {
  iframeEl.addEventListener('error', function () {
    _setStatus('status error', 'Editor failed to load (network)');
  });
}
// Only schedule the 15s ready timeout when running in a real browser
// (iframeEl.contentWindow exists). The unit-test vm stub returns a fake element
// without contentWindow; scheduling a 15s timer there would keep node:test alive.
if (iframeEl && iframeEl.contentWindow) {
  var _readyTimer = /** @type {any} */ (setTimeout(function () {
    if (!_iframeReady) _setStatus('status error', 'Editor failed to initialize');
  }, 15000));
  if (_readyTimer && typeof _readyTimer.unref === 'function') _readyTimer.unref();
}

async function setCodeAndPlay(code) {
  code = normalize(code);
  var statusEl = $('status');
  var btn = $('playBtn');
  if (btn) btn.disabled = true;
  if (statusEl) {
    statusEl.className = 'status';
    statusEl.textContent = 'Loading editor...';
  }
  _lastEvaluatedCode = code;
  _fixAttempt = 0;
  try {
    await iframeRpc('setCode', { code: code });
    if (statusEl) statusEl.textContent = 'Evaluating...';
    await iframeRpc('evaluate');
    setTimeout(function () {
      if (!statusEl) return;
      var txt = statusEl.textContent || '';
      // Don't overwrite an Error/fixing status that handleEvalError set in the meantime.
      if (statusEl.className.indexOf('error') === -1 && txt.indexOf('fixing') === -1) {
        statusEl.className = 'status playing';
        statusEl.textContent = _fixAttempt > 0 ? ('Playing (fixed ' + _fixAttempt + 'x)') : 'Playing';
      }
    }, 600);
  } catch (e) {
    if (statusEl) {
      statusEl.className = 'status error';
      statusEl.textContent = 'Editor not responding';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function handleEvalError(detail) {
  var errMsg = (detail && detail.message) || 'unknown';
  var statusEl = $('status');
  if (_fixAttempt >= MAX_FIX_ATTEMPTS) {
    if (statusEl) {
      statusEl.className = 'status error';
      statusEl.textContent = 'Error: ' + errMsg.substring(0, 100);
    }
    return;
  }
  _fixAttempt++;
  if (statusEl) {
    statusEl.className = 'status error';
    statusEl.textContent = 'Error: ' + errMsg.substring(0, 80) + ' — fixing...';
  }

  var apiKey = getApiKey();
  var next = null;
  if (apiKey) {
    try { next = await fixWithLLM(_lastEvaluatedCode, errMsg, apiKey); } catch (_) { next = null; }
  }
  if (!next) {
    next = tryFixFromError(_lastEvaluatedCode, errMsg);
  }
  if (next && next !== _lastEvaluatedCode) {
    _lastEvaluatedCode = normalize(next);
    try {
      await iframeRpc('setCode', { code: _lastEvaluatedCode });
      await iframeRpc('evaluate');
    } catch (_) {
      if (statusEl) {
        statusEl.className = 'status error';
        statusEl.textContent = 'Editor not responding';
      }
    }
  } else if (statusEl) {
    statusEl.className = 'status error';
    statusEl.textContent = 'Error: ' + errMsg.substring(0, 100);
  }
}

async function fixWithLLM(code, errorMsg, apiKey) {
  var prompt = 'This Strudel code has an error:\n\n' + code + '\n\nError: ' + errorMsg + '\n\nFix ONLY the error. Return the complete fixed code. No explanation.';
  var fixSystem = 'You fix Strudel live-coding errors. Output ONLY the fixed code, no explanation.';
  try {
    var r = await callLLM({
      provider: getProvider(), apiKey: apiKey,
      system: fixSystem, user: prompt,
      temperature: getProvider() === 'gemini' ? 1.0 : 0.2,
      maxTokens: 2048,
      channel: 'fix',
    });
    return stripFences(r.text);
  } catch (e) {
    return null;
  }
}

async function stopPlayback() {
  cancelInflight('generate');
  cancelInflight('refine');
  cancelInflight('edit');
  cancelInflight('fix');
  try { await iframeRpc('stop'); } catch (_) {}
  _setStatus('status', 'Stopped');
}

// ---- UI Wiring ----
var selectedGenre = 'edm';
var fusionMode = false;
var fusionGenres = [];
var lastInput = '';

var genreBtns = /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.genre-btn'));
var fusionCheck = /** @type {HTMLInputElement} */ ($('fusionCheck'));

function updateGenreUI() {
  genreBtns.forEach(function(b) {
    if (fusionMode) {
      b.classList.remove('active');
      if (fusionGenres.indexOf(b.dataset.genre) !== -1) {
        b.classList.add('fusion-pick');
      } else {
        b.classList.remove('fusion-pick');
      }
    } else {
      b.classList.remove('fusion-pick');
      b.classList.toggle('active', b.dataset.genre === selectedGenre);
    }
  });
}

// Fusion checkbox toggle
fusionCheck.addEventListener('change', function() {
  fusionMode = fusionCheck.checked;
  if (fusionMode) {
    fusionGenres = [];
  } else {
    selectedGenre = fusionGenres[0] || selectedGenre || 'edm';
    fusionGenres = [];
  }
  seedCounter = 0;
  updateGenreUI();
});

// Genre buttons
genreBtns.forEach(function(btn) {
  btn.addEventListener('click', function() {
    var genre = btn.dataset.genre;

    if (genre === 'random') {
      fusionMode = false;
      fusionCheck.checked = false;
      fusionGenres = [];
      selectedGenre = 'random';
    } else if (fusionMode) {
      var idx = fusionGenres.indexOf(genre);
      if (idx !== -1) fusionGenres.splice(idx, 1);
      else fusionGenres.push(genre);
    } else {
      selectedGenre = genre;
    }

    seedCounter = 0;
    updateGenreUI();
  });
});

function getEffectiveGenre() {
  if (fusionMode && fusionGenres.length >= 2) return 'fusion:' + fusionGenres.join('+');
  if (fusionMode && fusionGenres.length === 1) return fusionGenres[0];
  return selectedGenre;
}

async function doGenerate() {
  var text = $('input').value.trim();
  var statusEl = $('status');
  if (!text) {
    statusEl.className = 'status error';
    statusEl.textContent = 'Type something first';
    return;
  }

  if (text !== lastInput) { seedCounter = 0; lastInput = text; }

  var genre = getEffectiveGenre();
  var apiKey = getApiKey();
  var ew = $('editorWrap');
  ew.classList.remove('hidden');
  ew.classList.add('visible');
  if (apiKey) {
    $('editRow').style.display = 'flex';
  } else {
    $('algoMixer').style.display = 'flex';
  }

  cancelInflight('generate');

  if (apiKey) {
    var playBtn = $('playBtn'), regenBtn = $('regenBtn');
    playBtn.disabled = true;
    regenBtn.disabled = true;
    statusEl.className = 'status';
    var prov = getProvider();
    var temp = prov === 'gemini' ? Math.min(1.5, 0.9 + seedCounter * 0.08) : Math.min(1.2, 0.9 + seedCounter * 0.05);
    statusEl.textContent = (prov === 'gemini' ? 'Gemini' : prov === 'openai' ? 'OpenAI' : 'Claude') + ' is composing... (seed ' + seedCounter + ', temp ' + temp.toFixed(2) + ')';
    try {
      var aiCode = await generateWithAI(text, genre, apiKey);
      setCodeAndPlay(aiCode);
    } catch (e) {
      if (isAbortError(e)) {
        statusEl.className = 'status';
        statusEl.textContent = 'Cancelled.';
      } else {
        statusEl.className = 'status error';
        statusEl.textContent = 'API error: ' + e.message + ' — falling back to algorithm';
        var fallback = generateCode(text, genre);
        setCodeAndPlay(fallback);
      }
    } finally {
      playBtn.disabled = false;
      regenBtn.disabled = false;
      _inflight.generate = null;
    }
  } else {
    statusEl.textContent = 'Algorithmic mode (seed ' + seedCounter + ')';
    var code = generateCode(text, genre);
    setCodeAndPlay(code);
  }
}

$('playBtn').addEventListener('click', function() {
  seedCounter = 0;
  doGenerate();
});

$('regenBtn').addEventListener('click', function() {
  seedCounter++;
  doGenerate();
});

$('runBtn').addEventListener('click', async function() {
  try {
    var current = await iframeRpc('getCode');
    _lastEvaluatedCode = normalize(current || '');
    _fixAttempt = 0;
    await iframeRpc('evaluate');
    _setStatus('status playing', 'Playing');
  } catch (e) {
    _setStatus('status error', 'Editor not responding');
  }
});

$('stopBtn').addEventListener('click', stopPlayback);

// ---- Verify state with TTL (timestamp-based, expires after NET.VERIFY_TTL_MS) ----
function verifyTsKey(p) { return 'tts_verified_at_' + p; }
function isVerified(prov) {
  var ts = parseInt(localStorage.getItem(verifyTsKey(prov)) || '0', 10);
  if (!ts) return false;
  return (Date.now() - ts) < NET.VERIFY_TTL_MS;
}
function setVerified(prov, v) {
  if (v) localStorage.setItem(verifyTsKey(prov), String(Date.now()));
  else localStorage.removeItem(verifyTsKey(prov));
  localStorage.removeItem('tts_verified_' + prov);
}
function invalidateVerified(prov) {
  setVerified(prov, false);
  document.dispatchEvent(new CustomEvent('tts:verify-invalidated', { detail: { provider: prov } }));
}

// ---- API Key UI ----
(function() {
  var keyInput = $('apiKey');
  var provSelect = $('apiProvider');
  var hint = $('apiHint');
  var apiDetails = $('apiSettings');
  var persistCb = $('apiPersist');
  var apiModeEl = $('apiMode');

  var SESSION_COPY = '<strong>Session only.</strong> Key held in volatile tab memory, split between <code>window.name</code> and <code>sessionStorage</code>. Resists casual disk inspection (browser session-restore files). Cleared when you close this tab.';
  var PERSIST_COPY = '<strong>Persisted on disk.</strong> Key written to browser <code>localStorage</code> in plaintext. Readable from DevTools, browser extensions, and anyone with access to this device or browser profile. Use only on a trusted personal device.';

  function updatePersistMode() {
    if (!apiModeEl || !persistCb) return;
    var mode = persistCb.checked ? 'persist' : 'session';
    apiModeEl.setAttribute('data-mode', mode);
    apiModeEl.innerHTML = mode === 'persist' ? PERSIST_COPY : SESSION_COPY;
  }

  function setApiState(state) {
    apiDetails.classList.remove('verified', 'invalid', 'no-key');
    apiDetails.classList.add(state);
  }

  function refreshProviderUI() {
    var prov = provSelect.value;
    keyInput.placeholder = prov === 'gemini' ? 'AIza...' : prov === 'openai' ? 'sk-...' : 'sk-ant-...';
    var key = getApiKey(prov);
    keyInput.value = key;
    if (persistCb) persistCb.checked = getApiKeyPersist(prov);
    updatePersistMode();
    if (key && isVerified(prov)) {
      hint.textContent = (prov === 'gemini' ? 'Gemini' : prov === 'openai' ? 'OpenAI' : 'Claude') + ' creative mode active.';
      hint.className = 'api-hint saved';
      setApiState('verified');
    } else if (key) {
      hint.textContent = 'Key saved but not verified. Press Save to verify.';
      hint.className = 'api-hint';
      setApiState('no-key');
    } else {
      hint.textContent = 'No key. Algorithmic mode.';
      hint.className = 'api-hint';
      setApiState('no-key');
    }
  }

  provSelect.value = getProvider();
  refreshProviderUI();

  provSelect.addEventListener('change', function() {
    saveProvider(provSelect.value);
    refreshProviderUI();
  });

  async function doSaveKey() {
    var key = keyInput.value.trim();
    var prov = provSelect.value;
    var persist = persistCb ? !!persistCb.checked : false;

    if (!key) {
      saveApiKey('', prov);
      setVerified(prov, false);
      saveProvider(prov);
      hint.textContent = 'Cleared. Algorithmic mode.';
      hint.className = 'api-hint';
      setApiState('no-key');
      return;
    }

    hint.textContent = 'Verifying...';
    hint.className = 'api-hint';

    try {
      var resp, data;
      if (prov === 'gemini') {
        resp = await fetchWithTimeout(
          'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key),
          {}, NET.VERIFY_TIMEOUT_MS, 'verify');
        data = await resp.json().catch(function() { return null; });
        if (resp.status === 401 || resp.status === 403) throw new Error('Invalid API key (HTTP ' + resp.status + ')');
        if (resp.status === 429) throw new Error('Rate limited — try again later (HTTP 429)');
        if (!resp.ok || (data && data.error)) {
          throw new Error((data && data.error && data.error.message) || ('HTTP ' + resp.status));
        }
      } else if (prov === 'openai') {
        resp = await fetchWithTimeout('https://api.openai.com/v1/models', {
          headers: { 'Authorization': 'Bearer ' + key },
        }, NET.VERIFY_TIMEOUT_MS, 'verify');
        data = await resp.json().catch(function() { return null; });
        if (resp.status === 401 || resp.status === 403) throw new Error('Invalid API key (HTTP ' + resp.status + ')');
        if (resp.status === 429) throw new Error('Rate limited — try again later (HTTP 429)');
        if (!resp.ok || (data && data.error)) {
          throw new Error((data && data.error && data.error.message) || ('HTTP ' + resp.status));
        }
      } else {
        resp = await fetchWithTimeout('https://api.anthropic.com/v1/models', {
          method: 'GET',
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
        }, NET.VERIFY_TIMEOUT_MS, 'verify');
        data = await resp.json().catch(function() { return null; });
        if (resp.status === 401 || resp.status === 403) throw new Error('Invalid API key (HTTP ' + resp.status + ')');
        if (resp.status === 429) throw new Error('Rate limited — try again later (HTTP 429)');
        if (!resp.ok) throw new Error('Anthropic transient error: HTTP ' + resp.status);
        if (!data || !Array.isArray(data.data)) throw new Error('Anthropic: malformed /v1/models response');
      }

      saveApiKey(key, prov, persist);
      setVerified(prov, true);
      saveProvider(prov);
      hint.textContent = (prov === 'gemini' ? 'Gemini' : prov === 'openai' ? 'OpenAI' : 'Claude') + ' verified' + (persist ? ' (persisted)' : ' (this session only)') + '.';
      hint.className = 'api-hint saved';
      setApiState('verified');
    } catch (e) {
      setVerified(prov, false);
      var msg = isAbortError(e) ? 'Verify timed out' : ('Invalid: ' + e.message);
      hint.textContent = msg;
      hint.className = 'api-hint error';
      setApiState('invalid');
    } finally {
      _inflight.verify = null;
    }
  }

  $('apiSave').addEventListener('click', doSaveKey);

  if (persistCb) {
    persistCb.addEventListener('change', function() {
      if (persistCb.checked && localStorage.getItem('tts_persist_acknowledged') !== '1') {
        var ok = window.confirm(
          'Persist API key on this device?\n\n' +
          'The key will be written to browser localStorage in plaintext.\n' +
          'Anyone with access to this device or browser profile can read it.\n\n' +
          'Click OK only if you trust this device.'
        );
        if (!ok) {
          persistCb.checked = false;
          updatePersistMode();
          return;
        }
        try { localStorage.setItem('tts_persist_acknowledged', '1'); } catch (_) {}
      }
      var prov = provSelect.value;
      var key = getApiKey(prov);
      if (key) saveApiKey(key, prov, !!persistCb.checked);
      updatePersistMode();
    });
  }

  keyInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); doSaveKey(); }
  });

  document.addEventListener('click', function(e) {
    if (apiDetails.open && !apiDetails.contains(e.target)) {
      apiDetails.open = false;
    }
  });

  document.addEventListener('tts:verify-invalidated', function() { refreshProviderUI(); });
})();

// ---- Algorithmic Refine: table-driven (Q24). Each entry is a code -> code transform. ----
var REFINERS = (function() {
  function setcpm(code, delta) {
    return code.replace(/setcpm\s*\(\s*(\d+)\s*\/\s*4\s*\)/, function(m, bpm) {
      var v = parseInt(bpm) + delta;
      v = Math.max(TUNING.BPM.min, Math.min(TUNING.BPM.max, v));
      return 'setcpm(' + v + '/4)';
    });
  }
  function scaleGain(code, factor) {
    return code.replace(/\.gain\s*\(\s*([\d.]+)\s*\)/g, function(m, g) {
      var v = parseFloat(g) * factor;
      v = Math.max(TUNING.GAIN.min, Math.min(TUNING.GAIN.max, v));
      return '.gain(' + v.toFixed(2) + ')';
    });
  }
  function scaleLpf(code, factor) {
    return code.replace(/\.lpf\s*\(\s*(\d+)\s*\)/g, function(m, f) {
      var v = Math.round(parseInt(f) * factor);
      v = Math.max(TUNING.FILTER.min, Math.min(TUNING.FILTER.max, v));
      return '.lpf(' + v + ')';
    });
  }
  function shiftRoom(code, delta) {
    return code.replace(/\.room\s*\(\s*([\d.]+)\s*\)/g, function(m, r) {
      var v = parseFloat(r) + delta;
      v = Math.max(0, Math.min(1, v));
      return '.room(' + v.toFixed(2) + ')';
    });
  }
  function shiftOctave(code, delta) {
    return code.replace(/\.scale\s*\(\s*"(\w+)(\d+):([^"]+)"\s*\)/g, function(m, key, oct, sc) {
      var v = Math.max(1, Math.min(7, parseInt(oct) + delta));
      return '.scale("' + key + v + ':' + sc + '")';
    });
  }
  function shiftDensity(code, delta) {
    return code.replace(/\.struct\s*\(\s*"x\((\d+),(\d+)/g, function(m, k, n) {
      var ki = parseInt(k), ni = parseInt(n);
      var v = delta > 0 ? Math.min(ni, ki + 1) : Math.max(1, ki - 1);
      return '.struct("x(' + v + ',' + n;
    });
  }
  function setScale(name) {
    return function(code) {
      return code.replace(/(\.scale\s*\(\s*"\w+\d+:)[^"]+/g, '$1' + name);
    };
  }
  function shiftLpq(code, delta) {
    return code.replace(/\.lpq\s*\(\s*([\d.]+)\s*\)/g, function(m, q) {
      var v = Math.max(0, Math.min(50, parseFloat(q) + delta));
      return '.lpq(' + v.toFixed(0) + ')';
    });
  }
  function scaleHpf(code, factor) {
    return code.replace(/\.hpf\s*\(\s*(\d+)\s*\)/g, function(m, f) {
      var v = Math.max(20, Math.min(8000, Math.round(parseInt(f) * factor)));
      return '.hpf(' + v + ')';
    });
  }
  function shiftDelay(code, delta) {
    return code.replace(/\.delay\s*\(\s*([\d.]+)\s*\)/g, function(m, d) {
      var v = Math.max(0, Math.min(1, parseFloat(d) + delta));
      return '.delay(' + v.toFixed(2) + ')';
    });
  }
  function shiftDelayFb(code, delta) {
    return code.replace(/\.delayfeedback\s*\(\s*([\d.]+)\s*\)/g, function(m, f) {
      var v = Math.max(0, Math.min(0.95, parseFloat(f) + delta));
      return '.delayfeedback(' + v.toFixed(2) + ')';
    });
  }
  function shiftShape(code, delta) {
    return code.replace(/\.shape\s*\(\s*([\d.]+)\s*\)/g, function(m, s) {
      var v = Math.max(0, Math.min(1, parseFloat(s) + delta));
      return '.shape(' + v.toFixed(2) + ')';
    });
  }
  function shiftCrush(code, delta) {
    return code.replace(/\.crush\s*\(\s*(\d+)\s*\)/g, function(m, c) {
      var v = Math.max(1, Math.min(16, parseInt(c) + delta));
      return '.crush(' + v + ')';
    });
  }
  return {
    'faster':         function(c) { return setcpm(c, +TUNING.BPM.step); },
    'slower':         function(c) { return setcpm(c, -TUNING.BPM.step); },
    'louder':         function(c) { return scaleGain(c, 1.15); },
    'quieter':        function(c) { return scaleGain(c, 0.85); },
    'brighter':       function(c) { return scaleLpf(c, 1.4); },
    'darker':         function(c) { return scaleLpf(c, 0.6); },
    'more reverb':    function(c) { return shiftRoom(c, +TUNING.REVERB_STEP); },
    'drier':          function(c) { return shiftRoom(c, -TUNING.REVERB_STEP); },
    'higher':         function(c) { return shiftOctave(c, +1); },
    'lower':          function(c) { return shiftOctave(c, -1); },
    'denser':         function(c) { return shiftDensity(c, +1); },
    'sparser':        function(c) { return shiftDensity(c, -1); },
    'scale:major':       setScale('major'),
    'scale:minor':       setScale('minor'),
    'scale:dorian':      setScale('dorian'),
    'scale:phrygian':    setScale('phrygian'),
    'scale:lydian':      setScale('lydian'),
    'scale:pentatonic':  setScale('minor:pentatonic'),
    'more resonance': function(c) { return shiftLpq(c, +2); },
    'less resonance': function(c) { return shiftLpq(c, -2); },
    'more highpass':  function(c) { return scaleHpf(c, 1.3); },
    'less highpass':  function(c) { return scaleHpf(c, 0.7); },
    'more delay':     function(c) { return shiftDelay(c, +0.15); },
    'less delay':     function(c) { return shiftDelay(c, -0.15); },
    'more feedback':  function(c) { return shiftDelayFb(c, +0.1); },
    'less feedback':  function(c) { return shiftDelayFb(c, -0.1); },
    'more distortion': function(c) { return shiftShape(c, +0.15); },
    'less distortion': function(c) { return shiftShape(c, -0.15); },
    'more crush':     function(c) { return shiftCrush(c, -1); },
    'less crush':     function(c) { return shiftCrush(c, +1); },
    'add swing': function(c) {
      if (c.indexOf('.swing(') !== -1) return c;
      return c.replace(/(\.bank\s*\([^)]*\))/, '$1.swing(0.15)');
    },
    'straighten':     function(c) { return c.replace(/\.swing\s*\([^)]*\)/g, ''); },
  };
})();

function algoRefine(code, direction) {
  var fn = REFINERS[direction];
  return fn ? fn(code) : code;
}

// ---- Long-press repeat via single delegated handler on the mixer (Q17) ----
(function() {
  var REPEAT_DELAY_MS = 400;
  var REPEAT_INTERVAL_MS = 150;
  var mixer = $('algoMixer');
  if (!mixer) return;
  var timer = null, interval = null, activeBtn = null;
  function isRepeatable(el) {
    return el && el.classList && (el.classList.contains('ch-minus') || el.classList.contains('ch-plus') || el.classList.contains('ch-toggle'));
  }
  function start(btn) {
    activeBtn = btn;
    btn.classList.add('pressing');
    timer = setTimeout(function() {
      interval = setInterval(function() { if (activeBtn) activeBtn.click(); }, REPEAT_INTERVAL_MS);
    }, REPEAT_DELAY_MS);
  }
  function stop() {
    if (activeBtn) activeBtn.classList.remove('pressing');
    clearTimeout(timer); clearInterval(interval);
    timer = null; interval = null; activeBtn = null;
  }
  mixer.addEventListener('mousedown', function(e) {
    var b = e.target.closest && e.target.closest('button');
    if (isRepeatable(b)) start(b);
  });
  mixer.addEventListener('mouseup', stop);
  mixer.addEventListener('mouseleave', stop);
  mixer.addEventListener('touchstart', function(e) {
    var b = e.target.closest && e.target.closest('button');
    if (isRepeatable(b)) { e.preventDefault(); start(b); }
  }, { passive: false });
  mixer.addEventListener('touchend', stop);
  mixer.addEventListener('touchcancel', stop);
})();

// ---- A11y: derive aria-labels for icon-only mixer buttons (Q21) ----
(function() {
  document.querySelectorAll('.mixer-ch').forEach(function(strip) {
    var label = strip.querySelector('.ch-label');
    if (!label) return;
    var name = label.textContent.trim();
    strip.querySelectorAll('button').forEach(function(b) {
      if (b.hasAttribute('aria-label')) return;
      var op = b.textContent.trim();
      var verbose = op === '+' ? ('increase ' + name)
                  : op === '-' ? ('decrease ' + name)
                  : (name + ' ' + op);
      b.setAttribute('aria-label', verbose);
    });
  });
  document.querySelectorAll('.ch-tag, .ch-mood').forEach(function(b) {
    var hb = /** @type {HTMLElement} */ (b);
    if (!hb.hasAttribute('aria-label') && hb.dataset.dir) {
      hb.setAttribute('aria-label', hb.dataset.dir);
    }
  });
})();

document.querySelectorAll('.refine-btn').forEach(function(btn) {
  var hbtn = /** @type {HTMLButtonElement} */ (btn);
  hbtn.addEventListener('click', async function() {
    var direction = hbtn.dataset.dir || '';
    var currentCode = '';
    try { currentCode = (await iframeRpc('getCode')) || ''; } catch (_) { return; }
    if (!currentCode.trim()) return;

      // Tone buttons: highlight active
    if (direction.indexOf('scale:') === 0) {
      document.querySelectorAll('.ch-tag').forEach(function(t) { t.classList.remove('active'); });
      hbtn.classList.add('active');
    }

    // ± mixer buttons ALWAYS use algorithm (instant, no API cost)
    // Only mood buttons ("make it...") use LLM when API key is available
    var isMoodDirection = direction.indexOf('make it') === 0;
    var apiKey = getApiKey();
    var useLLM = apiKey && isMoodDirection;

    if (!useLLM) {
      // algorithmic refine
      var result;
      if (isMoodDirection) {
        result = currentCode;
        if (direction.indexOf('dark') !== -1 || direction.indexOf('moodi') !== -1) {
          result = algoRefine(algoRefine(algoRefine(result, 'slower'), 'darker'), 'more reverb');
        } else if (direction.indexOf('euphoric') !== -1 || direction.indexOf('uplift') !== -1) {
          result = algoRefine(algoRefine(algoRefine(result, 'faster'), 'brighter'), 'louder');
        } else if (direction.indexOf('dreamy') !== -1 || direction.indexOf('float') !== -1) {
          result = algoRefine(algoRefine(algoRefine(result, 'slower'), 'darker'), 'more reverb');
          result = algoRefine(result, 'more reverb');
        } else if (direction.indexOf('aggressive') !== -1 || direction.indexOf('intense') !== -1) {
          result = algoRefine(algoRefine(algoRefine(result, 'faster'), 'brighter'), 'louder');
        }
      } else {
        result = algoRefine(currentCode, direction);
      }
      var changed = result !== currentCode;
      hbtn.classList.add(changed ? 'flash-ok' : 'flash-fail');
      setTimeout(function() { hbtn.classList.remove('flash-ok', 'flash-fail'); }, 300);
      if (changed) {
        _lastEvaluatedCode = normalize(result);
        _fixAttempt = 0;
        try {
          await iframeRpc('setCode', { code: _lastEvaluatedCode });
          await iframeRpc('evaluate');
        } catch (_) {}
      }
      return;
    }

    var statusEl = $('status');
    statusEl.className = 'status';
    statusEl.textContent = 'Refining: ' + direction + '...';
    document.querySelectorAll('.refine-btn').forEach(function(b) { /** @type {HTMLButtonElement} */ (b).disabled = true; });

    try {
      var refinePrompt = 'Here is the current Strudel code:\n\n' + currentCode + '\n\nModify this code to make it ' + direction + '. Keep the overall structure and concept. Change only what is needed for the requested direction. Return the complete modified code.';
      var refineProv = getProvider();
      var r = await callLLM({
        provider: refineProv, apiKey: apiKey,
        system: STRUDEL_SYSTEM_PROMPT, user: refinePrompt,
        temperature: refineProv === 'gemini' ? 1.0 : 0.7,
        maxTokens: 2048,
        channel: 'refine',
      });
      var code = stripFences(r.text);
      setCodeAndPlay(code);
    } catch (e) {
      if (isAbortError(e)) {
        statusEl.className = 'status';
        statusEl.textContent = 'Refine cancelled.';
      } else {
        statusEl.className = 'status error';
        statusEl.textContent = 'Refine error: ' + e.message;
      }
    } finally {
      document.querySelectorAll('.refine-btn').forEach(function(b) { /** @type {HTMLButtonElement} */ (b).disabled = false; });
      _inflight.refine = null;
    }
  });
});

$('input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('playBtn').click(); }
});

// ---- Natural Language Edit ----
// Edit system prompt — focused on MINIMAL edits, not rewrites
var EDIT_SYSTEM = 'You are a Strudel live-coding assistant. You receive the current program and a short instruction. Return a minimal modification that keeps the program runnable while applying the intent.\n\nRules:\n- Preserve unrelated code and comments.\n- Prefer minimal edits over full rewrites.\n- Keep formatting consistent with the original code.\n- Only change what the instruction asks for.\n- Return ONLY the updated program. No explanation, no markdown fences, no JSON wrapping.';

async function doEdit() {
  var editInput = $('editInput');
  var instruction = editInput.value.trim();
  if (!instruction) return;

  var currentCode = '';
  try { currentCode = (await iframeRpc('getCode')) || ''; } catch (_) { return; }
  if (!currentCode.trim()) return;

  var apiKey = getApiKey();
  var statusEl = $('status');
  var applyBtn = $('editApply');

  if (!apiKey) {
    statusEl.className = 'status error';
    statusEl.textContent = 'Natural language edit requires an API key.';
    return;
  }

  applyBtn.disabled = true;
  statusEl.className = 'status';
  statusEl.textContent = 'Editing: ' + instruction.substring(0, 50) + '...';

  try {
    var editPrompt = 'Current Strudel program:\n\n' + currentCode + '\n\nInstruction:\n' + instruction;
    var prov = getProvider();
    var r = await callLLM({
      provider: prov, apiKey: apiKey,
      system: EDIT_SYSTEM, user: editPrompt,
      temperature: prov === 'gemini' ? 1.0 : 0.2,
      maxTokens: 2048,
      channel: 'edit',
    });
    var code = stripFences(r.text);

    if (!code || !code.trim()) throw new Error('Empty response');
    editInput.value = '';
    setCodeAndPlay(code);
  } catch (e) {
    if (isAbortError(e)) {
      statusEl.className = 'status';
      statusEl.textContent = 'Edit cancelled.';
    } else {
      statusEl.className = 'status error';
      statusEl.textContent = 'Edit error: ' + e.message;
    }
  } finally {
    applyBtn.disabled = false;
    _inflight.edit = null;
  }
}

$('editApply').addEventListener('click', doEdit);

$('mixerToggle').addEventListener('click', function() {
  var mixer = $('algoMixer');
  var btn = $('mixerToggle');
  var visible = mixer.style.display === 'flex';
  mixer.style.display = visible ? 'none' : 'flex';
  btn.classList.toggle('active', !visible);
});
$('editInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { e.preventDefault(); doEdit(); }
});
