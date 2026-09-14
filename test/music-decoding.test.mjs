import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMusicEngine, plain } from './helpers/load-app.mjs';

const { api, context } = loadMusicEngine();
const zero = { harmony: 0, melody: 0, groove: 0, arrangement: 0 };
const genres = ['edm', 'jazz', 'classical', 'blues', 'ambient', 'lofi', 'world', 'random', 'fusion:jazz+edm'];

test('arbitrary Unicode, punctuation, numbers and long inputs decode into a bounded finite score', () => {
  for (const input of ['', '!!!?...', '0123456789', '🪐🫧⚡🪐', '😶‍🌫️', 'ㄱㅏ가가', '東京/雨/042', 'a\u0000b', 'A7x!'.repeat(10000)]) {
    const decoded = api.decodeText(input);
    assert.equal(decoded.cells.length, 16, input.slice(0, 20));
    for (const cell of decoded.cells) {
      for (const value of Object.values(cell)) assert.ok(Number.isFinite(value) && value >= 0 && value <= 1);
    }
    for (const field of ['entropy', 'motion', 'repetition']) assert.ok(decoded[field] >= 0 && decoded[field] <= 1);
    const code = api.renderCompositionPlan(api.createCompositionPlan(input, 'random', zero));
    assert.ok(code.length < 15000, `rendered score must stay bounded: ${code.length}`);
    assert.doesNotMatch(code, /\b(?:NaN|undefined)\b/);
  }
});

test('normalization is stable but character order and casing retain an identity', () => {
  assert.deepEqual(plain(api.decodeText('ＡＢＣ１２３')), plain(api.decodeText('ABC123')));
  assert.deepEqual(plain(api.decodeText('가')), plain(api.decodeText('가')));
  const identities = ['abcdef', 'fedcba', 'ABCDEF', 'ab cd ef', 'abc\ndef'].map((input) => api.decodeText(input).fingerprint);
  assert.equal(new Set(identities).size, identities.length);
  // These collide under the former polynomial string hash.
  const a = context.createRNG('a~'), b = context.createRNG('b_');
  assert.notDeepEqual(Array.from({length: 8}, () => a()), Array.from({length: 8}, () => b()));
});

test('number direction, spacing and repetition affect music with the random stream held constant', () => {
  const analysis = { energy: .6, complexity: .7, space: .45, valence: .5 };
  const phrase = (input) => context.generateChordAwarePhrase(context.createRNG('controlled'), 8, analysis, 0, 'edm', api.decodeText(input));
  const ascending = phrase('0123456789'), descending = phrase('9876543210');
  assert.ok(ascending.motif.at(-1) > ascending.motif[0]);
  assert.ok(descending.motif.at(-1) < descending.motif[0]);
  assert.notEqual(ascending.lead, descending.lead);
  assert.notEqual(phrase('abcdefgh').lead, phrase('ab cd ef gh').lead);
  assert.ok(api.decodeText('loop loop loop loop').repetition > api.decodeText('one two three four').repetition);
  assert.equal(new Set(plain(phrase('aaaaaaaa').motif)).size, 1, 'repeated symbols should become a repeated pitch');
});

test('English mood clues match words rather than unrelated substrings', () => {
  assert.equal(context.countMoodWords('business runway sunlight', ['sun', 'run']), 0);
  assert.equal(context.countMoodWords('sun, run!', ['sun', 'run']), 2);
});

test('focused variation escapes short preset cycles across every genre', () => {
  for (const genre of genres) {
    const melodies = new Set(), grooves = new Set(), arrangements = new Set();
    for (let take = 0; take < 64; take++) {
      const melody = api.createCompositionPlan('q7X-2049 / 🪐 / 바람... 314159', genre, { ...zero, melody: take });
      melodies.add(melody.phrase.lead);
      const groove = api.createCompositionPlan('q7X-2049 / 🪐 / 바람... 314159', genre, { ...zero, groove: take });
      if (groove.drums) grooves.add(JSON.stringify(groove.drums));
      const arrangement = api.createCompositionPlan('q7X-2049 / 🪐 / 바람... 314159', genre, { ...zero, arrangement: take });
      arrangements.add(JSON.stringify([arrangement.form.masks, arrangement.sounds]));
      for (const mask of Object.values(arrangement.form.masks)) {
        const duration = [...mask.matchAll(/[01](?:@(\d+))?/g)].reduce((sum, match) => sum + Number(match[1] || 1), 0);
        assert.equal(duration, arrangement.form.length);
      }
      assert.equal(arrangement.form.masks.harmony, '<1@' + arrangement.form.length + '>', 'breaks retain a harmonic thread');
    }
    assert.ok(melodies.size >= 48, `${genre}: only ${melodies.size}/64 melodies`);
    assert.ok(!grooves.size || grooves.size >= 60, `${genre}: only ${grooves.size}/64 grooves`);
    assert.ok(arrangements.size >= 48, `${genre}: only ${arrangements.size}/64 arrangements`);
  }
});

test('melody variation updates the decoded contour and both possible accent roles', () => {
  for (const genre of genres) {
    context.resetVariationState();
    let code = api.generateCode('random input 903 — 夢', genre, zero);
    context.advanceVariation('melody');
    code = api.generateFocusedVariationCode('melody', code);
    const plan = context.lastCompositionPlan;
    assert.ok(code.includes('contour ' + plan.phrase.motif.join(' ')));
    const accent = context.getLayerBlock(code, 'accent');
    if (accent) assert.ok(accent.includes(plan.accentRole === 'arp' ? plan.phrase.arp : plan.phrase.counter));
  }
});
