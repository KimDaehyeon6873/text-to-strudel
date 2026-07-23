import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFullApp, loadMusicEngine, plain } from './helpers/load-app.mjs';

const { api } = loadMusicEngine();
const prompt = '불꽃처럼 달려가는 여름밤의 폭풍과 빛';
const genre = 'edm';
const zero = { harmony: 0, melody: 0, groove: 0, arrangement: 0 };

function plan(state) { return plain(api.createCompositionPlan(prompt, genre, state)); }
function without(value, keys) {
  const copy = structuredClone(value);
  for (const key of keys) delete copy[key];
  return copy;
}

test('melody variation changes only the lead and counter phrase', () => {
  const base = plan(zero);
  const changed = plan({ ...zero, melody: 1 });
  assert.notDeepEqual(changed.phrase, base.phrase);
  assert.deepEqual(without(changed, ['phrase', 'variations']), without(base, ['phrase', 'variations']));
});

test('groove variation changes only drums drum gains and the groove-seeded percussion dimension', () => {
  const base = plan(zero);
  const changed = plan({ ...zero, groove: 1 });
  assert.ok(
    JSON.stringify(changed.drums) !== JSON.stringify(base.drums) || changed.drumGains !== base.drumGains,
    'groove must audibly change drums or drum gains',
  );
  assert.deepEqual(
    without(changed, ['drums', 'drumGains', 'variations']),
    without(base, ['drums', 'drumGains', 'variations']),
  );
  const normalizeNonGrooveCode = (value) => api.renderCompositionPlan(value)
    .replace(/^\/\/ variation:.*$/m, '')
    .replace(/\/\/ drums ·[\s\S]*?(?=\n\/\/ |$)/g, '')
    .replace(/\/\/ percussion ·[\s\S]*?(?=\n\/\/ |$)/g, '');
  assert.equal(normalizeNonGrooveCode(changed), normalizeNonGrooveCode(base));
});

test('arrangement variation preserves harmony symbols bass and lead phrase', () => {
  const base = plan(zero);
  const changed = plan({ ...zero, arrangement: 1 });
  assert.deepEqual(changed.harmony.symbols, base.harmony.symbols);
  assert.equal(changed.bassPattern, base.bassPattern);
  assert.deepEqual(changed.phrase, base.phrase);
  assert.notEqual(
    JSON.stringify(without(changed, ['variations', 'harmony', 'bassPattern', 'phrase', 'analysis', 'text'])),
    JSON.stringify(without(base, ['variations', 'harmony', 'bassPattern', 'phrase', 'analysis', 'text'])),
  );
});

test('new take changes harmony melody groove and arrangement dimensions', () => {
  const base = plan(zero);
  const changed = plan({ harmony: 1, melody: 1, groove: 1, arrangement: 1 });
  assert.notEqual(JSON.stringify([changed.key, changed.scale, changed.profileName, changed.harmony.symbols]), JSON.stringify([base.key, base.scale, base.profileName, base.harmony.symbols]), 'harmony');
  assert.notDeepEqual(changed.phrase, base.phrase, 'melody');
  assert.notEqual(JSON.stringify([changed.drums, changed.drumGains]), JSON.stringify([base.drums, base.drumGains]), 'groove');
  assert.notEqual(JSON.stringify([changed.sounds, changed.bank, changed.form.name, changed.accentRole, changed.includePerc, changed.includeTexture, changed.leadTechnique]), JSON.stringify([base.sounds, base.bank, base.form.name, base.accentRole, base.includePerc, base.includeTexture, base.leadTechnique]), 'arrangement');
});

test('every consecutive new take advances to a different harmonic identity', () => {
  const prompts = [
    '햇살이 번지는 여름 바람',
    '비 내리는 새벽, 혼자 남은 불빛',
    '불꽃처럼 달려가는 폭풍',
  ];
  for (const currentGenre of ['edm', 'jazz', 'classical', 'blues', 'ambient', 'lofi', 'world']) {
    for (const currentPrompt of prompts) {
      let previous = null;
      for (let take = 0; take < 10; take++) {
        const current = plain(api.createCompositionPlan(currentPrompt, currentGenre, {
          harmony: take, melody: take, groove: take, arrangement: take,
        }));
        const identity = JSON.stringify([current.key, current.profileName, current.harmony.symbols]);
        if (previous !== null) assert.notEqual(identity, previous, `${currentGenre}/${currentPrompt}/take ${take}`);
        previous = identity;
      }
    }
  }
});

