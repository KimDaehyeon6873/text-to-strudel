// =====================================================
//  text-to-strudel - Text-to-Music Generator
//  Analyzes text qualities (energy, brightness, weight,
//  space, complexity, valence, tension) and maps them to
//  genre-appropriate musical parameters. The same input,
//  genre, and variation state produce the same output.
// =====================================================

// ---- Variation state (independent musical dimensions) ----
var seedCounter = 0;
var variationState = { harmony: 0, melody: 0, groove: 0, arrangement: 0 };
var lastVariationFocus = 'base';
var lastCompositionPlan = null;

function resetVariationState() {
  variationState = { harmony: 0, melody: 0, groove: 0, arrangement: 0 };
  lastVariationFocus = 'base';
}

function advanceVariation(focus) {
  seedCounter++;
  lastVariationFocus = focus || 'all';
  if (focus === 'melody' || focus === 'groove' || focus === 'arrangement') {
    variationState[focus]++;
    return;
  }
  variationState.harmony++;
  variationState.melody++;
  variationState.groove++;
  variationState.arrangement++;
}

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

var TEXT_MOOD_WORDS = {
  bright: ['sun', 'light', 'gold', 'summer', 'smile', 'joy', 'hope', 'love', 'dance', '햇살', '빛', '여름', '미소', '기쁨', '희망', '사랑', '설렘'],
  dark: ['night', 'shadow', 'rain', 'grief', 'lonely', 'cold', 'empty', 'winter', '밤', '그림자', '비', '슬픔', '외로', '차가', '공허', '겨울'],
  intense: ['fire', 'rage', 'thunder', 'storm', 'run', 'rush', 'explode', 'fight', '불', '분노', '번개', '폭풍', '달려', '질주', '폭발', '격렬'],
  calm: ['quiet', 'still', 'sleep', 'breathe', 'soft', 'peace', 'slow', '고요', '평온', '잠', '숨', '부드', '잔잔', '느리'],
  heavy: ['stone', 'iron', 'gravity', 'deep', 'burden', '돌', '철', '중력', '깊', '무거', '짐'],
  airy: ['cloud', 'sky', 'wind', 'float', 'open', '구름', '하늘', '바람', '떠', '넓'],
};

function countMoodWords(text, words) {
  return words.reduce(function(total, word) {
    return total + (text.indexOf(word) !== -1 ? 1 : 0);
  }, 0);
}

function analyzeText(text) {
  var normalized = (text || '').normalize('NFKC').trim();
  if (!normalized) {
    return { energy: 0.5, brightness: 0.5, weight: 0.5, space: 0.3, complexity: 0.5, valence: 0.5, tension: 0.5 };
  }

  var lower = normalized.toLowerCase();
  var glyphs = Array.from(lower);
  var chars = glyphs.filter(function(ch) { return /[\p{L}\p{N}]/u.test(ch); });
  var letters = glyphs.filter(function(ch) { return /\p{L}/u.test(ch); });
  var latinLetters = lower.match(/[a-z]/g) || [];
  var latinVowels = lower.match(/[aeiou]/g) || [];
  var words = normalized.split(/\s+/).filter(Boolean);
  var uniqueChars = new Set(chars).size;
  var avgWordLen = words.reduce(function(sum, word) { return sum + Array.from(word).length; }, 0) / Math.max(1, words.length);
  var punctuation = (normalized.match(/[!?.,:;\-()[\]…]/g) || []).length;
  var uppercase = (normalized.match(/[A-Z]/g) || []).length;

  var brightWords = countMoodWords(lower, TEXT_MOOD_WORDS.bright);
  var darkWords = countMoodWords(lower, TEXT_MOOD_WORDS.dark);
  var intenseWords = countMoodWords(lower, TEXT_MOOD_WORDS.intense);
  var calmWords = countMoodWords(lower, TEXT_MOOD_WORDS.calm);
  var heavyWords = countMoodWords(lower, TEXT_MOOD_WORDS.heavy);
  var airyWords = countMoodWords(lower, TEXT_MOOD_WORDS.airy);

  var structuralEnergy = clamp(
    Math.min(1, words.length / 10) * 0.35 +
    Math.min(1, uniqueChars / 18) * 0.35 +
    Math.min(1, punctuation / 4) * 0.2 +
    Math.min(1, uppercase / Math.max(1, letters.length) * 5) * 0.1
  );
  var semanticEnergy = clamp(0.45 + intenseWords * 0.28 - calmWords * 0.2);
  var latinBrightness = latinLetters.length ? latinVowels.length / latinLetters.length : 0.5;
  var semanticBrightness = clamp(0.5 + brightWords * 0.18 - darkWords * 0.16);
  var density = chars.length / Math.max(1, glyphs.length);

  return {
    energy: clamp(structuralEnergy * 0.45 + semanticEnergy * 0.55),
    brightness: clamp(latinBrightness * 0.35 + semanticBrightness * 0.65),
    weight: clamp(avgWordLen / 9 + heavyWords * 0.15 - airyWords * 0.1),
    space: clamp((1 - density) * 0.65 + (words.length < 4 ? 0.18 : 0) + calmWords * 0.08 + airyWords * 0.08),
    complexity: clamp((uniqueChars / Math.max(4, chars.length)) * 0.65 + Math.min(1, words.length / 10) * 0.35),
    valence: clamp(0.5 + brightWords * 0.18 - darkWords * 0.16),
    tension: clamp(0.45 + intenseWords * 0.22 + punctuation * 0.04 - calmWords * 0.18),
  };
}

