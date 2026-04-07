// =====================================================
//  STRUDEL MUSE - Text-to-Music Generator
//  Analyzes text qualities (energy, brightness, weight,
//  space, complexity) and maps them to genre-appropriate
//  musical parameters. Same input + genre = same output.
// =====================================================

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
  var chars = lower.replace(/[^a-z0-9]/g, '');
  var vowels = (lower.match(/[aeiou]/g) || []).length;
  var letters = (lower.match(/[a-z]/g) || []).length;
  var words = text.trim().split(/\s+/).filter(Boolean);
  var uniqueChars = new Set(chars).size;
  var avgWordLen = words.reduce(function(s, w) { return s + w.length; }, 0) / Math.max(1, words.length);
  var punctuation = (text.match(/[!?.,:;\-()]/g) || []).length;
  var uppercase = (text.match(/[A-Z]/g) || []).length;
  return {
    energy: clamp((uniqueChars / 20) * 0.3 + (punctuation / Math.max(1, text.length)) * 3 + (uppercase / Math.max(1, text.length)) * 2 + Math.min(1, words.length / 8) * 0.3),
    brightness: clamp(vowels / Math.max(1, letters) * 1.8),
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
    scales: ['minor', 'phrygian', 'harmonic:minor', 'dorian', 'phrygian:dominant', 'minor:pentatonic'],
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
    layers: ['drums', 'bass', 'lead', 'chords', 'arp'],
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
    layers: ['drums', 'bass', 'lead', 'chords'],
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
    layers: ['bass', 'lead', 'chords', 'arp'],
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
    layers: ['drums', 'bass', 'lead', 'chords'],
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
    layers: ['bass', 'pad', 'lead', 'arp'],
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
    layers: ['drums', 'bass', 'lead', 'chords'],
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
    layers: ['drums', 'bass', 'lead', 'chords'],
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
    layers: ['drums', 'bass', 'lead', 'chords', 'arp'],
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
    layers: ['drums', 'bass', 'lead', 'chords', 'arp'],
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
  return L.join('\n');
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
- Write 4-7 layers. Each layer gets a brief poetic // comment that names what it represents.
- The opening // comment block should name the input, the key/scale, the BPM, and a one-line poetic interpretation.

## WHAT MAKES IT GOOD vs BORING

GOOD: Each layer has a ROLE in the story. The lead melody has a motif that develops. Layers interact rhythmically. Effects serve the mood. Surprise in at least one choice.
BORING: Random scale degrees. Every layer at the same volume. No rests. Generic "// bass" "// lead" comments. Safe, predictable choices.

GOOD: The scale choice HAS A REASON (phrygian = dark/Spanish, lydian = floating/dreamy, hirajoshi = Japanese mist).
BORING: Always C minor. Always sawtooth. Always TR909.

GOOD: Techniques serve the concept (.degradeBy for randomness/chaos, .jux(rev) for duality, .off for echoing footsteps, .echo for cathedral space).
BORING: Techniques stacked for complexity with no musical purpose.

## MUSIC THEORY PRINCIPLES

Voice leading: minimize movement between chords. Each voice moves by step (1-2 scale degrees), not leaps.
4-part harmony: root (bass), 3rd+5th (chord), melody (top voice). Keep voices in their registers.
Anchor points: in a 12-step melody, align with chord tones at steps 1, 4, 7, 10. Passing tones between.
Tension-release: dissonance (7ths, suspensions, altered tones) → resolution (root, 3rd, 5th).
Call and response: 2-bar phrase (call), 2-bar answer (response). The answer can vary, transpose, or invert.
Rhythmic counterpoint: when melody is busy, accompaniment is sparse. When melody rests, accompaniment fills.
Dynamic arc: intro (sparse, quiet) → build (add layers, open filters) → peak (full, loud) → release (strip layers).

## MOOD PARAMETERS

When shifting the mood of a piece, adjust these parameters together:
  dark: tempo -10%, lpf -200Hz, room +0.2, gain -10%, prefer minor/phrygian
  euphoric: tempo +10%, lpf +400Hz, room +0.1, gain +10%, prefer major/lydian
  melancholic: tempo -15%, lpf -100Hz, room +0.3, gain -5%, prefer minor/dorian
  aggressive: tempo +15%, lpf +600Hz, gain +15%, prefer phrygian/locrian
  dreamy: tempo -20%, lpf -300Hz, room +0.4, delay +0.3, gain -10%, prefer lydian/whole:tone
  peaceful: tempo -25%, lpf -200Hz, room +0.25, gain -15%, prefer major:pentatonic
  energetic: tempo +20%, lpf +300Hz, gain +10%, prefer mixolydian/dorian

## CRITICAL REMINDERS
(Full syntax, effects, scales, sounds, and techniques are in the user message COMPLETE COMPONENT REFERENCE.)

1. Melody: MOTIFS — a 3-4 note phrase that repeats/varies. Call-response structure. Anchor to chord tones (0, 2, 4) on strong beats.
2. Dynamics: layers at different gains (drums .6-.8, bass .4-.6, lead .3-.5, pad .1-.3). Not everything at full blast.
3. Space: rests (~) and .degradeBy make music breathe. Silence is a note.
4. Every layer needs a REASON — if you can't name what it represents in the story, delete it.
5. Scale choice is your most important creative decision. It sets the entire emotional world.
6. Surprise: at least one unexpected element — unusual sound, non-aligned rhythm, technique used for a non-obvious reason.
7. ARRANGEMENT: use .mask() so layers enter at different times. Example: .mask("<0@4 1@28>") on bass, .mask("<0@8 1@24>") on lead.
8. VARIATION: use .every(N, fn) on at least one layer. Example: .every(4, x=>x.rev()). Music that never changes is dead.
9. TEXTURE: .degradeBy(sine.range(0, 0.3).slow(16)) on pads/chords for organic breathing.
10. MOVEMENT: .lpf(sine.range(lo, hi).slow(N)) on drums or bass for build/release.`;

function getApiKey() {
  return localStorage.getItem('tts_api_key') || '';
}

function saveApiKey(key) {
  if (key) localStorage.setItem('tts_api_key', key);
  else localStorage.removeItem('tts_api_key');
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
  edm:       'EDM starting point: 124-140 BPM, four-on-floor, sawtooth + filter sweeps, minor/phrygian. BUT: consider hybrid approaches — ambient-EDM with sine pads, jazz-EDM with complex chords, classical-EDM with string stabs. Typical arrangement: intro 8 cycles → build 8 → drop 16 → break 8 → drop 16 → outro 8.',
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
  return localStorage.getItem('tts_provider') || 'claude';
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
  if (provider === 'gemini') {
    return generateWithGemini(text, genre, apiKey);
  }
  return generateWithClaude(text, genre, apiKey);
}

async function generateWithClaude(text, genre, apiKey) {
  var userPrompt = buildVariationPrompt(text, genre);
  var temperature = Math.min(1.2, 0.9 + seedCounter * 0.05);

  var response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      temperature: temperature,
      system: STRUDEL_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  var data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return validateAndFix(stripFences(data.content[0].text));
}

async function generateWithGemini(text, genre, apiKey) {
  var userPrompt = buildVariationPrompt(text, genre);
  var temperature = Math.min(1.5, 0.9 + seedCounter * 0.08);

  // Gemini expects system instruction + user content in a single request
  var response = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + apiKey,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: STRUDEL_SYSTEM_PROMPT }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: {
          temperature: temperature,
          maxOutputTokens: 2048,
        },
      }),
    }
  );

  var data = await response.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  if (!data.candidates || !data.candidates[0]) throw new Error('No response from Gemini');
  return validateAndFix(stripFences(data.candidates[0].content.parts[0].text));
}

// ---- Post-generation Validation ----
// Fix verified LLM hallucinations that cause runtime errors.
function validateAndFix(code) {
  // setbpm does NOT exist in Strudel — convert to setcpm(bpm/4)
  code = code.replace(/setbpm\s*\(\s*(\d+)\s*\)/g, 'setcpm($1/4)');
  // setBpm variant
  code = code.replace(/setBpm\s*\(\s*(\d+)\s*\)/g, 'setcpm($1/4)');
  // GM pad numbered names → unnumbered (MIDI GM standard vs Strudel naming)
  code = code.replace(/gm_pad_1[_a-z]*/g, 'gm_pad_new_age');
  code = code.replace(/gm_pad_2[_a-z]*/g, 'gm_pad_warm');
  code = code.replace(/gm_pad_3[_a-z]*/g, 'gm_pad_poly');
  code = code.replace(/gm_pad_4[_a-z]*/g, 'gm_pad_choir');
  code = code.replace(/gm_pad_5[_a-z]*/g, 'gm_pad_bowed');
  code = code.replace(/gm_pad_6[_a-z]*/g, 'gm_pad_metallic');
  code = code.replace(/gm_pad_7[_a-z]*/g, 'gm_pad_halo');
  code = code.replace(/gm_pad_8[_a-z]*/g, 'gm_pad_sweep');
  return code;
}

function stripFences(code) {
  return code.replace(/^```[\w]*\n?/gm, '').replace(/\n?```$/gm, '').trim();
}

// ---- Editor Integration (strudel-editor web component) ----
var editorEl = document.getElementById('strudelEditor');

function getEditor() {
  return editorEl && editorEl.editor ? editorEl.editor : null;
}

function setCodeAndPlay(code) {
  var statusEl = document.getElementById('status');
  var btn = document.getElementById('playBtn');
  btn.disabled = true;
  statusEl.className = 'status';
  statusEl.textContent = 'Loading editor...';

  function attempt() {
    var ed = getEditor();
    if (!ed) { setTimeout(attempt, 200); return; }
    try {
      ed.setCode(code);
      statusEl.textContent = 'Evaluating...';
      setTimeout(function() {
        ed.evaluate(true);
        statusEl.className = 'status playing';
        statusEl.textContent = 'Playing — edit the code above, then Ctrl+Enter';
        btn.disabled = false;
      }, 150);
    } catch (e) {
      statusEl.className = 'status error';
      statusEl.textContent = 'Error: ' + e.message;
      btn.disabled = false;
    }
  }
  attempt();
}

function stopPlayback() {
  var ed = getEditor();
  if (ed) ed.stop();
  document.getElementById('status').className = 'status';
  document.getElementById('status').textContent = 'Stopped';
}

// ---- UI Wiring ----
var selectedGenre = 'edm';
var fusionMode = false;
var fusionGenres = [];
var lastInput = '';

var genreBtns = document.querySelectorAll('.genre-btn');
var fusionBtn = document.querySelector('[data-genre="fusion"]');

function updateGenreUI() {
  genreBtns.forEach(function(b) {
    if (b.dataset.genre === 'fusion') return; // fusion button managed separately
    if (fusionMode) {
      // multi-select: show fusion-pick for selected genres
      b.classList.remove('active');
      if (fusionGenres.indexOf(b.dataset.genre) !== -1) {
        b.classList.add('fusion-pick');
      } else {
        b.classList.remove('fusion-pick');
      }
    } else {
      // single-select
      b.classList.remove('fusion-pick');
      if (b.dataset.genre === selectedGenre) b.classList.add('active');
      else b.classList.remove('active');
    }
  });
  fusionBtn.classList.toggle('active', fusionMode);
}

genreBtns.forEach(function(btn) {
  btn.addEventListener('click', function() {
    var genre = btn.dataset.genre;

    if (genre === 'fusion') {
      // toggle fusion mode
      fusionMode = !fusionMode;
      if (fusionMode) {
        fusionGenres = [];
      } else {
        selectedGenre = fusionGenres[0] || 'edm';
        fusionGenres = [];
      }
    } else if (genre === 'random') {
      fusionMode = false;
      fusionGenres = [];
      selectedGenre = 'random';
    } else if (fusionMode) {
      // multi-select: toggle genre in fusion list
      var idx = fusionGenres.indexOf(genre);
      if (idx !== -1) fusionGenres.splice(idx, 1);
      else fusionGenres.push(genre);
    } else {
      // single-select
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

// shared generate function
async function doGenerate() {
  var text = document.getElementById('input').value.trim();
  if (!text) {
    document.getElementById('status').className = 'status error';
    document.getElementById('status').textContent = 'Type something first';
    return;
  }

  // reset seed when input text changes
  if (text !== lastInput) { seedCounter = 0; lastInput = text; }

  var genre = getEffectiveGenre();
  var apiKey = getApiKey();
  var statusEl = document.getElementById('status');
  document.getElementById('editorWrap').classList.add('visible');
  document.getElementById('refineRow').style.display = 'flex';

  if (apiKey) {
    // ---- Claude/Gemini creative mode ----
    document.getElementById('playBtn').disabled = true;
    document.getElementById('regenBtn').disabled = true;
    statusEl.className = 'status';
    var prov = getProvider();
    var temp = prov === 'gemini' ? Math.min(1.5, 0.9 + seedCounter * 0.08) : Math.min(1.2, 0.9 + seedCounter * 0.05);
    statusEl.textContent = (prov === 'gemini' ? 'Gemini' : 'Claude') + ' is composing... (seed ' + seedCounter + ', temp ' + temp.toFixed(2) + ')';
    try {
      var code = await generateWithAI(text, genre, apiKey);
      setCodeAndPlay(code);
    } catch (e) {
      statusEl.className = 'status error';
      statusEl.textContent = 'API error: ' + e.message + ' — falling back to algorithm';
      var fallback = generateCode(text, genre);
      setCodeAndPlay(fallback);
    } finally {
      document.getElementById('playBtn').disabled = false;
      document.getElementById('regenBtn').disabled = false;
    }
  } else {
    // ---- Algorithmic mode ----
    statusEl.textContent = 'Algorithmic mode (seed ' + seedCounter + ')';
    var code = generateCode(text, genre);
    setCodeAndPlay(code);
  }
}

document.getElementById('playBtn').addEventListener('click', function() {
  seedCounter = 0; // Generate = fresh start
  doGenerate();
});

document.getElementById('regenBtn').addEventListener('click', function() {
  seedCounter++; // Regenerate = increment seed
  doGenerate();
});

document.getElementById('runBtn').addEventListener('click', function() {
  var ed = getEditor();
  if (ed) {
    try { ed.evaluate(true); } catch(e) {}
    document.getElementById('status').className = 'status playing';
    document.getElementById('status').textContent = 'Playing';
  }
});

document.getElementById('stopBtn').addEventListener('click', stopPlayback);

// ---- API Key UI ----
(function() {
  var keyInput = document.getElementById('apiKey');
  var provSelect = document.getElementById('apiProvider');
  var hint = document.getElementById('apiHint');

  // restore saved state
  var savedKey = getApiKey();
  var savedProv = getProvider();
  provSelect.value = savedProv;
  if (savedKey) {
    keyInput.value = savedKey;
    hint.textContent = (savedProv === 'gemini' ? 'Gemini' : 'Claude') + ' creative mode active.';
    hint.className = 'api-hint saved';
  }

  // update placeholder on provider change
  provSelect.addEventListener('change', function() {
    keyInput.placeholder = provSelect.value === 'gemini' ? 'AIza...' : 'sk-ant-...';
  });
  provSelect.dispatchEvent(new Event('change'));

  document.getElementById('apiSave').addEventListener('click', function() {
    var key = keyInput.value.trim();
    var prov = provSelect.value;
    saveApiKey(key);
    saveProvider(prov);
    if (key) {
      hint.textContent = 'Saved. ' + (prov === 'gemini' ? 'Gemini' : 'Claude') + ' creative mode active.';
      hint.className = 'api-hint saved';
    } else {
      hint.textContent = 'Cleared. Using algorithmic mode.';
      hint.className = 'api-hint';
    }
  });
})();

// ---- Algorithmic Refine: modify existing code values ----
function algoRefine(code, direction) {
  switch (direction) {
    case 'faster':
      return code.replace(/setcpm\s*\(\s*(\d+)\s*\/\s*4\s*\)/, function(m, bpm) {
        return 'setcpm(' + Math.min(200, parseInt(bpm) + 8) + '/4)';
      });
    case 'slower':
      return code.replace(/setcpm\s*\(\s*(\d+)\s*\/\s*4\s*\)/, function(m, bpm) {
        return 'setcpm(' + Math.max(40, parseInt(bpm) - 8) + '/4)';
      });
    case 'louder':
      return code.replace(/\.gain\s*\(\s*([\d.]+)\s*\)/g, function(m, g) {
        return '.gain(' + Math.min(1, (parseFloat(g) * 1.15)).toFixed(2) + ')';
      });
    case 'quieter':
      return code.replace(/\.gain\s*\(\s*([\d.]+)\s*\)/g, function(m, g) {
        return '.gain(' + Math.max(0.05, (parseFloat(g) * 0.85)).toFixed(2) + ')';
      });
    case 'brighter':
      return code.replace(/\.lpf\s*\(\s*(\d+)\s*\)/g, function(m, f) {
        return '.lpf(' + Math.min(12000, Math.round(parseInt(f) * 1.4)) + ')';
      });
    case 'darker':
      return code.replace(/\.lpf\s*\(\s*(\d+)\s*\)/g, function(m, f) {
        return '.lpf(' + Math.max(100, Math.round(parseInt(f) * 0.6)) + ')';
      });
    case 'more reverb':
      return code.replace(/\.room\s*\(\s*([\d.]+)\s*\)/g, function(m, r) {
        return '.room(' + Math.min(1, (parseFloat(r) + 0.15)).toFixed(2) + ')';
      });
    case 'drier':
      return code.replace(/\.room\s*\(\s*([\d.]+)\s*\)/g, function(m, r) {
        return '.room(' + Math.max(0, (parseFloat(r) - 0.15)).toFixed(2) + ')';
      });
    default:
      // mood shifts via LLM prompt direction — pass through for LLM handler
      return code;
  }
}

// ---- Refine & Mood Buttons ----
document.querySelectorAll('.refine-btn').forEach(function(btn) {
  btn.addEventListener('click', async function() {
    var direction = btn.dataset.dir;
    var ed = getEditor();
    if (!ed) return;
    var currentCode = ed.code || '';
    if (!currentCode.trim()) return;

    var apiKey = getApiKey();
    if (!apiKey) {
      // algorithmic refine: modify existing values
      if (direction.indexOf('make it') === 0) {
        // mood: compound transformation
        var moodCode = currentCode;
        if (direction.indexOf('dark') !== -1 || direction.indexOf('moodi') !== -1) {
          moodCode = algoRefine(algoRefine(algoRefine(moodCode, 'slower'), 'darker'), 'more reverb');
        } else if (direction.indexOf('euphoric') !== -1 || direction.indexOf('uplift') !== -1) {
          moodCode = algoRefine(algoRefine(algoRefine(moodCode, 'faster'), 'brighter'), 'louder');
        } else if (direction.indexOf('dreamy') !== -1 || direction.indexOf('float') !== -1) {
          moodCode = algoRefine(algoRefine(algoRefine(moodCode, 'slower'), 'darker'), 'more reverb');
          moodCode = algoRefine(moodCode, 'more reverb');
        } else if (direction.indexOf('aggressive') !== -1 || direction.indexOf('intense') !== -1) {
          moodCode = algoRefine(algoRefine(algoRefine(moodCode, 'faster'), 'brighter'), 'louder');
        }
        ed.setCode(moodCode);
        ed.evaluate(true);
      } else {
        var refined = algoRefine(currentCode, direction);
        ed.setCode(refined);
        ed.evaluate(true);
      }
      return;
    }

    // LLM refine: send current code + direction
    var statusEl = document.getElementById('status');
    statusEl.className = 'status';
    statusEl.textContent = 'Refining: ' + direction + '...';
    document.querySelectorAll('.refine-btn').forEach(function(b) { b.disabled = true; });

    try {
      var refinePrompt = 'Here is the current Strudel code:\n\n' + currentCode + '\n\nModify this code to make it ' + direction + '. Keep the overall structure and concept. Change only what is needed for the requested direction. Return the complete modified code.';
      var code;
      if (getProvider() === 'gemini') {
        var resp = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=' + apiKey,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ system_instruction: { parts: [{ text: STRUDEL_SYSTEM_PROMPT }] }, contents: [{ parts: [{ text: refinePrompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 2048 } }) });
        var data = await resp.json();
        if (data.error) throw new Error(data.error.message);
        code = stripFences(data.candidates[0].content.parts[0].text);
      } else {
        var resp = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
          body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 2048, temperature: 0.7, system: STRUDEL_SYSTEM_PROMPT, messages: [{ role: 'user', content: refinePrompt }] }) });
        var data = await resp.json();
        if (data.error) throw new Error(data.error.message);
        code = stripFences(data.content[0].text);
      }
      setCodeAndPlay(code);
    } catch (e) {
      statusEl.className = 'status error';
      statusEl.textContent = 'Refine error: ' + e.message;
    } finally {
      document.querySelectorAll('.refine-btn').forEach(function(b) { b.disabled = false; });
    }
  });
});

document.getElementById('input').addEventListener('keydown', function(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('playBtn').click(); }
});