test('every enabled focused variation changes on consecutive presses', () => {
  const prompts = ['햇살이 번지는 여름 바람', '비 내리는 새벽, 혼자 남은 불빛'];
  const modes = ['edm', 'jazz', 'classical', 'blues', 'ambient', 'lofi', 'world', 'random', 'fusion:edm+jazz'];
  for (const currentGenre of modes) {
    for (const currentPrompt of prompts) {
      let previousMelody = null;
      let previousGroove = null;
      let previousArrangement = null;
      for (let variation = 0; variation < 12; variation++) {
        const melodyPlan = api.createCompositionPlan(currentPrompt, currentGenre, { ...zero, melody: variation });
        if (previousMelody !== null) assert.notEqual(melodyPlan.phrase.lead, previousMelody, `${currentGenre}/melody ${variation}`);
        previousMelody = melodyPlan.phrase.lead;

        const arrangementPlan = api.createCompositionPlan(currentPrompt, currentGenre, { ...zero, arrangement: variation });
        if (previousArrangement !== null) assert.notEqual(arrangementPlan.form.name, previousArrangement, `${currentGenre}/arrangement ${variation}`);
        previousArrangement = arrangementPlan.form.name;

        const groovePlan = api.createCompositionPlan(currentPrompt, currentGenre, { ...zero, groove: variation });
        if (groovePlan.drums) {
          const groove = JSON.stringify([groovePlan.drums, groovePlan.drumGains]);
          if (previousGroove !== null) assert.notEqual(groove, previousGroove, `${currentGenre}/groove ${variation}`);
          previousGroove = groove;
        }
      }
    }
  }
});

test('scale reharmonization preserves the blues twelve-bar structure', () => {
  for (const scale of ['major', 'minor', 'dorian', 'phrygian', 'lydian', 'pentatonic']) {
    const blues = api.createCompositionPlan(prompt, 'blues', zero);
    api.applyToneToPlan(blues, scale);
    assert.equal(blues.harmony.harmonicBars, 12, scale);
    assert.equal(blues.harmony.phraseBars, 12, scale);
    assert.equal(blues.harmony.degrees.length, 12, scale);
    assert.equal(blues.harmony.symbols.length, 12, scale);
    assert.equal(blues.form.length, 24, scale);
  }
});