function describeMood(a) {
  var w = [];
  if (a.valence < 0.35) w.push('melancholic');
  else if (a.brightness < 0.35) w.push('dark');
  else if (a.valence > 0.65 || a.brightness > 0.65) w.push('bright');
  else w.push('warm');
  if (a.tension > 0.68) w.push('tense');
  else if (a.energy > 0.65) w.push('driving');
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

// ---- Shared Composition Plan Engine ----
function pickFrom(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function copyVariationState(source) {
  source = source || {};
  return {
    harmony: Number(source.harmony) || 0,
    melody: Number(source.melody) || 0,
    groove: Number(source.groove) || 0,
    arrangement: Number(source.arrangement) || 0,
  };
}

var NOTE_NAMES_SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
var NOTE_NAMES_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
var NOTE_INDEX = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

function transposeNote(note, semitones) {
  var index = NOTE_INDEX[note];
  if (typeof index !== 'number') index = 0;
  var names = note.indexOf('b') !== -1 ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
  return names[(index + semitones % 12 + 12) % 12];
}

function harmonyProfile(name, scale, degrees, brightness, tension, phraseBars, formLength) {
  return {
    name: name,
    scale: scale,
    degrees: degrees,
    brightness: brightness,
    tension: tension,
    harmonicBars: degrees.length,
    phraseBars: phraseBars || (degrees.length === 12 ? 12 : 8),
    formLength: formLength || (degrees.length === 12 ? 24 : 16),
  };
}

var HARMONY_PROFILES = {
  edm: [
    harmonyProfile('midnight lift', 'minor', [[0,'m'],[8,''],[3,''],[10,'']], .35, .55),
    harmonyProfile('dorian ascent', 'dorian', [[0,'m7'],[5,''],[10,''],[7,'m7']], .58, .42),
    harmonyProfile('open-sky release', 'major', [[0,''],[9,'m'],[5,''],[7,'7']], .82, .32),
    harmonyProfile('neon tension', 'phrygian', [[0,'m'],[1,''],[10,''],[7,'dim7']], .22, .82),
  ],
  jazz: [
    harmonyProfile('ii–V–I turnaround', 'major', [[2,'m7'],[7,'7'],[0,'^7'],[9,'7']], .68, .48),
    harmonyProfile('minor turnaround', 'melodic:minor', [[2,'m7b5'],[7,'7alt'],[0,'m9'],[8,'^7']], .34, .72),
    harmonyProfile('modal bridge', 'dorian', [[0,'m9'],[5,'13'],[10,'^7'],[7,'7alt']], .52, .58),
  ],
  classical: [
    harmonyProfile('authentic cadence', 'major', [[0,''],[5,''],[7,'7'],[0,'']], .72, .34),
    harmonyProfile('minor lament', 'harmonic:minor', [[0,'m'],[5,'m'],[7,'7'],[0,'m']], .25, .68),
    harmonyProfile('deceptive cadence', 'minor', [[0,'m'],[5,'m'],[7,'7'],[8,'']], .38, .62),
  ],
  blues: [
    harmonyProfile('twelve-bar shuffle', 'minor:blues', [[0,'7'],[0,'7'],[0,'7'],[0,'7'],[5,'7'],[5,'7'],[0,'7'],[0,'7'],[7,'7'],[5,'7'],[0,'7'],[7,'7']], .42, .58, 12, 24),
    harmonyProfile('twelve-bar slow burn', 'major:blues', [[0,'7'],[0,'7'],[0,'7'],[0,'7'],[5,'9'],[5,'9'],[0,'7'],[0,'7'],[7,'9'],[5,'9'],[0,'7'],[7,'7']], .58, .5, 12, 24),
  ],
  ambient: [
    harmonyProfile('suspended horizon', 'lydian', [[0,'^7'],[2,''],[7,'sus2'],[5,'^7']], .8, .24, 8, 16),
    harmonyProfile('slow orbit', 'dorian', [[0,'m9'],[5,'sus2'],[10,'^7'],[0,'m9']], .48, .32, 8, 16),
    harmonyProfile('distant weather', 'minor:pentatonic', [[0,'m7'],[8,'^7'],[5,'sus2'],[10,'']], .3, .56, 8, 16),
  ],
  lofi: [
    harmonyProfile('worn photograph', 'minor', [[0,'m9'],[8,'^7'],[3,'^7'],[5,'m7']], .38, .42),
    harmonyProfile('sunlit tape', 'major', [[0,'^7'],[4,'m7'],[9,'m7'],[5,'^7']], .74, .28),
    harmonyProfile('rainy window', 'dorian', [[0,'m7'],[5,'9'],[10,'^7'],[7,'m7']], .48, .46),
  ],
  world: [
    harmonyProfile('modal drone', 'phrygian:dominant', [[0,'sus2'],[0,'sus2'],[1,''],[0,'sus2']], .48, .66),
    harmonyProfile('open fifths', 'hirajoshi', [[0,'sus2'],[0,'sus2'],[5,'sus2'],[0,'sus2']], .6, .32),
    harmonyProfile('caravan cadence', 'harmonic:minor', [[0,'m'],[1,''],[7,'7'],[0,'m']], .34, .7),
  ],
};

var SCALE_HARMONY_TEMPLATES = {
  major: [[0,''],[9,'m'],[5,''],[7,'7']],
  minor: [[0,'m'],[8,''],[3,''],[10,'']],
  dorian: [[0,'m7'],[5,'7'],[10,''],[0,'m7']],
  phrygian: [[0,'m'],[1,''],[10,''],[0,'m']],
  lydian: [[0,'^7'],[2,''],[7,'^7'],[0,'^7']],
  'minor:pentatonic': [[0,'m7'],[10,''],[5,''],[0,'m7']],
};

var FORMS_16 = [
  {
    name: 'intro · A · break · peak · release', length: 16,
    masks: {
      drums: '<0@2 1@6 0@2 1@4 0@2>', bass: '<0@2 1@12 0@2>', harmony: '<1@8 0@2 1@4 0@2>',
      lead: '<0@2 1@6 0@2 1@4 0@2>', accent: '<0@6 1@2 0@4 1@2 0@2>', texture: '<1@2 0@6 1@2 0@4 1@2>',
    },
  },
  {
    name: 'hush · lift · answer · release', length: 16,
    masks: {
      drums: '<0@2 1@4 0@2 1@6 0@2>', bass: '<0@2 1@6 0@2 1@4 0@2>', harmony: '<1@6 0@2 1@6 0@2>',
      lead: '<0@4 1@4 0@2 1@4 0@2>', accent: '<0@2 1@2 0@6 1@4 0@2>', texture: '<1@4 0@4 1@4 0@4>',
    },
  },
];

var FORMS_AMBIENT = [
  {
    name: 'fade · bloom · drift · dissolve', length: 16,
    masks: {
      drums: '<0@16>', bass: '<1@6 0@2 1@6 0@2>', harmony: '<1@7 0@1 1@6 0@2>',
      lead: '<0@2 1@6 0@2 1@4 0@2>', accent: '<0@5 1@3 0@4 1@2 0@2>', texture: '<1@4 0@2 1@8 0@2>',
    },
  },
  {
    name: 'stillness · current · clearing', length: 16,
    masks: {
      drums: '<0@16>', bass: '<0@2 1@5 0@1 1@6 0@2>', harmony: '<1@6 0@2 1@6 0@2>',
      lead: '<0@4 1@4 0@2 1@4 0@2>', accent: '<0@6 1@2 0@4 1@2 0@2>', texture: '<1@6 0@2 1@6 0@2>',
    },
  },
];

var FORMS_BLUES = [
  {
    name: 'count-in · chorus A · chorus B · tag', length: 24,
    masks: {
      drums: '<0@1 1@10 0@1 1@11 0@1>', bass: '<0@1 1@10 0@1 1@11 0@1>', harmony: '<1@11 0@1 1@11 0@1>',
      lead: '<0@2 1@8 0@3 1@9 0@2>', accent: '<0@5 1@4 0@8 1@4 0@3>', texture: '<0@12 1@10 0@2>',
    },
  },
  {
    name: 'riff · vocal space · solo · turnaround', length: 24,
    masks: {
      drums: '<1@11 0@1 1@11 0@1>', bass: '<1@11 0@1 1@11 0@1>', harmony: '<1@10 0@2 1@10 0@2>',
      lead: '<0@1 1@7 0@4 0@2 1@8 0@2>', accent: '<0@8 1@3 0@5 1@5 0@3>', texture: '<0@12 1@8 0@4>',
    },
  },
];

var BASE_GENRE_NAMES = ['edm', 'jazz', 'classical', 'blues', 'ambient', 'lofi', 'world'];

function buildRandomGenre(rng) {
  var scaleGenreName = pickFrom(rng, BASE_GENRE_NAMES);
  var soundGenreName = pickFrom(rng, BASE_GENRE_NAMES);
  var grooveGenreName = pickFrom(rng, BASE_GENRE_NAMES);
  var scaleGenre = GENRES[scaleGenreName];
  var soundGenre = GENRES[soundGenreName];
  var grooveGenre = GENRES[grooveGenreName];
  var soundPool = soundGenre.sounds || (soundGenre.subgenres ? pickFrom(rng, soundGenre.subgenres).sounds : GENRES.edm.sounds);
  return {
    label: 'Random (' + scaleGenre.label + ' harmony + ' + soundGenre.label + ' color + ' + grooveGenre.label + ' groove)',
    tempoRange: scaleGenre.tempoRange,
    keys: scaleGenre.keys || ['C', 'D', 'E', 'F', 'G', 'A'],
    octaves: soundGenre.octaves,
    sounds: soundPool,
    bank: grooveGenre.bank || scaleGenre.bank || ['RolandTR808'],
    drums: grooveGenre.drums || scaleGenre.drums,
    layers: ['drums', 'perc', 'bass', 'lead', 'countermelody', 'chords', 'arp', 'texture'],
    harmonyGenre: scaleGenreName,
  };
}

function buildFusionGenre(rng, genreNames) {
  if (!genreNames || genreNames.length < 2) {
    var first = Math.floor(rng() * BASE_GENRE_NAMES.length);
    var second = (first + 1 + Math.floor(rng() * (BASE_GENRE_NAMES.length - 1))) % BASE_GENRE_NAMES.length;
    genreNames = [BASE_GENRE_NAMES[first], BASE_GENRE_NAMES[second]];
  }
  var validNames = genreNames.filter(function(name) { return GENRES[name]; });
  if (validNames.length < 2) validNames = ['edm', 'ambient'];
  var genres = validNames.map(function(name) { return GENRES[name]; });
  var tempoLow = 0;
  var tempoHigh = 0;
  var bank = null;
  var drums = null;
  var soundPools = [];
  genres.forEach(function(genre) {
    tempoLow += genre.tempoRange[0];
    tempoHigh += genre.tempoRange[1];
    if (!bank && genre.bank) bank = genre.bank;
    if (!drums && genre.drums) drums = genre.drums;
    soundPools.push(genre.sounds || (genre.subgenres ? pickFrom(rng, genre.subgenres).sounds : GENRES.edm.sounds));
  });
  function sampleSound(pool) { return Array.isArray(pool) ? pickFrom(rng, pool) : pool; }
  var sampled = soundPools.map(sampleSound);
  return {
    label: 'Fusion (' + validNames.map(function(name) { return GENRES[name].label; }).join(' × ') + ')',
    tempoRange: [Math.round(tempoLow / genres.length), Math.round(tempoHigh / genres.length)],
    keys: GENRES[validNames[0]].keys || ['C', 'D', 'E', 'F', 'G', 'A'],
    octaves: pickFrom(rng, genres).octaves,
    sounds: [{
      lead: sampled[0].lead || 'triangle',
      bass: sampled[Math.min(1, sampled.length - 1)].bass || 'sine',
      chord: sampled[sampled.length - 1].chord || 'gm_electric_piano_1',
      arp: sampled[0].arp || sampled[sampled.length - 1].lead || 'sine',
    }],
    bank: bank || ['RolandTR808'],
    drums: drums,
    layers: ['drums', 'perc', 'bass', 'lead', 'countermelody', 'chords', 'arp', 'texture'],
    harmonyGenre: validNames[0],
  };
}

function chooseHarmonyProfile(genreName, analysis, rng, variationIndex) {
  var profiles = HARMONY_PROFILES[genreName] || HARMONY_PROFILES.edm;
  var bestIndex = 0;
  var bestScore = Infinity;
  profiles.forEach(function(profile, index) {
    var score = Math.abs(profile.brightness - analysis.brightness) + Math.abs(profile.tension - analysis.tension) * .85 + rng() * .12;
    if (score < bestScore) { bestScore = score; bestIndex = index; }
  });
  return profiles[(bestIndex + (variationIndex || 0)) % profiles.length];
}

function buildHarmonySymbols(key, degrees) {
  return degrees.map(function(spec) { return transposeNote(key, spec[0]) + spec[1]; });
}

function buildGenericHarmonyDegrees(scale, harmonicBars) {
  var template = SCALE_HARMONY_TEMPLATES[scale] || SCALE_HARMONY_TEMPLATES.minor;
  if (harmonicBars === 12) {
    var quality = (scale === 'minor' || scale === 'dorian' || scale === 'phrygian' || scale === 'minor:pentatonic') ? 'm7' : '7';
    var turnaround = [0,0,0,0,5,5,0,0,7,5,0,7];
    return turnaround.map(function(degree) { return [degree, quality]; });
  }
  var result = [];
  for (var i = 0; i < harmonicBars; i++) result.push(template[i % template.length].slice());
  return result;
}

function makeBar(notes) { return '[' + notes.join(' ') + ']'; }

function generateChordAwarePhrase(rng, phraseBars, analysis, variationIndex) {
  var motifPool = [
    [0,1,2,1], [0,2,1,2], [1,0,2,1], [0,1,3,2], [2,1,0,1],
  ];
  var baseMotifIndex = Math.floor(rng() * motifPool.length);
  var motif = motifPool[(baseMotifIndex + (variationIndex || 0)) % motifPool.length].slice();
  var leadBars = [];
  var counterBars = [];
  for (var bar = 0; bar < phraseBars; bar++) {
    var section = phraseBars === 12 ? Math.floor(bar / 4) : Math.floor(bar / Math.max(1, phraseBars / 2));
    var notes = motif.slice();
    if (section === 1) {
      notes = notes.map(function(note, index) { return index % 2 ? Math.max(0, Math.min(3, note + 1)) : note; });
    } else if (section >= 2) {
      notes = motif.slice().reverse().map(function(note) { return Math.max(0, Math.min(3, 2 - (note - 1))); });
    }
    /** @type {Array<number|string>} */
    var renderedNotes = notes;
    if (bar % 2 === 1) renderedNotes = [notes[0], '~', notes[2], notes[1]];
    if (analysis.energy < .42) renderedNotes = [notes[0] + '@2', '~', notes[2], '~'];
    else if (analysis.energy > .7 && rng() < .5) renderedNotes = ['[' + notes[0] + ' ' + notes[1] + ']', notes[2], notes[1], notes[3]];
    if (bar === phraseBars - 1) renderedNotes = [2, 1, '0@2'];
    leadBars.push(makeBar(renderedNotes));

    /** @type {Array<number|string>} */
    var counter = bar === phraseBars - 1
      ? ['~', '~', 0, '~']
      : (bar % 2 === 0 ? ['~', '~', 2, '~'] : ['~', 1 + '@2', '~']);
    counterBars.push(makeBar(counter));
  }
  return {
    motif: motif,
    lead: '<' + leadBars.join(' ') + '>',
    counter: '<' + counterBars.join(' ') + '>',
  };
}

function generateBassPattern(rng, harmonicBars, energy) {
  var patterns = energy > .65
    ? [[0,0,1,0],[0,1,0,2],[0,0,2,1],[0,1,2,0]]
    : energy < .35
      ? [[0,'~',1,'~'],[0,'~','0@2'],[0,'~',2,'~']]
      : [[0,0,1,'~'],[0,'~',1,0],[0,0,2,1],[0,'~',1,'~']];
  var bars = [];
  for (var i = 0; i < harmonicBars; i++) {
    var notes = pickFrom(rng, patterns).slice();
    if (i === harmonicBars - 1) notes = [0, 1, '0@2'];
    bars.push(makeBar(notes));
  }
  return '<' + bars.join(' ') + '>';
}

function genDrumGains(rng, analysis) {
  var kick = (0.52 + analysis.energy * .28).toFixed(2);
  var snare = (0.46 + analysis.energy * .16).toFixed(2);
  var hats = pickFrom(rng, ['[.28 .12 .2 .12]*4', '[.3 .14 .24 .12]*4', '[.25 .12]*8']);
  return kick + ', ~ ' + snare + ' ~ ' + snare + ', ' + hats + ', [~ .16]*4';
}

function chooseForm(genreName, rng, variationIndex) {
  var forms = genreName === 'blues' ? FORMS_BLUES : (genreName === 'ambient' ? FORMS_AMBIENT : FORMS_16);
  var baseIndex = Math.floor(rng() * forms.length);
  return forms[(baseIndex + (variationIndex || 0)) % forms.length];
}

function resolveGenrePlan(genreName, harmonyRng) {
  var genre;
  var resolvedName = genreName;
  var subLabel = '';
  if (genreName === 'random') {
    genre = buildRandomGenre(harmonyRng);
    resolvedName = 'random';
  } else if (genreName.indexOf('fusion:') === 0) {
    genre = buildFusionGenre(harmonyRng, genreName.replace('fusion:', '').split('+'));
    resolvedName = 'fusion';
  } else if (genreName === 'fusion') {
    genre = buildFusionGenre(harmonyRng);
    resolvedName = 'fusion';
  } else {
    genre = GENRES[genreName] || GENRES.edm;
  }

  var soundPool = genre.sounds;
  var keyPool = genre.keys;
  if (genreName === 'world') {
    var sub = pickFrom(harmonyRng, genre.subgenres);
    soundPool = sub.sounds;
    keyPool = sub.keys;
    subLabel = ' · ' + sub.name;
  }
  return { genre: genre, resolvedName: resolvedName, soundPool: soundPool, keyPool: keyPool, subLabel: subLabel };
}

function ensureLeadFx(fx, analysis) {
  var joined = fx.join('');
  if (joined.indexOf('.lpf(') === -1) fx.push('.lpf(' + Math.round(2200 + analysis.brightness * 3600) + ')');
  if (joined.indexOf('.lpq(') === -1) fx.push('.lpq(2)');
  if (joined.indexOf('.hpf(') === -1) fx.push('.hpf(20)');
  if (joined.indexOf('.shape(') === -1) fx.push('.shape(0)');
  if (joined.indexOf('.crush(') === -1) fx.push('.crush(16)');
  if (joined.indexOf('.delay(') === -1) fx.push('.delay(.12)');
  if (joined.indexOf('.delayfeedback(') === -1) fx.push('.delayfeedback(.22)');
  if (joined.indexOf('.room(') === -1) fx.push('.room(' + (0.18 + analysis.space * .42).toFixed(2) + ')');
  if (joined.indexOf('.gain(') === -1) fx.push('.gain(.36)');
  return fx;
}

function createCompositionPlan(text, genreName, variations) {
  var normalizedText = (text || '').normalize('NFKC').trim();
  var state = copyVariationState(variations || variationState);
  var seedBase = normalizedText.toLowerCase() + ':' + genreName;
  var harmonyRng = createRNG(seedBase + ':harmony:' + state.harmony);
  var melodyRng = createRNG(seedBase + ':melody-base');
  var grooveRng = createRNG(seedBase + ':groove:' + state.groove);
  var arrangementRng = createRNG(seedBase + ':arrangement:' + state.arrangement);
  var analysis = analyzeText(normalizedText);
  var resolved = resolveGenrePlan(genreName, harmonyRng);
  var genre = resolved.genre;
  var harmonyGenre = genre.harmonyGenre || (resolved.resolvedName === 'random' || resolved.resolvedName === 'fusion' ? 'edm' : resolved.resolvedName);
  var identityRng = createRNG(seedBase + ':harmony-identity');
  var profiles = HARMONY_PROFILES[harmonyGenre] || HARMONY_PROFILES.edm;
  var profile = chooseHarmonyProfile(harmonyGenre, analysis, identityRng, state.harmony);
  var keyPool = resolved.keyPool || ['C','D','E','F','G','A'];
  var baseKeyIndex = Math.floor(identityRng() * keyPool.length);
  var keyCycle = Math.floor(state.harmony / profiles.length);
  var key = keyPool[(baseKeyIndex + keyCycle) % keyPool.length];
  var harmonyDegrees = profile.degrees.map(function(spec) { return spec.slice(); });
  var harmonySymbols = buildHarmonySymbols(key, harmonyDegrees);
  var tempoPosition = clamp(.12 + analysis.energy * .76 + (harmonyRng() - .5) * .12);
  var tempo = Math.round(genre.tempoRange[0] + tempoPosition * (genre.tempoRange[1] - genre.tempoRange[0]));
  var bank = Array.isArray(genre.bank) ? pickFrom(arrangementRng, genre.bank) : genre.bank;
  var sounds = Array.isArray(resolved.soundPool) ? pickFrom(arrangementRng, resolved.soundPool) : resolved.soundPool;
  sounds = sounds || { lead: 'triangle', bass: 'sine', chord: 'gm_electric_piano_1', arp: 'sine' };
  var formGenre = harmonyGenre === 'blues' ? 'blues' : (harmonyGenre === 'ambient' ? 'ambient' : resolved.resolvedName);
  var form = chooseForm(formGenre, createRNG(seedBase + ':form-base'), state.arrangement);
  var phrase = generateChordAwarePhrase(melodyRng, profile.phraseBars, analysis, state.melody);
  var bass = generateBassPattern(createRNG(seedBase + ':bass:' + state.harmony), profile.harmonicBars, analysis.energy);
  var drums = null;
  if (genre.drums && genre.drums.length) {
    var grooveBaseRng = createRNG(seedBase + ':groove-base');
    var drumIndex = (Math.floor(grooveBaseRng() * genre.drums.length) + state.groove) % genre.drums.length;
    drums = genre.drums[drumIndex];
  }
  var chordRhythms = harmonyGenre === 'ambient' ? ['x(2,8,-1)', 'x(3,8,-1)'] : ['x(3,8,-1)', 'x(4,8,-1)', 'x(5,8,-1)'];
  var chordRhythm = pickFrom(harmonyRng, chordRhythms);
  var accentChoices = harmonyGenre === 'ambient' || harmonyGenre === 'classical' || harmonyGenre === 'edm' ? ['arp','counter'] : ['counter','none'];
  var accentRole = pickFrom(arrangementRng, accentChoices);
  var includePerc = Boolean(drums && bank && analysis.energy > .48 && arrangementRng() > .28);
  var includeTexture = Boolean(harmonyGenre === 'ambient' || analysis.space > .45 || arrangementRng() > .72);
  var room = (0.16 + analysis.space * .46).toFixed(2);
  var lpfLow = Math.round(450 + analysis.weight * 450);
  var lpfHigh = Math.round(2600 + analysis.brightness * 3600);
  var filterSpeed = 4 + Math.round(analysis.space * 8);
  var genreFx = genre.leadFx ? genre : {
    leadFx: function() { return ['.lpf(sine.range('+lpfLow+','+lpfHigh+').slow('+filterSpeed+'))', '.decay(.16).sustain(.38)', '.room('+room+').gain(.38)']; },
    bassFx: function() { return ['.lpf('+Math.round(180+analysis.brightness*180)+').decay(.14).sustain(.32).gain(.48)']; },
    chordFx: function() { return ['.decay(.2).sustain(.38)', '.room('+room+').gain(.26)']; },
  };
  var leadFx = ensureLeadFx(genreFx.leadFx(arrangementRng, analysis, room, lpfLow, lpfHigh, filterSpeed).slice(), analysis);
  var bassFx = genreFx.bassFx(arrangementRng, analysis, room).slice();
  var chordFx = genreFx.chordFx(arrangementRng, analysis, room).filter(function(fx) { return fx.indexOf('.struct(') === -1; });
  var leadTechnique = pickFrom(arrangementRng, [
    '', '.every(4, x=>x.rev())', '.every(8, x=>x.fast(2))',
    analysis.space > .4 ? '.jux(rev)' : '', analysis.energy > .62 ? '.off(1/8, x=>x.gain(.18))' : '',
  ]);
  var octaves = genre.octaves || { lead: 5, bass: 2, chord: 4, arp: 6 };
  var leadRegister = Math.max(3, Math.min(7, octaves.lead || 5));
  var accentRegister = Math.max(4, Math.min(7, octaves.arp || leadRegister + 1));

  return {
    source: 'algorithmic', text: normalizedText, genreName: genreName, resolvedGenreName: resolved.resolvedName,
    genreLabel: genre.label + resolved.subLabel, harmonyGenre: harmonyGenre, analysis: analysis, variations: state,
    key: key, scale: profile.scale, tempo: tempo, profileName: profile.name,
    harmony: { degrees: harmonyDegrees, symbols: harmonySymbols, harmonicBars: profile.harmonicBars, phraseBars: profile.phraseBars },
    form: form, sounds: sounds, bank: bank, drums: drums, drumGains: genDrumGains(grooveRng, analysis),
    chordRhythm: chordRhythm, phrase: phrase, bassPattern: bass, accentRole: accentRole,
    includePerc: includePerc, includeTexture: includeTexture, room: room,
    leadFx: leadFx, bassFx: bassFx, chordFx: chordFx, leadTechnique: leadTechnique,
    registers: {
      harmony: Math.max(2, Math.min(6, octaves.chord || 4)),
      bass: Math.max(1, Math.min(4, octaves.bass || 2)),
      lead: leadRegister,
      accent: accentRegister,
    },
  };
}

var GENERATED_ARRANGEMENT_END = '// --- generated arrangement end ---';

function scaleAnchor(key, octave) { return key.toLowerCase() + octave; }
function safeCommentText(text) { return String(text || '').replace(/\s+/g, ' ').replace(/"/g, "'").trim(); }

function renderCompositionPlan(plan) {
  var a = plan.analysis;
  var L = [];
  var layers = [];
  L.push('// "' + safeCommentText(plan.text) + '" -> ' + plan.genreLabel);
  L.push('// identity: ' + plan.key + ' ' + plan.scale.replace(/:/g, ' ') + ' · ' + plan.profileName + ' · ' + plan.tempo + ' BPM');
  L.push('// mood: ' + describeMood(a));
  L.push('// form: ' + plan.form.name + ' (' + plan.form.length + ' cycles)');
  L.push('// variation: H' + plan.variations.harmony + ' M' + plan.variations.melody + ' G' + plan.variations.groove + ' A' + plan.variations.arrangement);
  L.push('');
  L.push('setcpm(' + plan.tempo + '/4)');
  L.push('');
  L.push('const harmony = chord("<' + plan.harmony.symbols.join(' ') + '>").dict("ireal")');
  L.push('');

  function addLayer(role, lines) {
    layers.push(role);
    L.push('// ' + role);
    lines.forEach(function(line) { if (line) L.push(line); });
    L.push('');
  }

  if (plan.drums && plan.bank) {
    var drumPattern = [plan.drums.k, plan.drums.s, plan.drums.h, plan.drums.x].filter(Boolean).join(', ');
    addLayer('drums · pulse and backbeat', [
      '$: s("' + drumPattern + '")', '.bank("' + plan.bank + '")', '.gain("' + plan.drumGains + '")',
      plan.harmonyGenre === 'lofi' ? '.lpf(' + Math.round(2100 + a.brightness * 1700) + ')' : '',
      (plan.harmonyGenre === 'jazz' || plan.harmonyGenre === 'blues' || plan.harmonyGenre === 'lofi') ? '.swing(4)' : '',
      '.orbit(1)', '.mask("' + plan.form.masks.drums + '")',
    ]);
  }

  addLayer('bass · roots that follow harmony', [
    '$: n("' + plan.bassPattern + '")', '.set(harmony).mode("root:g' + plan.registers.bass + '").voicing()',
    '.s("' + plan.sounds.bass + '")',
  ].concat(plan.bassFx).concat(['.orbit(2)', '.mask("' + plan.form.masks.bass + '")']));

  addLayer('harmony · voice-led progression', [
    '$: harmony.anchor("c' + plan.registers.harmony + '").voicing()', '.struct("' + plan.chordRhythm + '")',
    '.s("' + plan.sounds.chord + '")',
  ].concat(plan.chordFx).concat(['.orbit(3)', '.mask("' + plan.form.masks.harmony + '")']));

  addLayer('lead · motif, answer, resolution', [
    '$: harmony.n("' + plan.phrase.lead + '")', '.anchor("' + scaleAnchor(plan.key, plan.registers.lead) + '").voicing()',
    '.s("' + plan.sounds.lead + '")',
  ].concat(plan.leadFx).concat([plan.leadTechnique, '.orbit(4)', '.mask("' + plan.form.masks.lead + '")']));

  if (plan.accentRole === 'arp') {
    addLayer('accent · harmony-derived arpeggio', [
      '$: harmony.n("[0 1 2 1]*2")', '.anchor("' + scaleAnchor(plan.key, plan.registers.accent) + '").voicing()',
      '.s("' + (plan.sounds.arp || plan.sounds.lead || 'sine') + '")', '.decay(.08).sustain(0)', '.delay(.18).delayfeedback(.28)',
      '.room(' + Math.min(.65, .22 + a.space * .35).toFixed(2) + ').gain(.14)', '.orbit(5)', '.mask("' + plan.form.masks.accent + '")',
    ]);
  } else if (plan.accentRole === 'counter') {
    addLayer('accent · answer in the lead gaps', [
      '$: harmony.n("' + plan.phrase.counter + '")', '.anchor("' + scaleAnchor(plan.key, plan.registers.accent) + '").voicing()',
      '.s("' + (plan.sounds.arp || 'sine') + '")', '.attack(.04).release(.35)', '.gain(.13).room(' + plan.room + ')',
      '.late(1/8)', '.orbit(5)', '.mask("' + plan.form.masks.accent + '")',
    ]);
  }

  if (plan.includePerc && plan.bank) {
    var percussion = ['[~ rim]*4', 'rim [~ rim] ~ rim', '[~ perc]*4', '[~ cb]*4'];
    var percRng = createRNG(plan.text.toLowerCase() + ':' + plan.genreName + ':perc:' + plan.variations.groove);
    addLayer('percussion · offbeat detail', [
      '$: s("' + pickFrom(percRng, percussion) + '")', '.bank("' + plan.bank + '")',
      '.gain(' + (.13 + a.energy * .12).toFixed(2) + ')', '.orbit(1)', '.mask("' + plan.form.masks.accent + '")',
    ]);
  }

  if (plan.includeTexture) {
    var textureRng = createRNG(plan.text.toLowerCase() + ':' + plan.genreName + ':texture:' + plan.variations.arrangement);
    addLayer('texture · air around the arrangement', [
      '$: s("' + pickFrom(textureRng, ['pink','brown','white']) + '")', '.lpf(' + Math.round(320 + a.brightness * 720) + ')',
      '.gain(sine.range(.02,' + (.045 + a.weight * .045).toFixed(2) + ').slow(' + Math.round(10 + a.space * 12) + '))',
      '.room(' + (.42 + a.space * .34).toFixed(2) + ')', '.orbit(6)', '.mask("' + plan.form.masks.texture + '")',
    ]);
  }

  L.push(GENERATED_ARRANGEMENT_END);
  plan.layerRoles = layers;
  return L.join('\n').trim();
}

function generateCode(text, genreName, variations) {
  var plan = createCompositionPlan(text, genreName, variations || variationState);
  lastCompositionPlan = plan;
  return renderCompositionPlan(plan);
}

var MUSIC_LAYER_NAMES = ['drums', 'bass', 'harmony', 'lead', 'accent', 'percussion', 'texture'];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findExactLine(code, line, fromIndex) {
  var expression = new RegExp('^' + escapeRegExp(line) + '\\r?$', 'gm');
  expression.lastIndex = fromIndex || 0;
  var match = expression.exec(code);
  return match ? { start: match.index, end: match.index + match[0].length } : null;
}

function findLastExactLine(code, line) {
  var expression = new RegExp('^' + escapeRegExp(line) + '\\r?$', 'gm');
  var match;
  var last = null;
  while ((match = expression.exec(code))) {
    last = { start: match.index, end: match.index + match[0].length };
  }
  return last;
}

function findLayerBounds(code, role) {
  var generatedEnd = findLastExactLine(code, GENERATED_ARRANGEMENT_END);
  if (!generatedEnd) return null;
  var harmonyExpression = /^const harmony = chord\("<[^"\r\n]+>"\)\.dict\("ireal"\)$/gm;
  var harmonyMatch;
  var generatedStart = -1;
  while ((harmonyMatch = harmonyExpression.exec(code)) && harmonyMatch.index < generatedEnd.start) {
    generatedStart = harmonyMatch.index;
  }
  if (generatedStart === -1) return null;
  var markerExpression = new RegExp('^// ' + escapeRegExp(role) + ' ·[^\\r\\n]*$', 'gm');
  markerExpression.lastIndex = generatedStart;
  var marker = markerExpression.exec(code);
  if (!marker || marker.index >= generatedEnd.start) return null;
  var nextLayerExpression = /^\/\/ (?:drums|bass|harmony|lead|accent|percussion|texture) ·[^\r\n]*$/gm;
  nextLayerExpression.lastIndex = marker.index + marker[0].length;
  var next = nextLayerExpression.exec(code);
  var end = next ? next.index : code.length;
  end = Math.min(end, generatedEnd.start);
  return { start: marker.index, end: end };
}

function getLayerBlock(code, role) {
  var bounds = findLayerBounds(code, role);
  return bounds ? code.slice(bounds.start, bounds.end).trim() : '';
}

function setLayerBlock(code, role, block) {
  var bounds = findLayerBounds(code, role);
  var replacement = block ? block.trim() : '';
  if (!bounds && replacement) {
    var generatedEnd = findLastExactLine(code, GENERATED_ARRANGEMENT_END);
    if (generatedEnd) {
      return code.slice(0, generatedEnd.start).trimEnd() + '\n\n' + replacement + '\n\n' + code.slice(generatedEnd.start);
    }
    return code.trimEnd() + '\n\n' + replacement;
  }
  if (!bounds) return code;
  return code.slice(0, bounds.start) + (replacement ? replacement + '\n' : '') + code.slice(bounds.end);
}

function transformLayerBlock(code, role, transform) {
  var block = getLayerBlock(code, role);
  return block ? setLayerBlock(code, role, transform(block)) : code;
}

function replaceQuotedCall(block, expression, value) {
  return block.replace(expression, function(match, before, after) {
    return before + value + after;
  });
}

function updatePlanComments(code, plan) {
  return code
    .replace(/^\/\/ form:.*$/m, '// form: ' + plan.form.name + ' (' + plan.form.length + ' cycles)')
    .replace(/^\/\/ variation:.*$/m, '// variation: H' + plan.variations.harmony + ' M' + plan.variations.melody +
      ' G' + plan.variations.groove + ' A' + plan.variations.arrangement);
}

function patchLayerMask(code, role, mask) {
  return transformLayerBlock(code, role, function(block) {
    if (/\.mask\("[^"]*"\)/.test(block)) {
      return replaceQuotedCall(block, /(\.mask\(")[^"]*("\))/, mask);
    }
    return block.trimEnd() + '\n.mask("' + mask + '")';
  });
}

function generateFocusedVariationCode(focus, currentCode) {
  if (!lastCompositionPlan || !currentCode) return currentCode;
  var currentPlan = lastCompositionPlan;
  var candidate = createCompositionPlan(currentPlan.text, currentPlan.genreName, variationState);
  var code = currentCode;

  if (focus === 'melody') {
    code = transformLayerBlock(code, 'lead', function(block) {
      return replaceQuotedCall(block, /(\$: harmony\.n\(")[^"]*("\))/, candidate.phrase.lead);
    });
    code = transformLayerBlock(code, 'accent', function(block) {
      if (block.indexOf('answer in the lead gaps') === -1) return block;
      return replaceQuotedCall(block, /(\$: harmony\.n\(")[^"]*("\))/, candidate.phrase.counter);
    });
    currentPlan.phrase = candidate.phrase;
    currentPlan.variations = candidate.variations;
    return updatePlanComments(code, currentPlan);
  }

  if (focus === 'groove') {
    if (candidate.drums) {
      var drumPattern = [candidate.drums.k, candidate.drums.s, candidate.drums.h, candidate.drums.x].filter(Boolean).join(', ');
      code = transformLayerBlock(code, 'drums', function(block) {
        block = replaceQuotedCall(block, /(\$: s\(")[^"]*("\))/, drumPattern);
        return replaceQuotedCall(block, /(\.gain\(")[^"]*("\))/, candidate.drumGains);
      });
      var candidateCode = renderCompositionPlan(candidate);
      var candidatePerc = getLayerBlock(candidateCode, 'percussion');
      if (candidatePerc && getLayerBlock(code, 'percussion')) {
        var nextPercPattern = (candidatePerc.match(/\$: s\("([^"]*)"\)/) || [])[1];
        if (nextPercPattern) {
          code = transformLayerBlock(code, 'percussion', function(block) {
            return replaceQuotedCall(block, /(\$: s\(")[^"]*("\))/, nextPercPattern);
          });
        }
      }
    }
    currentPlan.drums = candidate.drums;
    currentPlan.drumGains = candidate.drumGains;
    currentPlan.variations = candidate.variations;
    return updatePlanComments(code, currentPlan);
  }

  if (focus === 'arrangement') {
    var currentBaselineCode = renderCompositionPlan(currentPlan);
    var preserved = ['analysis', 'key', 'scale', 'tempo', 'profileName', 'harmony', 'phrase', 'bassPattern', 'drums', 'drumGains', 'registers', 'room'];
    preserved.forEach(function(field) { candidate[field] = currentPlan[field]; });
    var candidateCode = renderCompositionPlan(candidate);

    code = transformLayerBlock(code, 'drums', function(block) {
      return candidate.bank
        ? replaceQuotedCall(block, /(\.bank\(")[^"]*("\))/, candidate.bank)
        : block;
    });
    ['bass', 'harmony', 'lead'].forEach(function(role) {
      var sound = role === 'bass' ? candidate.sounds.bass : (role === 'harmony' ? candidate.sounds.chord : candidate.sounds.lead);
      code = transformLayerBlock(code, role, function(block) {
        return replaceQuotedCall(block, /(\.s\(")[^"]*("\))/, sound);
      });
    });
    code = transformLayerBlock(code, 'harmony', function(block) {
      return replaceQuotedCall(block, /(\.struct\(")[^"]*("\))/, candidate.chordRhythm);
    });
    code = transformLayerBlock(code, 'lead', function(block) {
      if (currentPlan.leadTechnique) block = block.replace('\n' + currentPlan.leadTechnique, '');
      if (candidate.leadTechnique && block.indexOf(candidate.leadTechnique) === -1) {
        block = block.replace(/\n\.orbit\(4\)/, '\n' + candidate.leadTechnique + '\n.orbit(4)');
      }
      return block;
    });

    ['accent', 'percussion', 'texture'].forEach(function(role) {
      var currentBlock = getLayerBlock(code, role);
      var baselineBlock = getLayerBlock(currentBaselineCode, role);
      var candidateBlock = getLayerBlock(candidateCode, role);
      if (!currentBlock && candidateBlock) {
        code = setLayerBlock(code, role, candidateBlock);
      } else if (currentBlock === baselineBlock) {
        code = setLayerBlock(code, role, candidateBlock);
      }
    });
    MUSIC_LAYER_NAMES.forEach(function(role) {
      var maskRole = role === 'percussion' ? 'accent' : role;
      if (candidate.form.masks[maskRole]) code = patchLayerMask(code, role, candidate.form.masks[maskRole]);
    });
    lastCompositionPlan = candidate;
    return updatePlanComments(code, candidate);
  }

  return currentCode;
}

function applyToneToPlan(plan, scale) {
  if (!plan) return null;
  var target = scale === 'pentatonic' ? 'minor:pentatonic' : scale;
  var degrees = buildGenericHarmonyDegrees(target, plan.harmony.harmonicBars);
  plan.scale = target;
  plan.profileName = target.replace(/:/g, ' ') + ' reharmonization';
  plan.harmony.degrees = degrees;
  plan.harmony.symbols = buildHarmonySymbols(plan.key, degrees);
  return plan;
}

function replaceHarmonyAndIdentity(code, plan) {
  return code
    .replace(/const harmony = chord\("<[^\"]+>"\)\.dict\("ireal"\)/, 'const harmony = chord("<' + plan.harmony.symbols.join(' ') + '>").dict("ireal")')
    .replace(/^\/\/ identity:.*$/m, '// identity: ' + plan.key + ' ' + plan.scale.replace(/:/g, ' ') + ' · ' + plan.profileName + ' · ' + plan.tempo + ' BPM');
}

function shiftPlanRegisters(code, delta) {
  if (!lastCompositionPlan) return code;
  var registers = lastCompositionPlan.registers;
  registers.harmony = Math.max(2, Math.min(6, registers.harmony + delta));
  registers.bass = Math.max(1, Math.min(4, registers.bass + delta));
  registers.lead = Math.max(3, Math.min(7, registers.lead + delta));
  registers.accent = Math.max(4, Math.min(7, registers.accent + delta));
  var melodicAnchorIndex = 0;
  return code
    .replace(/anchor\("c\d"\)/, 'anchor("c' + registers.harmony + '")')
    .replace(/mode\("root:g\d"\)/, 'mode("root:g' + registers.bass + '")')
    .replace(/(\$: harmony\.n\("[^"]+"\)\n\.anchor\(")([a-g](?:#|b)?)\d("\)\.voicing\(\))/g, function(match, before, note, after) {
      var octave = melodicAnchorIndex++ === 0 ? registers.lead : registers.accent;
      return before + note + octave + after;
    });
}

// Explicit test boundary: pure music APIs above this marker are dependency-free.
if (typeof globalThis !== 'undefined') {
  globalThis.__TTS_MUSIC_TEST__ = {
    analyzeText: analyzeText,
    describeMood: describeMood,
    createCompositionPlan: createCompositionPlan,
    renderCompositionPlan: renderCompositionPlan,
    generateCode: generateCode,
    generateFocusedVariationCode: generateFocusedVariationCode,
    applyToneToPlan: applyToneToPlan,
    buildGenericHarmonyDegrees: buildGenericHarmonyDegrees,
    replaceHarmonyAndIdentity: replaceHarmonyAndIdentity,
    HARMONY_PROFILES: HARMONY_PROFILES,
    FORMS_16: FORMS_16,
    FORMS_AMBIENT: FORMS_AMBIENT,
    FORMS_BLUES: FORMS_BLUES,
  };
}
// ---- Music Engine End ----


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
- Aim for 4-7 purposeful $: layers. Each gets a poetic // comment.
  You can split or combine as the music demands. Some options:
  - Drums as 1 combined layer OR split into kick / snare / hats (more control for arrangement)
  - Lead + counter-melody as separate layers, or .layer() to split one pattern into parallel voices
  - Separate texture/noise layer (filtered pink/white/brown noise for atmosphere)
  - Percussion layer (rim, perc, shaker — separate from drums for independent control)
  Advanced technique (use when it fits, not required):
  - Shared harmonic context is REQUIRED for tonal music: const harmony = chord("...").dict("ireal")
    Chords use harmony.voicing(), bass uses .set(harmony).mode("root:g2").voicing(),
    and melodic chord tones use harmony.n(...).anchor(...).voicing().
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
8. VARIATION: keep the harmony and core motif stable, then vary one phrase-level detail with .every(N, fn).
   Do not add unrelated randomness to every layer. Hierarchy and recognition matter more than novelty.
9. TEXTURE: .degradeBy(sine.range(0, 0.3).slow(16)) on pads/chords for organic breathing.
10. MOVEMENT: .lpf(sine.range(lo, hi).slow(N)) on drums or bass for build/release.
11. MINI-NOTATION SYNTAX: () is ONLY for euclidean rhythms x(k,n). For grouping use []. WRONG: .struct("x(~ x x ~)"). RIGHT: .struct("[~ x x ~]"). WRONG: "<0 2 4 6>7". RIGHT: "<0 2 4 6>".add(7).
12. Use setcpm(BPM/4) for tempo. setbpm DOES NOT EXIST.
13. line(a,b,n) and ramp() DO NOT EXIST. For linear sweep use saw.range(a,b).slow(n).
14. .stutter() DOES NOT EXIST. Use .ply(n) to repeat each event n times.
15. FUNCTION CALLS NEED PARENTHESES: .sometimes(x=>x.rev()) NOT .sometimes(x=>x.rev). Same for .fast(), .slow(), .ply() etc inside callbacks.
16. BASS DENSITY: In EDM/blues/jazz, bass should play multiple notes per cycle. WRONG: n("<0 3 5 7>") = 1 note per cycle = too slow. RIGHT: n("<[0 0 3 0] [5 5 7 5]>") or n("0 3 5 7") = 4 notes per cycle.
17. TRIADS not power chords: [0,2,4] = root+3rd+5th (triad). [0,4,7] = root+5th+octave (power chord, empty). Use [root, root+2, root+4] for scale-degree triads.`;

var API_KEY_NS = 'tts_api_key_';
var API_PERSIST_NS = 'tts_persist_';
var API_VERIFIED_AT_NS = 'tts_verified_at_';
var API_VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
var API_KEYS_MEMORY = Object.create(null);
var REQUEST_TIMEOUT_MS = 60000;
var VERIFY_TIMEOUT_MS = 10000;

// Legacy releases always wrote keys to localStorage. Keep those keys exactly
// where they are and truthfully mark them persisted; never silently relabel
// disk-backed data as session-only.
(function migrateApiState() {
  ['gemini', 'openai', 'claude'].forEach(function(provider) {
    var legacyKey = localStorage.getItem(API_KEY_NS + provider);
    if (legacyKey && localStorage.getItem(API_PERSIST_NS + provider) === null) {
      localStorage.setItem(API_PERSIST_NS + provider, '1');
    }
    var oldVerified = localStorage.getItem('tts_verified_' + provider);
    if (oldVerified === '1' && !localStorage.getItem(API_VERIFIED_AT_NS + provider)) {
      localStorage.setItem(API_VERIFIED_AT_NS + provider, String(Date.now()));
    }
    if (oldVerified !== null) localStorage.removeItem('tts_verified_' + provider);
  });
})();

function getApiKey(provider) {
  var p = provider || getProvider();
  return API_KEYS_MEMORY[p] || localStorage.getItem(API_KEY_NS + p) || '';
}

function getApiKeyPersist(provider) {
  var p = provider || getProvider();
  return localStorage.getItem(API_PERSIST_NS + p) === '1';
}

function saveApiKey(key, provider, persist) {
  var p = provider || getProvider();
  if (!key) {
    delete API_KEYS_MEMORY[p];
    localStorage.removeItem(API_KEY_NS + p);
    localStorage.removeItem(API_PERSIST_NS + p);
    return;
  }
  if (persist === true) {
    delete API_KEYS_MEMORY[p];
    localStorage.setItem(API_KEY_NS + p, key);
    localStorage.setItem(API_PERSIST_NS + p, '1');
  } else {
    API_KEYS_MEMORY[p] = key;
    localStorage.removeItem(API_KEY_NS + p);
    localStorage.removeItem(API_PERSIST_NS + p);
  }
}

function verificationKey(provider) {
  return API_VERIFIED_AT_NS + provider;
}

function isVerified(provider) {
  var timestamp = parseInt(localStorage.getItem(verificationKey(provider)) || '0', 10);
  return timestamp > 0 && Date.now() - timestamp < API_VERIFY_TTL_MS;
}

function setVerified(provider, verified) {
  if (verified) localStorage.setItem(verificationKey(provider), String(Date.now()));
  else localStorage.removeItem(verificationKey(provider));
  localStorage.removeItem('tts_verified_' + provider);
}

async function fetchWithTimeout(url, options, timeoutMs, externalSignal) {
  var controller = new AbortController();
  function abortFromExternal() { controller.abort(); }
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else if (typeof externalSignal.addEventListener === 'function') {
      externalSignal.addEventListener('abort', abortFromExternal, { once: true });
    }
  }
  var timer = setTimeout(function() { controller.abort(); }, timeoutMs || REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, Object.assign({}, options || {}, { signal: controller.signal }));
  } finally {
    clearTimeout(timer);
    if (externalSignal && typeof externalSignal.removeEventListener === 'function') {
      externalSignal.removeEventListener('abort', abortFromExternal);
    }
  }
}

async function readJsonResponse(response, providerLabel) {
  var data;
  try {
    data = await response.json();
  } catch (_) {
    throw new Error(providerLabel + ': malformed JSON response');
  }
  if (!response.ok || (data && data.error)) {
    var detail = data && data.error &&
      (typeof data.error === 'string' ? data.error : data.error.message);
    throw new Error(detail || (providerLabel + ': HTTP ' + response.status));
  }
  return data;
}

async function callLLM(options) {
  var provider = options.provider;
  var label = provider === 'gemini' ? 'Gemini' : provider === 'openai' ? 'OpenAI' : 'Claude';
  var response;
  if (provider === 'gemini') {
    response = await fetchWithTimeout(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + encodeURIComponent(options.apiKey),
      { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: options.system }] },
          contents: [{ parts: [{ text: options.user }] }],
          generationConfig: {
            temperature: options.temperature == null ? 1.0 : options.temperature,
            topP: options.topP,
            maxOutputTokens: options.maxTokens || 2048,
          },
        }) },
      options.timeoutMs || REQUEST_TIMEOUT_MS, options.signal
    );
    var geminiData = await readJsonResponse(response, label);
    var candidate = geminiData && geminiData.candidates && geminiData.candidates[0];
    var geminiText = candidate && candidate.content && candidate.content.parts &&
      candidate.content.parts[0] && candidate.content.parts[0].text;
    if (typeof geminiText !== 'string' || !geminiText.trim()) {
      throw new Error(label + ': empty or malformed response');
    }
    return geminiText;
  }
  if (provider === 'openai') {
    response = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + options.apiKey },
      body: JSON.stringify({
        model: 'gpt-5.4-nano',
        reasoning: { effort: 'none' },
        temperature: options.temperature == null ? 0.7 : options.temperature,
        max_tokens: options.maxTokens || 2048,
        messages: [
          { role: 'system', content: options.system },
          { role: 'user', content: options.user },
        ],
      }),
    }, options.timeoutMs || REQUEST_TIMEOUT_MS, options.signal);
    var openAIData = await readJsonResponse(response, label);
    var openAIText = openAIData && openAIData.choices && openAIData.choices[0] &&
      openAIData.choices[0].message && openAIData.choices[0].message.content;
    if (typeof openAIText !== 'string' || !openAIText.trim()) {
      throw new Error(label + ': empty or malformed response');
    }
    return openAIText;
  }
  response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': options.apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: options.maxTokens || 2048,
      temperature: options.temperature == null ? 0.7 : options.temperature,
      system: options.system,
      messages: [{ role: 'user', content: options.user }],
    }),
  }, options.timeoutMs || REQUEST_TIMEOUT_MS, options.signal);
  var claudeData = await readJsonResponse(response, label);
  var claudeText = claudeData && claudeData.content && claudeData.content[0] &&
    claudeData.content[0].text;
  if (typeof claudeText !== 'string' || !claudeText.trim()) {
    throw new Error(label + ': empty or malformed response');
  }
  return claudeText;
}

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
    stack(
      note("c d e f g a b c5").fast(8),
      note("c d e f g a b c5").fast(8.1)
    )
    // plays at two imperceptibly different speeds = phase shift

  10. Nested .off() for recursive rhythmic complexity
    s("bd sd [rim bd] sd, [~ hh]*4")
      .off(2/16, x=>x.speed(1.5).gain(.25))
      .off(3/16, x=>x.vowel("<a e i o>*8").gain(.2))
    // two restrained, independently timed echoes

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

async function generateWithAI(text, genre, apiKey, signal) {
  var provider = getProvider();
  if (provider === 'gemini') return generateWithGemini(text, genre, apiKey, signal);
  if (provider === 'openai') return generateWithOpenAI(text, genre, apiKey, signal);
  return generateWithClaude(text, genre, apiKey, signal);
}

async function generateWithClaude(text, genre, apiKey, signal) {
  var textResult = await callLLM({
    provider: 'claude', apiKey: apiKey, system: STRUDEL_SYSTEM_PROMPT,
    user: buildVariationPrompt(text, genre),
    temperature: Math.min(1.2, 0.9 + seedCounter * 0.05),
    signal: signal,
  });
  return validateAndFix(stripFences(textResult));
}

async function generateWithGemini(text, genre, apiKey, signal) {
  var textResult = await callLLM({
    provider: 'gemini', apiKey: apiKey, system: STRUDEL_SYSTEM_PROMPT,
    user: buildVariationPrompt(text, genre), temperature: 1.0,
    topP: Math.min(0.99, 0.9 + seedCounter * 0.02),
    signal: signal,
  });
  return validateAndFix(stripFences(textResult));
}

async function generateWithOpenAI(text, genre, apiKey, signal) {
  var textResult = await callLLM({
    provider: 'openai', apiKey: apiKey, system: STRUDEL_SYSTEM_PROMPT,
    user: buildVariationPrompt(text, genre),
    temperature: Math.min(1.2, 0.9 + seedCounter * 0.05),
    signal: signal,
  });
  return validateAndFix(stripFences(textResult));
}

function validateAndFix(code) {
  var cleaned = normalize(stripFences(String(code || ''))).trim();
  if (!cleaned) throw new Error('The model returned empty Strudel code');
  if (!/\bsetcp[ms]\s*\(/.test(cleaned)) cleaned = 'setcpm(90/4)\n\n' + cleaned;
  return cleaned;
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

// ---- Dynamic error recovery: parse error → fix → retry ----
function tryFixFromError(code, errorMsg) {
  // "X is not defined" → known substitutions or remove the call
  var notDefined = errorMsg.match(/(\w+) is not defined/);
  if (notDefined) {
    var name = notDefined[1];
    // known substitutions
    if (/^set[Bb][Pp][Mm]$/.test(name)) {
      return code.replace(/set[Bb][Pp][Mm]\s*\(\s*([^)]+)\)/g, function(m, inner) {
        return 'setcpm(' + (inner.trim().indexOf('/4') !== -1 ? inner.trim() : inner.trim() + '/4') + ')';
      });
    }
    if (name === 'line' || name === 'ramp') {
      return code.replace(new RegExp('\\b' + name + '\\s*\\(\\s*([^,]+),\\s*([^,]+),\\s*([^)]+)\\)', 'g'), 'saw.range($1,$2).slow($3)');
    }
    // generic: comment out lines containing the undefined name
    return code.split('\n').map(function(l) {
      // don't comment out lines that are already comments
      if (l.trim().indexOf('//') === 0) return l;
      if (l.indexOf(name) !== -1) return '// [auto-disabled: ' + name + ' not defined] ' + l;
      return l;
    }).join('\n');
  }

  // "X is not a function" → known substitutions or remove the .X() call
  var notFunc = errorMsg.match(/(\w+) is not a function/);
  if (notFunc) {
    var fn = notFunc[1];
    var subs = { stutter: 'ply', fadeIn: 'gain', fadeOut: 'gain', after: 'late' };
    if (subs[fn]) {
      return code.replace(new RegExp('\\.' + fn + '\\s*\\(', 'g'), '.' + subs[fn] + '(');
    }
    // unknown function: strip the .fn(...) call entirely
    return code.replace(new RegExp('\\.' + fn + '\\s*\\([^)]*\\)', 'g'), '');
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

// ---- Editor Integration (sandboxed iframe + one-time MessagePort RPC) ----
var EDITOR_RPC_TIMEOUT_MS = 5000;
var EDITOR_READY_TIMEOUT_MS = 20000;
var EDITOR_MAX_PAYLOAD_BYTES = 256 * 1024;
/** @type {HTMLIFrameElement|null} */
var editorFrame = /** @type {HTMLIFrameElement|null} */ (document.getElementById('strudelFrame'));

function EditorPort(frame) {
  this.frame = frame;
  this.frameLoaded = !frame || !frame.getAttribute || !frame.getAttribute('src');
  this.hostSession = null;
  this.port = null;
  this.initialized = false;
  this.isReady = false;
  this.requestSeq = 0;
  this.revision = 0;
  this.activeRevision = 0;
  this.connectionEpoch = 0;
  this.pending = new Map();
  this.readyWaiters = [];
  this.queue = Promise.resolve();
  this.evalErrorHandler = null;
}

function editorMessageBytes(value) {
  var serialized;
  try { serialized = JSON.stringify(value); } catch (_) { return Infinity; }
  return typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(serialized).byteLength
    : serialized.length;
}

function editorTextBytes(value) {
  return typeof TextEncoder !== 'undefined'
    ? new TextEncoder().encode(value).byteLength
    : value.length;
}

function hasExactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).sort().join(',') === expected.slice().sort().join(',');
}

EditorPort.prototype._failReady = function(error) {
  var waiters = this.readyWaiters.splice(0);
  waiters.forEach(function(waiter) { waiter.reject(error); });
};

EditorPort.prototype._resetConnection = function(error) {
  this.connectionEpoch++;
  this.initialized = false;
  this.isReady = false;
  if (this.port) {
    try { this.port.onmessage = null; this.port.close(); } catch (_) {}
  }
  this.port = null;
  this.pending.forEach(function(pending) {
    clearTimeout(pending.timer);
    pending.reject(error);
  });
  this.pending.clear();
  this._failReady(error);
};

EditorPort.prototype.initialize = function(force) {
  if (!this.frameLoaded) return;
  if (!this.frame || !this.frame.contentWindow || typeof MessageChannel === 'undefined') return;
  if (this.initialized && !force) return;
  if (this.initialized || this.port) {
    this._resetConnection(new Error('Editor connection reloaded'));
  }
  this.initialized = true;
  var channel = new MessageChannel();
  var self = this;
  var activePort = channel.port1;
  this.port = activePort;
  activePort.onmessage = function(event) {
    if (self.port === activePort) self._onPortMessage(event.data || {});
  };
  if (typeof activePort.start === 'function') activePort.start();
  try {
    this.frame.contentWindow.postMessage({ type: 'strudel:init' }, '*', [channel.port2]);
  } catch (error) {
    this._resetConnection(error);
  }
};

EditorPort.prototype._rejectProtocolMessage = function(message, reason) {
  // Invalid capability traffic is ignored. The matching request remains
  // pending until an exact response arrives or its bounded deadline expires.
  return;
};

EditorPort.prototype._onPortMessage = function(message) {
  if (message && message.type === 'ready') {
    if (!hasExactKeys(message, ['type'])) return;
    this.isReady = true;
    var waiters = this.readyWaiters.splice(0);
    waiters.forEach(function(waiter) { waiter.resolve(); });
    return;
  }
  if (message && message.type === 'error') {
    if (!hasExactKeys(message, ['type', 'kind', 'revision', 'error']) ||
        message.kind !== 'initialization' || typeof message.error !== 'string' ||
        editorTextBytes(message.error) > 4096) return;
    this._failReady(new Error(message.error));
    return;
  }
  if (message && message.type === 'event') {
    if (!hasExactKeys(message, ['type', 'name', 'revision', 'detail']) ||
        message.name !== 'evalError' || !Number.isSafeInteger(message.revision) ||
        !hasExactKeys(message.detail, ['message']) || typeof message.detail.message !== 'string' ||
        editorTextBytes(message.detail.message) > 4096) return;
    if (message.revision !== this.activeRevision) return;
    if (this.evalErrorHandler) this.evalErrorHandler(message.detail);
    return;
  }
  if (!message || message.type !== 'result') return;
  var baseKeys = ['type', 'id', 'command', 'revision', 'ok'];
  var keys = message.ok === true
    ? (message.command === 'getCode' ? baseKeys.concat('result') : baseKeys)
    : baseKeys.concat('error');
  if (!hasExactKeys(message, keys) ||
      typeof message.id !== 'string' ||
      typeof message.command !== 'string' || !Number.isSafeInteger(message.revision) ||
      typeof message.ok !== 'boolean') {
    this._rejectProtocolMessage(message, 'schema');
    return;
  }
  if (message.ok && message.command === 'getCode' &&
      (typeof message.result !== 'string' || editorTextBytes(message.result) > EDITOR_MAX_PAYLOAD_BYTES)) {
    this._rejectProtocolMessage(message, 'result');
    return;
  }
  if (!message.ok && (typeof message.error !== 'string' || editorTextBytes(message.error) > 4096)) {
    this._rejectProtocolMessage(message, 'error');
    return;
  }
  var pending = this.pending.get(String(message.id));
  if (!pending) return;
  if (message.revision !== pending.revision || message.command !== pending.command) {
    this._rejectProtocolMessage(message, 'identity');
    return;
  }
  clearTimeout(pending.timer);
  this.pending.delete(String(message.id));
  if (message.ok) pending.resolve(message.result);
  else pending.reject(new Error(message.error));
};

EditorPort.prototype._waitUntilReady = function(deadline) {
  if (this.isReady) return Promise.resolve();
  this.initialize(false);
  var self = this;
  return new Promise(function(resolve, reject) {
    var remaining = deadline - Date.now();
    if (remaining <= 0) return reject(new Error('Editor readiness timeout'));
    var waiter = { resolve: resolve, reject: reject };
    self.readyWaiters.push(waiter);
    var timer = setTimeout(function() {
      var index = self.readyWaiters.indexOf(waiter);
      if (index !== -1) self.readyWaiters.splice(index, 1);
      reject(new Error('Editor readiness timeout'));
    }, remaining);
    var originalResolve = waiter.resolve;
    waiter.resolve = function() { clearTimeout(timer); originalResolve(undefined); };
    var originalReject = waiter.reject;
    waiter.reject = function(error) { clearTimeout(timer); originalReject(error); };
  });
};

EditorPort.prototype._validatePayload = function(payload) {
  if (editorMessageBytes(payload == null ? null : payload) > EDITOR_MAX_PAYLOAD_BYTES) {
    throw new Error('Editor payload exceeds 256 KiB');
  }
};

EditorPort.prototype._sendCommand = function(command, payload, revision, deadline, expectedConnection) {
  var self = this;
  return this._waitUntilReady(deadline).then(function() {
    if (self.connectionEpoch !== expectedConnection) throw new Error('Editor connection changed');
    var remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error('Editor command timeout: ' + command);
    if (!self.port) throw new Error('Editor port unavailable');
    return new Promise(function(resolve, reject) {
      var id = String(++self.requestSeq);
      var timer = setTimeout(function() {
        self.pending.delete(id);
        reject(new Error('Editor command timeout: ' + command));
      }, remaining);
      self.pending.set(id, {
        resolve: resolve, reject: reject, timer: timer,
        revision: revision, command: command,
      });
      try {
        self.port.postMessage({
          type: 'command', id: id, command: command,
          revision: revision, payload: payload == null ? null : payload,
        });
      } catch (error) {
        clearTimeout(timer);
        self.pending.delete(id);
        reject(error);
      }
    });
  });
};

EditorPort.prototype._enqueue = function(work, deadline, expectedConnection) {
  var self = this;
  var operation = function() {
    if (Date.now() >= deadline) throw new Error('Editor transaction timeout');
    if (self.connectionEpoch !== expectedConnection) throw new Error('Editor connection changed');
    return work();
  };
  var result = this.queue.catch(function() {}).then(operation);
  this.queue = result.catch(function() {});
  return result;
};

EditorPort.prototype._command = function(command, payload, revision) {
  try { this._validatePayload(payload); }
  catch (error) { return Promise.reject(error); }
  var waitingForFirstReady = !this.isReady;
  var readinessDeadline = Date.now() +
    (waitingForFirstReady ? EDITOR_READY_TIMEOUT_MS : EDITOR_RPC_TIMEOUT_MS);
  var transactionDeadline = readinessDeadline +
    (waitingForFirstReady ? EDITOR_RPC_TIMEOUT_MS : 0);
  var expectedConnection = this.connectionEpoch;
  var self = this;
  return this._enqueue(async function() {
    self.activeRevision = revision;
    await self._waitUntilReady(readinessDeadline);
    var rpcDeadline = Math.min(transactionDeadline, Date.now() + EDITOR_RPC_TIMEOUT_MS);
    return self._sendCommand(command, payload, revision, rpcDeadline, expectedConnection);
  }, transactionDeadline, expectedConnection);
};

EditorPort.prototype.ready = function() {
  return this._waitUntilReady(Date.now() + EDITOR_READY_TIMEOUT_MS);
};
EditorPort.prototype.getCode = function() {
  return this._command('getCode', null, this.activeRevision).then(function(result) {
    if (typeof result === 'string') return result;
    throw new Error('Editor returned malformed code');
  });
};
EditorPort.prototype.setCode = function(code) {
  this.revision++;
  return this._command('setCode', { code: String(code) }, this.revision);
};
EditorPort.prototype.evaluate = function() {
  return this._command('evaluate', null, this.activeRevision);
};
EditorPort.prototype.replaceAndEvaluate = function(code) {
  this.revision++;
  var revision = this.revision;
  var payload = { code: String(code) };
  try { this._validatePayload(payload); }
  catch (error) { return Promise.reject(error); }
  var waitingForFirstReady = !this.isReady;
  var readinessDeadline = Date.now() +
    (waitingForFirstReady ? EDITOR_READY_TIMEOUT_MS : EDITOR_RPC_TIMEOUT_MS);
  var transactionDeadline = readinessDeadline +
    (waitingForFirstReady ? EDITOR_RPC_TIMEOUT_MS : 0);
  var expectedConnection = this.connectionEpoch;
  var self = this;
  return this._enqueue(async function() {
    self.activeRevision = revision;
    await self._waitUntilReady(readinessDeadline);
    var rpcDeadline = Math.min(transactionDeadline, Date.now() + EDITOR_RPC_TIMEOUT_MS);
    await self._sendCommand('setCode', payload, revision, rpcDeadline, expectedConnection);
    return self._sendCommand('evaluate', null, revision, rpcDeadline, expectedConnection);
  }, transactionDeadline, expectedConnection);
};
EditorPort.prototype.stop = function() {
  return this._command('stop', null, this.activeRevision);
};

var editorPort = new EditorPort(editorFrame);
if (editorFrame && typeof editorFrame.addEventListener === 'function') {
  editorFrame.addEventListener('load', function() {
    editorPort.frameLoaded = true;
    if (!editorFrame.getAttribute || !editorFrame.getAttribute('src')) {
      editorPort.initialize(editorPort.initialized);
    }
  });
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('message', function(event) {
    if (!editorFrame || event.source !== editorFrame.contentWindow) return;
    var message = event.data || {};
    if (hasExactKeys(message, ['type', 'session']) &&
        message.type === 'strudel:bootstrap' &&
        typeof message.session === 'string' &&
        /^[a-f0-9]{32}$/.test(message.session)) {
      editorPort.frameLoaded = true;
      if (editorPort.hostSession === message.session) {
        editorPort.initialize(false);
        return;
      }
      var replacingSession = editorPort.hostSession !== null;
      editorPort.hostSession = message.session;
      editorPort.initialize(replacingSession || editorPort.initialized);
    }
  });
}
if (editorFrame && editorFrame.contentWindow &&
    (!editorFrame.getAttribute || !editorFrame.getAttribute('src'))) {
  editorPort.initialize(false);
}

function getEditor() { return editorPort; }
function getEditorCode() { return editorPort.getCode(); }

var MAX_FIX_ATTEMPTS = 3;
var editorFixAttempt = 0;
var lastEvaluatedCode = '';
var operationEpoch = 0;
var operationController = null;
var focusedActionEpoch = 0;
var focusedActionQueue = Promise.resolve();
var playbackStopped = false;

function releaseOperationLocks() {
  var playButton = /** @type {HTMLButtonElement|null} */ (document.getElementById('playBtn'));
  var regenButton = /** @type {HTMLButtonElement|null} */ (document.getElementById('regenBtn'));
  var editButton = /** @type {HTMLButtonElement|null} */ (document.getElementById('editApply'));
  if (playButton) playButton.disabled = false;
  if (regenButton) regenButton.disabled = false;
  if (editButton) editButton.disabled = false;
}

function beginExclusiveOperation() {
  releaseOperationLocks();
  operationEpoch++;
  focusedActionEpoch++;
  if (operationController) {
    try { operationController.abort(); } catch (_) {}
  }
  operationController = new AbortController();
  return { kind: 'exclusive', epoch: operationEpoch, signal: operationController.signal };
}

function invalidateExclusiveOperation() {
  releaseOperationLocks();
  operationEpoch++;
  focusedActionEpoch++;
  if (operationController) {
    try { operationController.abort(); } catch (_) {}
  }
  operationController = null;
}

function isOperationCurrent(operation) {
  if (!operation) return true;
  if (operation.kind === 'focused') return operation.epoch === focusedActionEpoch;
  return operation.epoch === operationEpoch &&
    !(operation.signal && operation.signal.aborted);
}

function isAbortError(error) {
  return error && (error.name === 'AbortError' || /abort/i.test(String(error.message || error)));
}

function setEditorStatus(className, text) {
  var status = document.getElementById('status');
  if (!status) return;
  status.className = className;
  status.textContent = text;
}

async function setCodeAndPlay(code, operation) {
  if (!isOperationCurrent(operation)) return false;
  code = normalize(code);
  updateMixerAvailability(code);
  lastEvaluatedCode = code;
  editorFixAttempt = 0;
  playbackStopped = false;
  var btn = /** @type {HTMLButtonElement|null} */ (document.getElementById('playBtn'));
  if (btn) btn.disabled = true;
  setEditorStatus('status', 'Loading editor...');
  try {
    setEditorStatus('status', 'Evaluating...');
    await editorPort.replaceAndEvaluate(code);
    if (!isOperationCurrent(operation)) return false;
    setEditorStatus('status playing', 'Playing');
    return true;
  } catch (error) {
    if (isOperationCurrent(operation)) {
      setEditorStatus('status error', 'Editor error: ' + error.message.substring(0, 100));
    }
    return false;
  } finally {
    if (btn && isOperationCurrent(operation)) btn.disabled = false;
  }
}

editorPort.evalErrorHandler = async function(detail) {
  if (playbackStopped) return;
  var fixOperation = { kind: 'exclusive', epoch: operationEpoch,
    signal: operationController && operationController.signal };
  var sourceRevision = editorPort.activeRevision;
  var sourceCode = lastEvaluatedCode;
  var errorMessage = typeof detail === 'string' ? detail :
    ((detail && (detail.message || detail.error)) || 'unknown error');
  if (editorFixAttempt >= MAX_FIX_ATTEMPTS) {
    setEditorStatus('status error', 'Error: ' + String(errorMessage).substring(0, 100));
    return;
  }
  editorFixAttempt++;
  setEditorStatus('status error', 'Error: ' + String(errorMessage).substring(0, 80) + ' — fixing...');
  var fixedCode = null;
  var apiKey = getApiKey();
  if (apiKey) {
    try { fixedCode = await fixWithLLM(sourceCode, String(errorMessage), apiKey, fixOperation.signal); }
    catch (_) { fixedCode = null; }
  }
  if (!isOperationCurrent(fixOperation) || playbackStopped ||
      editorPort.activeRevision !== sourceRevision) return;
  var liveCode;
  try { liveCode = await getEditorCode(); } catch (_) { return; }
  if (!isOperationCurrent(fixOperation) || liveCode !== sourceCode) return;
  if (!fixedCode) fixedCode = tryFixFromError(sourceCode, String(errorMessage));
  if (!fixedCode || fixedCode === sourceCode) {
    setEditorStatus('status error', 'Error: ' + String(errorMessage).substring(0, 100));
    return;
  }
  lastEvaluatedCode = normalize(fixedCode);
  try {
    await editorPort.replaceAndEvaluate(lastEvaluatedCode);
    setEditorStatus('status playing', 'Playing (fixed ' + editorFixAttempt + 'x)');
  } catch (error) {
    setEditorStatus('status error', 'Editor error: ' + error.message.substring(0, 100));
  }
};

// ---- LLM error fix: send code + error → get fixed code ----
async function fixWithLLM(code, errorMsg, apiKey, signal) {
  var prompt = 'This Strudel code has an error:\n\n' + code + '\n\nError: ' + errorMsg + '\n\nFix ONLY the error. Return the complete fixed code. No explanation.';
  try {
    var result = await callLLM({
      provider: getProvider(), apiKey: apiKey,
      system: 'You fix Strudel live-coding errors. Output ONLY the fixed code, no explanation.',
      user: prompt, temperature: getProvider() === 'gemini' ? 1.0 : 0.2,
      signal: signal,
    });
    return stripFences(result);
  } catch (_) {
    return null;
  }
}

async function stopPlayback() {
  invalidateExclusiveOperation();
  playbackStopped = true;
  try { await editorPort.stop(); } catch (_) {}
  setEditorStatus('status', 'Stopped');
  var playButton = /** @type {HTMLButtonElement|null} */ (document.getElementById('playBtn'));
  var regenButton = /** @type {HTMLButtonElement|null} */ (document.getElementById('regenBtn'));
  if (playButton) playButton.disabled = false;
  if (regenButton) regenButton.disabled = false;
}

// ---- UI Wiring ----
var selectedGenre = 'edm';
var fusionMode = false;
var fusionGenres = [];
var lastInput = '';

var genreBtns = /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('.genre-btn'));
var fusionCheck = /** @type {HTMLInputElement} */ (document.getElementById('fusionCheck'));

function updateGenreUI() {
  genreBtns.forEach(function(b) {
    var pressed = false;
    if (fusionMode) {
      b.classList.remove('active');
      if (fusionGenres.indexOf(b.dataset.genre) !== -1) {
        b.classList.add('fusion-pick');
        pressed = true;
      } else {
        b.classList.remove('fusion-pick');
      }
    } else {
      b.classList.remove('fusion-pick');
      pressed = b.dataset.genre === selectedGenre;
      b.classList.toggle('active', pressed);
    }
    b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
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
  resetVariationState();
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
    resetVariationState();
    updateGenreUI();
  });
});

function getEffectiveGenre() {
  if (fusionMode && fusionGenres.length >= 2) return 'fusion:' + fusionGenres.join('+');
  if (fusionMode && fusionGenres.length === 1) return fusionGenres[0];
  return selectedGenre;
}

function updateCompositionMeta(plan, mode) {
  var meta = document.getElementById('compositionMeta');
  if (!meta) return;
  if (!plan) {
    meta.textContent = mode === 'ai'
      ? 'AI take ' + (seedCounter + 1) + ' · use Edit for focused musical changes'
      : '';
    return;
  }
  updateVariationAvailability(plan);
  var focus = lastVariationFocus === 'base' ? 'original' : lastVariationFocus.replace('all', 'new take');
  meta.textContent = 'Take ' + (seedCounter + 1) + ' · ' + plan.key + ' ' + plan.scale.replace(/:/g, ' ') +
    ' · ' + plan.tempo + ' BPM · ' + plan.profileName + ' · ' + focus;
}

function updateVariationAvailability(plan) {
  /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('.variation-btn')).forEach(function(btn) {
    var available = Boolean(plan && (btn.dataset.variation !== 'groove' || plan.drums));
    btn.disabled = !available;
    btn.setAttribute('aria-disabled', available ? 'false' : 'true');
  });
}

function setAlgorithmControlsVisible(visible) {
  var variations = document.getElementById('variationPanel');
  if (variations) variations.style.display = visible ? 'flex' : 'none';
  if (!visible) document.getElementById('algoMixer').style.display = 'none';
}

// shared generate function
async function doGenerate() {
  var text = /** @type {HTMLInputElement} */ (document.getElementById('input')).value.trim();
  if (!text) {
    document.getElementById('status').className = 'status error';
    document.getElementById('status').textContent = 'Type something first';
    return;
  }
  var operation = beginExclusiveOperation();

  // reset seed when input text changes
  if (text !== lastInput) {
    seedCounter = 0;
    resetVariationState();
    lastInput = text;
  }

  var genre = getEffectiveGenre();
  var apiKey = getApiKey();
  var statusEl = document.getElementById('status');
  var ew = document.getElementById('editorWrap');
  ew.classList.remove('hidden');
  ew.classList.add('visible');
  // Show controls based on API key
  if (getApiKey()) {
    document.getElementById('editRow').style.display = 'flex';
    setAlgorithmControlsVisible(false);
    // mixer hidden by default in LLM mode, toggled by mixer button
  } else {
    document.getElementById('algoMixer').style.display = 'flex';
    setAlgorithmControlsVisible(true);
  }

  if (apiKey) {
    // ---- Claude/Gemini creative mode ----
    var triggeringRevision = editorPort.activeRevision;
    var triggeringCode = null;
    try { triggeringCode = await getEditorCode(); } catch (_) {}
    if (!isOperationCurrent(operation)) return;
    lastCompositionPlan = null;
    updateCompositionMeta(null, 'ai');
    /** @type {HTMLButtonElement} */ (document.getElementById('playBtn')).disabled = true;
    /** @type {HTMLButtonElement} */ (document.getElementById('regenBtn')).disabled = true;
    statusEl.className = 'status';
    var prov = getProvider();
    var temp = prov === 'gemini' ? Math.min(1.5, 0.9 + seedCounter * 0.08) : Math.min(1.2, 0.9 + seedCounter * 0.05);
    statusEl.textContent = (prov === 'gemini' ? 'Gemini' : prov === 'openai' ? 'OpenAI' : 'Claude') + ' is composing... (seed ' + seedCounter + ', temp ' + temp.toFixed(2) + ')';
    try {
      var code = await generateWithAI(text, genre, apiKey, operation.signal);
      if (!isOperationCurrent(operation) || editorPort.activeRevision !== triggeringRevision) return;
      if (triggeringCode !== null) {
        var liveCode = await getEditorCode();
        if (!isOperationCurrent(operation) || liveCode !== triggeringCode) return;
      }
      await setCodeAndPlay(code, operation);
    } catch (e) {
      if (!isOperationCurrent(operation) || isAbortError(e)) return;
      if (editorPort.activeRevision !== triggeringRevision) return;
      if (triggeringCode !== null) {
        try {
          var fallbackLiveCode = await getEditorCode();
          if (!isOperationCurrent(operation) || fallbackLiveCode !== triggeringCode) return;
        } catch (_) { return; }
      }
      statusEl.className = 'status error';
      statusEl.textContent = 'API error: ' + e.message + ' — falling back to algorithm';
      var fallback = generateCode(text, genre);
      updateCompositionMeta(lastCompositionPlan, 'algorithmic');
      updateMixerAvailability(fallback);
      setAlgorithmControlsVisible(true);
      document.getElementById('algoMixer').style.display = 'flex';
      await setCodeAndPlay(fallback, operation);
    } finally {
      if (isOperationCurrent(operation)) {
        /** @type {HTMLButtonElement} */ (document.getElementById('playBtn')).disabled = false;
        /** @type {HTMLButtonElement} */ (document.getElementById('regenBtn')).disabled = false;
      }
    }
  } else {
    // ---- Algorithmic mode ----
    statusEl.textContent = 'Algorithmic mode (seed ' + seedCounter + ')';
    var algorithmCode = generateCode(text, genre);
    updateCompositionMeta(lastCompositionPlan, 'algorithmic');
    updateMixerAvailability(algorithmCode);
    await setCodeAndPlay(algorithmCode, operation);
  }
}

async function doFocusedVariation(focus, operation) {
  if (!operation) {
    var queuedState = copyVariationState(variationState);
    var queuedOperation = { kind: 'focused', epoch: focusedActionEpoch };
    focusedActionQueue = focusedActionQueue.catch(function() {}).then(async function() {
      if (!isOperationCurrent(queuedOperation)) return;
      variationState = copyVariationState(queuedState);
      await doFocusedVariation(focus, queuedOperation);
    });
    return focusedActionQueue;
  }
  if (!isOperationCurrent(operation)) return;
  var text = /** @type {HTMLInputElement} */ (document.getElementById('input')).value.trim();
  var genre = getEffectiveGenre();
  if (!lastCompositionPlan || lastCompositionPlan.source !== 'algorithmic' ||
      lastCompositionPlan.text !== text.normalize('NFKC') || lastCompositionPlan.genreName !== genre) {
    await doGenerate();
    return;
  }
  var currentCode;
  try { currentCode = await getEditorCode(); }
  catch (_) { await doGenerate(); return; }
  if (!isOperationCurrent(operation)) return;
  var code = generateFocusedVariationCode(focus, currentCode);
  updateCompositionMeta(lastCompositionPlan, 'algorithmic');
  updateMixerAvailability(code);
  await setCodeAndPlay(code, operation);
}

document.getElementById('playBtn').addEventListener('click', function() {
  seedCounter = 0;
  resetVariationState();
  doGenerate();
});

document.getElementById('regenBtn').addEventListener('click', function() {
  if (getApiKey()) {
    seedCounter++;
    lastVariationFocus = 'all';
  } else {
    advanceVariation('all');
  }
  doGenerate();
});

/** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('.variation-btn')).forEach(function(btn) {
  btn.addEventListener('click', function() {
    if (!lastCompositionPlan || lastCompositionPlan.source !== 'algorithmic') return;
    operationEpoch++;
    releaseOperationLocks();
    if (operationController) {
      try { operationController.abort(); } catch (_) {}
      operationController = null;
    }
    var action = { kind: 'focused', epoch: focusedActionEpoch };
    var focus = btn.dataset.variation;
    focusedActionQueue = focusedActionQueue.catch(function() {}).then(async function() {
      if (!isOperationCurrent(action)) return;
      advanceVariation(focus);
      await doFocusedVariation(focus, action);
    });
  });
});

document.getElementById('runBtn').addEventListener('click', async function() {
  var operation = beginExclusiveOperation();
  try {
    var currentCode = normalize(await getEditorCode());
    if (!isOperationCurrent(operation)) return;
    lastEvaluatedCode = currentCode;
    playbackStopped = false;
    await editorPort.evaluate();
    if (!isOperationCurrent(operation)) return;
    document.getElementById('status').className = 'status playing';
    document.getElementById('status').textContent = 'Playing';
  } catch (_) {
    setEditorStatus('status error', 'Editor not responding');
  }
});

document.getElementById('stopBtn').addEventListener('click', stopPlayback);

// ---- API Key UI ----
(function() {
  var keyInput = /** @type {HTMLInputElement} */ (document.getElementById('apiKey'));
  var provSelect = /** @type {HTMLSelectElement} */ (document.getElementById('apiProvider'));
  var hint = document.getElementById('apiHint');

  var apiDetails = /** @type {HTMLDetailsElement} */ (document.getElementById('apiSettings'));
  var persistInput = /** @type {HTMLInputElement|null} */ (document.getElementById('apiPersist'));
  var apiMode = document.getElementById('apiMode');

  function setApiState(state) {
    apiDetails.classList.remove('verified', 'invalid', 'no-key');
    apiDetails.classList.add(state);
  }

  function updateStorageCopy() {
    if (!persistInput || !apiMode) return;
    var committedPersist = getApiKeyPersist(provSelect.value);
    var pendingPersist = persistInput.checked && !committedPersist;
    apiMode.textContent = committedPersist
      ? 'Persisted on this device in plaintext localStorage. Use only on a trusted profile.'
      : pendingPersist
        ? 'Pending persistence. Press Save to verify and store this key on this device.'
        : 'Session only. Held in memory and cleared when this page is closed or reloaded.';
    apiMode.setAttribute('data-mode', committedPersist ? 'persist' : pendingPersist ? 'pending' : 'session');
  }

  function refreshProviderUI() {
    var prov = provSelect.value;
    keyInput.placeholder = prov === 'gemini' ? 'AIza...' : prov === 'openai' ? 'sk-...' : 'sk-ant-...';
    var key = getApiKey(prov);
    keyInput.value = key;
    if (persistInput) {
      persistInput.checked = getApiKeyPersist(prov);
      persistInput.setAttribute('data-confirmed', persistInput.checked ? '1' : '0');
    }
    updateStorageCopy();
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

  // restore saved state
  provSelect.value = getProvider();
  refreshProviderUI();

  // swap key display when provider changes
  provSelect.addEventListener('change', function() {
    saveProvider(provSelect.value);
    refreshProviderUI();
  });

  // save + verify
  async function doSaveKey() {
    var key = keyInput.value.trim();
    var prov = provSelect.value;
    var persist = !!(persistInput && persistInput.checked);

    if (!key) {
      saveApiKey('', prov);
      setVerified(prov, false);
      saveProvider(prov);
      if (persistInput) {
        persistInput.checked = getApiKeyPersist(prov);
        persistInput.setAttribute('data-confirmed', '0');
      }
      updateStorageCopy();
      hint.textContent = 'Cleared. Algorithmic mode.';
      hint.className = 'api-hint';
      setApiState('no-key');
      return;
    }

    if (persist && !getApiKeyPersist(prov) &&
        persistInput.getAttribute('data-confirmed') !== '1') {
      var persistenceConfirmed = typeof window.confirm === 'function' && window.confirm(
        'Persist this API key in plaintext localStorage on this device?'
      );
      if (!persistenceConfirmed) {
        persistInput.checked = false;
        updateStorageCopy();
        return;
      }
      persistInput.setAttribute('data-confirmed', '1');
    }

    hint.textContent = 'Verifying...';
    hint.className = 'api-hint';

    try {
      if (prov === 'gemini') {
        var resp = await fetchWithTimeout(
          'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key),
          {}, VERIFY_TIMEOUT_MS);
        var data = await readJsonResponse(resp, 'Gemini');
        if (!data || !Array.isArray(data.models)) throw new Error('Gemini: malformed models response');
      } else if (prov === 'openai') {
        var resp = await fetchWithTimeout('https://api.openai.com/v1/models', {
          headers: { 'Authorization': 'Bearer ' + key },
        }, VERIFY_TIMEOUT_MS);
        var data = await readJsonResponse(resp, 'OpenAI');
        if (!data || !Array.isArray(data.data)) throw new Error('OpenAI: malformed models response');
      } else {
        var resp = await fetchWithTimeout('https://api.anthropic.com/v1/models', {
          headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true' },
        }, VERIFY_TIMEOUT_MS);
        var data = await readJsonResponse(resp, 'Claude');
        if (!data || !Array.isArray(data.data)) throw new Error('Claude: malformed models response');
      }

      saveApiKey(key, prov, persist);
      setVerified(prov, true);
      saveProvider(prov);
      if (persistInput) persistInput.checked = getApiKeyPersist(prov);
      updateStorageCopy();
      hint.textContent = (prov === 'gemini' ? 'Gemini' : prov === 'openai' ? 'OpenAI' : 'Claude') +
        ' verified' + (persist ? ' (persisted).' : ' (session only).');
      hint.className = 'api-hint saved';
      setApiState('verified');
    } catch (e) {
      setVerified(prov, false);
      hint.textContent = 'Invalid: ' + e.message;
      hint.className = 'api-hint error';
      setApiState('invalid');
    }
  }

  document.getElementById('apiSave').addEventListener('click', doSaveKey);

  if (persistInput) {
    persistInput.addEventListener('change', function() {
      if (persistInput.checked && !getApiKeyPersist(provSelect.value)) {
        var confirmed = typeof window.confirm === 'function' && window.confirm(
          'Persist this API key in plaintext localStorage on this device?'
        );
        if (!confirmed) persistInput.checked = false;
        else persistInput.setAttribute('data-confirmed', '1');
      }
      if (!persistInput.checked) {
        persistInput.setAttribute('data-confirmed', '0');
        if (getApiKeyPersist(provSelect.value)) {
          var persistedKey = getApiKey(provSelect.value);
          saveApiKey(persistedKey, provSelect.value, false);
        }
      }
      updateStorageCopy();
    });
  }

  // Enter in key input triggers save
  keyInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); doSaveKey(); }
  });

  // Click outside closes details
  document.addEventListener('click', function(e) {
    if (apiDetails.open && !apiDetails.contains(/** @type {Node|null} */ (e.target))) {
      apiDetails.open = false;
    }
  });
})();

// ---- Algorithmic Refine: modify existing code values ----
function adjustCutoff(code, factor) {
  var changed = code.replace(/\.lpf\s*\(\s*(\d+)\s*\)/g, function(match, cutoff) {
    var next = factor > 1
      ? Math.min(12000, Math.round(parseInt(cutoff) * factor))
      : Math.max(100, Math.round(parseInt(cutoff) * factor));
    return '.lpf(' + next + ')';
  });
  return changed.replace(/\.lpf\s*\(\s*sine\.range\(\s*(\d+)\s*,\s*(\d+)\s*\)/g, function(match, low, high) {
    var nextLow = factor > 1 ? Math.min(10000, Math.round(parseInt(low) * factor)) : Math.max(100, Math.round(parseInt(low) * factor));
    var nextHigh = factor > 1 ? Math.min(12000, Math.round(parseInt(high) * factor)) : Math.max(nextLow + 100, Math.round(parseInt(high) * factor));
    return '.lpf(sine.range(' + nextLow + ',' + nextHigh + ')';
  });
}

function changeTempo(code, delta) {
  return code.replace(/setcpm\s*\(\s*(\d+)\s*\/\s*4\s*\)/, function(match, bpm) {
    var next = Math.max(40, Math.min(400, parseInt(bpm) + delta));
    if (lastCompositionPlan) lastCompositionPlan.tempo = next;
    return 'setcpm(' + next + '/4)';
  }).replace(/(\/\/ identity:.* · )\d+( BPM)/, function(match, before, after) {
    return before + (lastCompositionPlan ? lastCompositionPlan.tempo : match.match(/\d+/)[0]) + after;
  });
}

function algoRefine(code, direction) {
  switch (direction) {
    case 'faster':
      return changeTempo(code, 8);
    case 'slower':
      return changeTempo(code, -8);
    case 'louder':
      return code.replace(/\.gain\s*\(\s*([\d.]+)\s*\)/g, function(m, g) {
        return '.gain(' + Math.min(1, (parseFloat(g) * 1.15)).toFixed(2) + ')';
      });
    case 'quieter':
      return code.replace(/\.gain\s*\(\s*([\d.]+)\s*\)/g, function(m, g) {
        return '.gain(' + Math.max(0.05, (parseFloat(g) * 0.85)).toFixed(2) + ')';
      });
    case 'brighter':
      return adjustCutoff(code, 1.4);
    case 'darker':
      return adjustCutoff(code, .6);
    case 'more reverb':
      return code.replace(/\.room\s*\(\s*([\d.]+)\s*\)/g, function(m, r) {
        return '.room(' + Math.min(1, (parseFloat(r) + 0.15)).toFixed(2) + ')';
      });
    case 'drier':
      return code.replace(/\.room\s*\(\s*([\d.]+)\s*\)/g, function(m, r) {
        return '.room(' + Math.max(0, (parseFloat(r) - 0.15)).toFixed(2) + ')';
      });
    // ---- PITCH ----
    case 'higher':
      return shiftPlanRegisters(code, 1);
    case 'lower':
      return shiftPlanRegisters(code, -1);
    // ---- DENSITY ----
    case 'denser':
      return code.replace(/\.struct\s*\(\s*"x\((\d+),(\d+)/g, function(m, k, n) {
        return '.struct("x(' + Math.min(parseInt(n), parseInt(k) + 1) + ',' + n;
      });
    case 'sparser':
      return code.replace(/\.struct\s*\(\s*"x\((\d+),(\d+)/g, function(m, k, n) {
        return '.struct("x(' + Math.max(1, parseInt(k) - 1) + ',' + n;
      });
    // ---- SCALE CHANGE ----
    case 'scale:major':
    case 'scale:minor':
    case 'scale:dorian':
    case 'scale:phrygian':
    case 'scale:lydian':
    case 'scale:pentatonic':
      if (!lastCompositionPlan) return code;
      applyToneToPlan(lastCompositionPlan, direction.replace('scale:', ''));
      return replaceHarmonyAndIdentity(code, lastCompositionPlan);
    // ---- FILTER: resonance & highpass ----
    case 'more resonance':
      return code.replace(/\.lpq\s*\(\s*([\d.]+)\s*\)/g, function(m, q) {
        return '.lpq(' + Math.min(50, parseFloat(q) + 2).toFixed(0) + ')';
      });
    case 'less resonance':
      return code.replace(/\.lpq\s*\(\s*([\d.]+)\s*\)/g, function(m, q) {
        return '.lpq(' + Math.max(0, parseFloat(q) - 2).toFixed(0) + ')';
      });
    case 'more highpass':
      return code.replace(/\.hpf\s*\(\s*(\d+)\s*\)/g, function(m, f) {
        return '.hpf(' + Math.min(8000, Math.round(parseInt(f) * 1.3)) + ')';
      });
    case 'less highpass':
      return code.replace(/\.hpf\s*\(\s*(\d+)\s*\)/g, function(m, f) {
        return '.hpf(' + Math.max(20, Math.round(parseInt(f) * 0.7)) + ')';
      });
    // ---- FX ----
    case 'more delay':
      return code.replace(/\.delay\s*\(\s*([\d.]+)\s*\)/g, function(m, d) {
        return '.delay(' + Math.min(1, (parseFloat(d) + 0.15)).toFixed(2) + ')';
      });
    case 'less delay':
      return code.replace(/\.delay\s*\(\s*([\d.]+)\s*\)/g, function(m, d) {
        return '.delay(' + Math.max(0, (parseFloat(d) - 0.15)).toFixed(2) + ')';
      });
    case 'more feedback':
      return code.replace(/\.delayfeedback\s*\(\s*([\d.]+)\s*\)/g, function(m, f) {
        return '.delayfeedback(' + Math.min(0.95, (parseFloat(f) + 0.1)).toFixed(2) + ')';
      });
    case 'less feedback':
      return code.replace(/\.delayfeedback\s*\(\s*([\d.]+)\s*\)/g, function(m, f) {
        return '.delayfeedback(' + Math.max(0, (parseFloat(f) - 0.1)).toFixed(2) + ')';
      });
    case 'more distortion':
      return code.replace(/\.shape\s*\(\s*([\d.]+)\s*\)/g, function(m, s) {
        var current = parseFloat(s);
        var next = Math.min(1, current + 0.15);
        return next === current ? m : '.shape(' + next.toFixed(2) + ')';
      });
    case 'less distortion':
      return code.replace(/\.shape\s*\(\s*([\d.]+)\s*\)/g, function(m, s) {
        var current = parseFloat(s);
        var next = Math.max(0, current - 0.15);
        return next === current ? m : '.shape(' + next.toFixed(2) + ')';
      });
    case 'more crush':
      return code.replace(/\.crush\s*\(\s*(\d+)\s*\)/g, function(m, c) {
        return '.crush(' + Math.max(1, parseInt(c) - 1) + ')';  // lower = more crushed
      });
    case 'less crush':
      return code.replace(/\.crush\s*\(\s*(\d+)\s*\)/g, function(m, c) {
        return '.crush(' + Math.min(16, parseInt(c) + 1) + ')';  // higher = less crushed
      });
    case 'add swing':
      if (code.indexOf('.swing(') !== -1 || code.indexOf('.bank(') === -1) return code;
      return code.replace(/(\.bank\s*\([^)]*\))/g, '$1\n.swing(4)');
    case 'straighten':
      return code.replace(/\.swing\s*\([^)]*\)/g, '');
    default:
      return code;
  }
}

function canRefineDirection(code, direction) {
  var tempoMatch = code.match(/setcpm\s*\(\s*(\d+)\s*\/\s*4\s*\)/);
  if (direction === 'faster') return Boolean(tempoMatch && parseInt(tempoMatch[1]) < 400);
  if (direction === 'slower') return Boolean(tempoMatch && parseInt(tempoMatch[1]) > 40);
  if (direction === 'higher') return Boolean(lastCompositionPlan && (
    lastCompositionPlan.registers.harmony < 6 || lastCompositionPlan.registers.lead < 7
  ));
  if (direction === 'lower') return Boolean(lastCompositionPlan && (
    lastCompositionPlan.registers.harmony > 2 || lastCompositionPlan.registers.lead > 3
  ));
  if (direction.indexOf('scale:') === 0) {
    if (!lastCompositionPlan) return false;
    var target = direction.replace('scale:', '').replace('pentatonic', 'minor:pentatonic');
    return lastCompositionPlan.scale !== target || lastCompositionPlan.profileName.indexOf('reharmonization') === -1;
  }
  if (direction === 'add swing') return code.indexOf('.bank(') !== -1 && code.indexOf('.swing(') === -1;
  if (direction === 'straighten') return code.indexOf('.swing(') !== -1;
  if (direction.indexOf('make it') === 0) {
    var moodSteps = [];
    if (direction.indexOf('dark') !== -1 || direction.indexOf('moodi') !== -1) {
      moodSteps = ['slower', 'darker', 'lower', 'scale:minor'];
    } else if (direction.indexOf('euphoric') !== -1 || direction.indexOf('uplift') !== -1) {
      moodSteps = ['faster', 'brighter', 'louder', 'scale:lydian', 'more reverb'];
    } else if (direction.indexOf('dreamy') !== -1 || direction.indexOf('float') !== -1) {
      moodSteps = ['slower', 'darker', 'more reverb', 'more delay', 'scale:pentatonic'];
    } else if (direction.indexOf('aggressive') !== -1 || direction.indexOf('intense') !== -1) {
      moodSteps = ['faster', 'louder', 'more distortion', 'denser', 'more resonance', 'scale:phrygian'];
    }
    return moodSteps.some(function(step) { return canRefineDirection(code, step); });
  }
  return algoRefine(code, direction) !== code;
}

function updateMixerAvailability(code) {
  /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('.refine-btn')).forEach(function(btn) {
    var available = canRefineDirection(code, btn.dataset.dir || '');
    btn.disabled = !available;
    btn.setAttribute('aria-disabled', available ? 'false' : 'true');
  });
  /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll('.mixer-ch')).forEach(function(row) {
    var controls = Array.from(/** @type {NodeListOf<HTMLButtonElement>} */ (row.querySelectorAll('.refine-btn')));
    row.style.opacity = controls.length && controls.every(function(btn) { return btn.disabled; }) ? '.35' : '';
  });
}

function applyMoodRefinement(code, direction) {
  var result = code;
  if (direction.indexOf('dark') !== -1 || direction.indexOf('moodi') !== -1) {
    result = algoRefine(algoRefine(algoRefine(algoRefine(result, 'slower'), 'darker'), 'lower'), 'scale:minor');
  } else if (direction.indexOf('euphoric') !== -1 || direction.indexOf('uplift') !== -1) {
    result = algoRefine(algoRefine(algoRefine(algoRefine(result, 'faster'), 'brighter'), 'louder'), 'scale:lydian');
    result = algoRefine(result, 'more reverb');
  } else if (direction.indexOf('dreamy') !== -1 || direction.indexOf('float') !== -1) {
    result = algoRefine(algoRefine(algoRefine(algoRefine(result, 'slower'), 'darker'), 'more reverb'), 'more delay');
    result = algoRefine(result, 'scale:pentatonic');
  } else if (direction.indexOf('aggressive') !== -1 || direction.indexOf('intense') !== -1) {
    result = algoRefine(algoRefine(algoRefine(algoRefine(result, 'faster'), 'louder'), 'more distortion'), 'denser');
    result = algoRefine(algoRefine(result, 'more resonance'), 'scale:phrygian');
  }
  return result;
}

// ---- Refine & Mood Buttons ----
// ---- Long-press repeat for ± buttons ----
function setupRepeat(btn) {
  var timer = null;
  var interval = null;
  function trigger() { btn.click(); }
  btn.addEventListener('mousedown', function() {
    timer = setTimeout(function() {
      interval = setInterval(trigger, 150);
    }, 400);
  });
  function stop() { clearTimeout(timer); clearInterval(interval); timer = null; interval = null; }
  btn.addEventListener('mouseup', stop);
  btn.addEventListener('mouseleave', stop);
  // touch support
  btn.addEventListener('touchstart', function(e) {
    e.preventDefault();
    timer = setTimeout(function() { interval = setInterval(trigger, 150); }, 400);
  });
  btn.addEventListener('touchend', stop);
  btn.addEventListener('touchcancel', stop);
}
document.querySelectorAll('.ch-minus, .ch-plus, .ch-toggle').forEach(setupRepeat);

/** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll('.refine-btn')).forEach(function(btn) {
  btn.addEventListener('click', async function() {
    var direction = btn.dataset.dir;
    var currentCode;
    try { currentCode = await getEditorCode(); } catch (_) { return; }
    if (!currentCode.trim()) return;
    var operation = beginExclusiveOperation();
    var triggeringRevision = editorPort.activeRevision;

    // Tone buttons: highlight active
    if (direction.indexOf('scale:') === 0) {
      document.querySelectorAll('.ch-tag').forEach(function(t) { t.classList.remove('active'); });
      btn.classList.add('active');
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
        result = applyMoodRefinement(currentCode, direction);
      } else {
        result = algoRefine(currentCode, direction);
      }
      var changed = result !== currentCode;
      btn.classList.add(changed ? 'flash-ok' : 'flash-fail');
      setTimeout(function() { btn.classList.remove('flash-ok', 'flash-fail'); }, 300);
      if (changed) {
        await setCodeAndPlay(result, operation);
        if (!isOperationCurrent(operation)) return;
        updateCompositionMeta(lastCompositionPlan, lastCompositionPlan ? 'algorithmic' : 'ai');
      }
      updateMixerAvailability(result);
      return;
    }

    // LLM refine: mood buttons only
    var statusEl = document.getElementById('status');
    statusEl.className = 'status';
    statusEl.textContent = 'Refining: ' + direction + '...';

    try {
      var refinePrompt = 'Here is the current Strudel code:\n\n' + currentCode + '\n\nModify this code to make it ' + direction + '. Keep the overall structure and concept. Change only what is needed for the requested direction. Return the complete modified code.';
      var refineProv = getProvider();
      var code = stripFences(await callLLM({
        provider: refineProv, apiKey: apiKey, system: STRUDEL_SYSTEM_PROMPT,
        user: refinePrompt, temperature: refineProv === 'gemini' ? 1.0 : 0.7,
        signal: operation.signal,
      }));
      if (!isOperationCurrent(operation) || editorPort.activeRevision !== triggeringRevision) return;
      var liveCode = await getEditorCode();
      if (!isOperationCurrent(operation) || liveCode !== currentCode) return;
      await setCodeAndPlay(code, operation);
      if (!isOperationCurrent(operation)) return;
      updateMixerAvailability(code);
    } catch (e) {
      if (isOperationCurrent(operation) && !isAbortError(e)) {
        statusEl.className = 'status error';
        statusEl.textContent = 'Refine error: ' + e.message;
      }
    } finally {
      if (isOperationCurrent(operation)) {
        try { updateMixerAvailability(await getEditorCode()); } catch (_) {}
      }
    }
  });
});

document.getElementById('input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('playBtn').click(); }
});

// ---- Natural Language Edit ----
// Edit system prompt — focused on MINIMAL edits, not rewrites
var EDIT_SYSTEM = 'You are a Strudel live-coding assistant. You receive the current program and a short instruction. Return a minimal modification that keeps the program runnable while applying the intent.\n\nRules:\n- Preserve unrelated code and comments.\n- Prefer minimal edits over full rewrites.\n- Keep formatting consistent with the original code.\n- Only change what the instruction asks for.\n- Return ONLY the updated program. No explanation, no markdown fences, no JSON wrapping.';

async function doEdit() {
  var editInput = /** @type {HTMLInputElement} */ (document.getElementById('editInput'));
  var instruction = editInput.value.trim();
  if (!instruction) return;

  var currentCode;
  try { currentCode = await getEditorCode(); } catch (_) { return; }
  if (!currentCode.trim()) return;
  var operation = beginExclusiveOperation();
  var triggeringRevision = editorPort.activeRevision;

  var apiKey = getApiKey();
  var statusEl = document.getElementById('status');
  var applyBtn = /** @type {HTMLButtonElement} */ (document.getElementById('editApply'));

  if (!apiKey) {
    statusEl.className = 'status error';
    statusEl.textContent = 'Natural language edit requires an API key.';
    return;
  }

  applyBtn.disabled = true;
  applyBtn.setAttribute('data-operation-epoch', String(operation.epoch));
  statusEl.className = 'status';
  statusEl.textContent = 'Editing: ' + instruction.substring(0, 50) + '...';

  try {
    var editPrompt = 'Current Strudel program:\n\n' + currentCode + '\n\nInstruction:\n' + instruction;
    var prov = getProvider();
    var code = stripFences(await callLLM({
      provider: prov, apiKey: apiKey, system: EDIT_SYSTEM, user: editPrompt,
      temperature: prov === 'gemini' ? 1.0 : 0.2,
      signal: operation.signal,
    }));

    if (!code || !code.trim()) throw new Error('Empty response');
    if (!isOperationCurrent(operation) || editorPort.activeRevision !== triggeringRevision) return;
    var liveCode = await getEditorCode();
    if (!isOperationCurrent(operation) || liveCode !== currentCode) return;
    editInput.value = '';
    await setCodeAndPlay(code, operation);
  } catch (e) {
    if (isOperationCurrent(operation) && !isAbortError(e)) {
      statusEl.className = 'status error';
      statusEl.textContent = 'Edit error: ' + e.message;
    }
  } finally {
    if (applyBtn.getAttribute('data-operation-epoch') === String(operation.epoch)) {
      applyBtn.disabled = false;
    }
  }
}

document.getElementById('editApply').addEventListener('click', doEdit);

// Mixer toggle in LLM mode
document.getElementById('mixerToggle').addEventListener('click', function() {
  var mixer = document.getElementById('algoMixer');
  var btn = document.getElementById('mixerToggle');
  var visible = mixer.style.display === 'flex';
  mixer.style.display = visible ? 'none' : 'flex';
  btn.classList.toggle('active', !visible);
});
document.getElementById('editInput').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') { e.preventDefault(); doEdit(); }
});
