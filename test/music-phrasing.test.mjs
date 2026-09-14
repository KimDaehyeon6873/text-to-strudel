import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFullApp, loadMusicEngine } from './helpers/load-app.mjs';

const { api, context } = loadMusicEngine();
const genres = ['edm', 'jazz', 'classical', 'blues', 'ambient', 'lofi', 'world', 'random', 'fusion:jazz+edm'];
const zero = { harmony: 0, melody: 0, groove: 0, arrangement: 0 };

// Expand the flat, weighted eighth-note bars to inspect occupied time,
// including sustains rather than just note attacks.
function slots(pattern) {
  return [...pattern.matchAll(/\[([^\]]+)\]/g)].map((bar) =>
    bar[1].split(' ').flatMap((token) => {
      const [value, duration = '1'] = token.split('@');
      assert.match(value, /^(?:\d+|~)$/);
      return Array(Number(duration)).fill(value);
    }));
}

test('phrases retain eight eighth-note slots and answers fit entirely within lead rests', () => {
  for (const genre of genres) {
    for (const prompt of ['고요 평온 잠 숨 잔잔 느린', '불꽃처럼 달려가는 여름밤의 폭풍과 빛', 'a quiet city, waking up']) {
      for (let melody = 0; melody < 6; melody++) {
        const plan = api.createCompositionPlan(prompt, genre, { ...zero, melody });
        const lead = slots(plan.phrase.lead);
        const counter = slots(plan.phrase.counter);
        assert.equal(lead.length, plan.harmony.phraseBars);
        assert.equal(counter.length, lead.length);
        assert.deepEqual(lead[0], lead[2], `${genre}: the opening motif must return`);
        lead.forEach((bar, index) => {
          assert.equal(bar.length, 8, `${genre}/bar ${index}: lead meter`);
          assert.equal(counter[index].length, 8, `${genre}/bar ${index}: answer meter`);
          counter[index].forEach((note, step) => {
            if (note !== '~') assert.equal(bar[step], '~', `${genre}/bar ${index}/step ${step}: overlapping voices`);
          });
          if (index % 4 === 3) assert.deepEqual(bar.slice(-2), ['~', '~'], `${genre}: phrase ending must breathe`);
        });
      }
    }
  }
});

test('complexity increases rhythmic detail while preserving the motif and phrase ending', () => {
  const analysis = { energy: .6, complexity: 0 };
  const simple = context.generateChordAwarePhrase(() => .5, 8, analysis, 0, 'edm');
  const ornate = context.generateChordAwarePhrase(() => .5, 8, { ...analysis, complexity: 1 }, 0, 'edm');
  assert.notEqual(ornate.lead, simple.lead);
  assert.deepEqual(ornate.motif, simple.motif);
  assert.deepEqual(slots(ornate.lead)[0], slots(ornate.lead)[2]);
  assert.ok(slots(ornate.lead)[0].filter((note) => note !== '~').length > slots(simple.lead)[0].filter((note) => note !== '~').length);
  assert.deepEqual(slots(ornate.lead)[3], slots(simple.lead)[3]);
});

test('arrangement effects preserve composed melody timing and harmonic pitches', () => {
  for (const genre of genres) {
    for (let arrangement = 0; arrangement < 12; arrangement++) {
      const plan = api.createCompositionPlan('비 내리는 새벽, 혼자 남은 불빛', genre, { ...zero, arrangement });
      const lead = context.getLayerBlock(api.renderCompositionPlan(plan), 'lead');
      assert.doesNotMatch(lead, /\.rev\(|\.fast\(|\.off\(|\.jux\(|\.degradeBy\(/);
      // Small detuning for the EDM synthesizer is timbral, not a new melody.
      assert.doesNotMatch(lead, /\.add\((?:[1-9]|-)/);
    }
  }
});

test('swing and straightening apply across the ensemble and survive focused variations', () => {
  const ctx = loadFullApp();
  for (const genre of genres) {
    ctx.resetVariationState();
    let code = ctx.generateCode('불꽃처럼 달려가는 여름밤의 폭풍과 빛', genre, zero);
    code = ctx.algoRefine(code, 'straighten');
    assert.doesNotMatch(code, /\.swing\(/);
    ctx.advanceVariation('arrangement');
    code = ctx.generateFocusedVariationCode('arrangement', code);
    assert.doesNotMatch(code, /\.swing\(/, `${genre}: arrangement must preserve straight timing`);
    code = ctx.algoRefine(code, 'add swing');
    ctx.advanceVariation('groove');
    code = ctx.generateFocusedVariationCode('groove', code);
    ctx.advanceVariation('arrangement');
    code = ctx.generateFocusedVariationCode('arrangement', code);
    for (const role of ctx.MUSIC_LAYER_NAMES) {
      const block = ctx.getLayerBlock(code, role);
      if (!block) continue;
      assert.equal((block.match(/\.swing\(4\)/g) || []).length, role === 'texture' ? 0 : 1, `${genre}/${role}`);
    }
    assert.equal(ctx.canRefineDirection(code, 'add swing'), false);
  }
});

test('new groove preserves drum mixer gain and effects while changing the voices', () => {
  const ctx = loadFullApp();
  for (const genre of ['edm', 'jazz', 'blues', 'lofi', 'world']) {
    ctx.resetVariationState();
    let code = ctx.generateCode('붉은 사막을 건너는 밤의 행렬', genre, zero);
    code = ctx.algoRefine(code, 'quieter');
    code = ctx.transformLayerBlock(code, 'drums', (block) => block + '\n.room(.19)\n// personal drum polish');
    const before = ctx.getLayerBlock(code, 'drums');
    ctx.advanceVariation('groove');
    code = ctx.generateFocusedVariationCode('groove', code);
    const after = ctx.getLayerBlock(code, 'drums');
    assert.notEqual(after, before);
    const withoutVoices = (block) => block.replace(/\$: stack\(\n[\s\S]*?\n\)/, '');
    assert.equal(withoutVoices(after), withoutVoices(before));
  }
});

test('octave controls still update both melody registers after rhythm-first rendering', () => {
  const ctx = loadFullApp();
  const code = ctx.generateCode('비 내리는 새벽, 혼자 남은 불빛', 'ambient', zero);
  const raised = ctx.algoRefine(code, 'higher');
  for (const role of ['lead', 'accent']) {
    const before = ctx.getLayerBlock(code, role).match(/\.anchor\("([a-g](?:#|b)?)(\d)"\)/);
    const after = ctx.getLayerBlock(raised, role).match(/\.anchor\("([a-g](?:#|b)?)(\d)"\)/);
    assert.ok(before && after, `${role}: missing anchored phrase`);
    assert.equal(after[1], before[1]);
    assert.equal(Number(after[2]), Number(before[2]) + 1);
  }
});
