import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFullApp } from './helpers/load-app.mjs';

const genres = ['edm', 'jazz', 'classical', 'blues', 'ambient', 'lofi', 'world'];
const directions = [
  'slower', 'faster', 'quieter', 'louder', 'darker', 'brighter',
  'less resonance', 'more resonance', 'less highpass', 'more highpass',
  'lower', 'higher', 'drier', 'more reverb', 'less delay', 'more delay',
  'less feedback', 'more feedback', 'sparser', 'denser', 'straighten', 'add swing',
  'less distortion', 'more distortion', 'less crush', 'more crush',
  'scale:major', 'scale:minor', 'scale:dorian', 'scale:phrygian', 'scale:lydian', 'scale:pentatonic',
  'make it darker and moodier', 'make it euphoric and uplifting',
  'make it dreamy and floating', 'make it aggressive and intense',
];

function applyAlgorithmicDirection(ctx, code, direction) {
  return direction.startsWith('make it')
    ? ctx.applyMoodRefinement(code, direction)
    : ctx.algoRefine(code, direction);
}

test('base-genre by mixer-direction matrix changes every enabled action and disables every no-op', () => {
  const ctx = loadFullApp();
  const zero = { harmony: 0, melody: 0, groove: 0, arrangement: 0 };
  for (const genre of genres) {
    for (const direction of directions) {
      const code = ctx.generateCode('햇살과 폭풍 사이의 오래된 춤', genre, zero);
      const available = ctx.canRefineDirection(code, direction);
      const refined = applyAlgorithmicDirection(ctx, code, direction);
      assert.equal(
        available,
        refined !== code,
        `${genre}/${direction}: ${available ? 'enabled action was a no-op' : 'changing action was reported disabled'}`,
      );
    }
  }
});

test('mood macros disable after every component reaches its musical boundary', () => {
  const ctx = loadFullApp();
  const moods = directions.filter((direction) => direction.startsWith('make it'));
  const zero = { harmony: 0, melody: 0, groove: 0, arrangement: 0 };
  for (const mood of moods) {
    let code = ctx.generateCode('경계까지 반복하는 무드 변화', 'edm', zero);
    let iterations = 0;
    while (ctx.canRefineDirection(code, mood) && iterations < 100) {
      const refined = applyAlgorithmicDirection(ctx, code, mood);
      assert.notEqual(refined, code, `${mood}: an enabled macro must change the result`);
      code = refined;
      iterations++;
    }
    assert.ok(iterations < 100, `${mood}: availability did not converge`);
    assert.equal(ctx.canRefineDirection(code, mood), false, `${mood}: exhausted macro must be disabled`);
    assert.equal(applyAlgorithmicDirection(ctx, code, mood), code, `${mood}: exhausted macro must be a no-op`);
  }
});