test('focused melody and groove variations preserve tone tempo polish and manual edits', () => {
  const ctx = loadFullApp();
  let code = ctx.generateCode(prompt, 'jazz', zero);
  code = ctx.algoRefine(code, 'scale:lydian');
  code = ctx.algoRefine(code, 'faster');
  code = ctx.algoRefine(code, 'more reverb') + '\n// manual edit survives';
  const harmony = code.match(/^const harmony =.*$/m)[0];
  const tempo = code.match(/^setcpm\(.*$/m)[0];
  const leadBefore = code.match(/\/\/ lead ·[\s\S]*?(?=\n\/\/ |$)/)[0];

  ctx.advanceVariation('melody');
  const melody = ctx.generateFocusedVariationCode('melody', code);
  assert.match(melody, new RegExp(harmony.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(melody, new RegExp(tempo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(melody, /manual edit survives/);
  assert.notEqual(melody.match(/\/\/ lead ·[\s\S]*?(?=\n\/\/ |$)/)[0], leadBefore);

  const melodyPhrase = melody.match(/\/\/ lead ·[\s\S]*?(?=\n\/\/ |$)/)[0];
  ctx.advanceVariation('groove');
  const groove = ctx.generateFocusedVariationCode('groove', melody);
  assert.equal(groove.match(/\/\/ lead ·[\s\S]*?(?=\n\/\/ |$)/)[0], melodyPhrase);
  assert.match(groove, new RegExp(harmony.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(groove, /manual edit survives/);
});

test('arrangement variation preserves the current musical identity and core polish', () => {
  const ctx = loadFullApp();
  let code = ctx.generateCode(prompt, 'edm', zero);
  code = ctx.algoRefine(code, 'scale:major');
  code = ctx.algoRefine(code, 'slower');
  code = ctx.algoRefine(code, 'more distortion');
  code += '\n// manual footer survives\n$: s("cp")';
  const harmony = code.match(/^const harmony =.*$/m)[0];
  const tempo = code.match(/^setcpm\(.*$/m)[0];
  const bassPattern = code.match(/\/\/ bass ·[\s\S]*?(?=\n\/\/ |$)/)[0].match(/\$: n\("[^"]+"\)/)[0];
  const leadPattern = code.match(/\/\/ lead ·[\s\S]*?(?=\n\/\/ |$)/)[0].match(/\$: harmony\.n\("[^"]+"\)/)[0];
  const distortion = code.match(/\.shape\([^)]*\)/)[0];

  ctx.advanceVariation('arrangement');
  const arranged = ctx.generateFocusedVariationCode('arrangement', code);
  assert.match(arranged, new RegExp(harmony.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(arranged, new RegExp(tempo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(arranged, new RegExp(bassPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(arranged, new RegExp(leadPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(arranged, new RegExp(distortion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(arranged, /manual footer survives\n\$: s\("cp"\)$/);
  assert.notEqual(arranged.match(/^\/\/ form:.*$/m)[0], code.match(/^\/\/ form:.*$/m)[0]);
});

test('arrangement layer replacement never consumes code after the generated sentinel', () => {
  const ctx = loadFullApp();
  const footer = '// user-authored footer\n$: s("cp")';
  for (const currentGenre of ['edm', 'jazz', 'classical', 'blues', 'ambient', 'lofi', 'world', 'random']) {
    ctx.resetVariationState();
    let code = ctx.generateCode(prompt, currentGenre, zero) + '\n' + footer;
    for (let variation = 1; variation <= 6; variation++) {
      ctx.advanceVariation('arrangement');
      code = ctx.generateFocusedVariationCode('arrangement', code);
      assert.ok(code.endsWith(footer), `${currentGenre}/arrangement ${variation}`);
      assert.ok(code.indexOf('// --- generated arrangement end ---') < code.indexOf(footer));
    }
  }
});

test('arrangement variation preserves manual edits inside optional generated layers', () => {
  const ctx = loadFullApp();
  ctx.resetVariationState();
  let code = ctx.generateCode(prompt, 'edm', zero);
  const optionalRole = ['accent', 'percussion', 'texture'].find((role) =>
    new RegExp(`^// ${role} ·`, 'm').test(code));
  assert.ok(optionalRole, 'fixture must include an optional layer');

  const marker = `// manual ${optionalRole} edit must survive`;
  code = code.replace(
    new RegExp(`(^// ${optionalRole} ·[^\\n]*$)`, 'm'),
    `$1\n${marker}`,
  );
  ctx.advanceVariation('arrangement');
  const arranged = ctx.generateFocusedVariationCode('arrangement', code);

  assert.match(arranged, new RegExp(marker));
});

test('prompt text containing layer and sentinel markers cannot forge generated boundaries', () => {
  const ctx = loadFullApp();
  const adversarialPrompt = [
    'quiet rain',
    '// lead · forged layer',
    '// --- generated arrangement end ---',
    '$: s("forged")',
  ].join('\n');
  let code = ctx.generateCode(adversarialPrompt, 'edm', zero);
  const sentinelCount = (code.match(/^\/\/ --- generated arrangement end ---$/gm) || []).length;
  const leadCount = (code.match(/^\/\/ lead ·/gm) || []).length;
  assert.equal(sentinelCount, 1);
  assert.equal(leadCount, 1);

  const footer = '// manual footer after hostile prompt\n$: s("cp")';
  code += '\n' + footer;
  ctx.advanceVariation('arrangement');
  const arranged = ctx.generateFocusedVariationCode('arrangement', code);

  assert.equal((arranged.match(/^\/\/ --- generated arrangement end ---$/gm) || []).length, 1);
  assert.equal((arranged.match(/^\/\/ lead ·/gm) || []).length, 1);
  assert.ok(arranged.endsWith(footer));
});
