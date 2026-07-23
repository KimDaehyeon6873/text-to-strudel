import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMusicEngine, plain } from './helpers/load-app.mjs';

const { api } = loadMusicEngine();
const genres = ['edm', 'jazz', 'classical', 'blues', 'ambient', 'lofi', 'world'];
const corpus = [
  '햇살이 번지는 여름 바람',
  '비 내리는 새벽, 혼자 남은 불빛',
  '불꽃처럼 달려가는 폭풍',
];
const zero = { harmony: 0, melody: 0, groove: 0, arrangement: 0 };

function maskDuration(mask) {
  return [...mask.matchAll(/[01](?:@(\d+))?/g)]
    .reduce((sum, match) => sum + Number(match[1] || 1), 0);
}

function layerBodies(code) {
  const chunks = code.split(/(?=^\/\/ (?:drums|bass|harmony|lead|accent|percussion|texture) ·)/m);
  return chunks.filter((chunk) => /^\/\/ (?:drums|bass|harmony|lead|accent|percussion|texture) ·/.test(chunk));
}

test('createCompositionPlan is deterministic for identical text genre and variation state', () => {
  const a = plain(api.createCompositionPlan(corpus[0], 'edm', zero));
  const b = plain(api.createCompositionPlan(corpus[0], 'edm', zero));
  assert.deepEqual(a, b);
});

test('renderCompositionPlan is deterministic for an identical plan', () => {
  const plan = api.createCompositionPlan(corpus[0], 'jazz', zero);
  assert.equal(api.renderCompositionPlan(plan), api.renderCompositionPlan(plan));
});

test('every base genre and corpus item renders four to seven musical layers', () => {
  for (const genre of genres) {
    for (const prompt of corpus) {
      const plan = api.createCompositionPlan(prompt, genre, zero);
      const code = api.renderCompositionPlan(plan);
      const count = layerBodies(code).length;
      assert.ok(count >= 4 && count <= 7, `${genre}/${prompt}: rendered ${count} layers`);
      assert.equal(plan.layerRoles.length, count, `${genre}/${prompt}: layer metadata must match code`);
    }
  }
});

test('every base genre and corpus item declares exactly one shared harmony', () => {
  for (const genre of genres) {
    for (const prompt of corpus) {
      const plan = api.createCompositionPlan(prompt, genre, zero);
      const code = api.renderCompositionPlan(plan);
      assert.equal((code.match(/^const harmony =/gm) || []).length, 1, `${genre}/${prompt}`);
      assert.ok(
        code.includes(`const harmony = chord("<${plan.harmony.symbols.join(' ')}>").dict("ireal")`),
        `${genre}/${prompt}: rendered harmony must match the plan`,
      );
    }
  }
});

test('normal forms are 16 cycles and blues forms preserve 12-bar phrases in 24 cycles', () => {
  for (const genre of genres) {
    const plan = api.createCompositionPlan(corpus[1], genre, zero);
    if (genre === 'blues') {
      assert.equal(plan.harmony.harmonicBars, 12);
      assert.equal(plan.harmony.phraseBars, 12);
      assert.equal(plan.form.length, 24);
    } else {
      assert.equal(plan.form.length, 16, genre);
    }
  }
});

test('every arrangement mask duration equals its form length', () => {
  for (const forms of [api.FORMS_16, api.FORMS_AMBIENT, api.FORMS_BLUES]) {
    for (const form of forms) {
      for (const [role, mask] of Object.entries(form.masks)) {
        assert.equal(maskDuration(mask), form.length, `${form.name}/${role}: ${mask}`);
      }
    }
  }
});

test('tonal layers derive notes from the shared harmony without legacy scale-degree offsets', () => {
  for (const genre of genres) {
    const code = api.renderCompositionPlan(api.createCompositionPlan(corpus[2], genre, zero));
    const tonal = layerBodies(code).filter((body) => /^\/\/ (?:bass|harmony|lead|accent) ·/.test(body));
    for (const body of tonal) {
      const role = body.match(/^\/\/ ([^ ·]+)/)[1];
      if (role === 'bass') {
        assert.match(body, /^\$: n\("[\s\S]+?\.set\(harmony\)\.mode\("root:/m);
      } else if (role === 'harmony') {
        assert.match(body, /^\$: harmony\.anchor\(/m);
      } else {
        assert.match(body, /^\$: harmony\.n\(/m);
      }
      assert.doesNotMatch(body, /\.scale\(/, `${genre}/${role} must not create an independent scale`);
      assert.doesNotMatch(body, /(?:^|[^\w])n\([^\n]+\)\s*\.add\(7\)/, `${genre}/${role} must not assume a fixed +7 degree`);
    }
  }
});

test('base genres keep their parts in genre-appropriate registers', () => {
  const expected = {
    edm: { harmony: 4, bass: 1, lead: 4, accent: 5 },
    jazz: { harmony: 3, bass: 2, lead: 4, accent: 5 },
    classical: { harmony: 3, bass: 2, lead: 4, accent: 5 },
    blues: { harmony: 3, bass: 2, lead: 3, accent: 4 },
    ambient: { harmony: 3, bass: 2, lead: 4, accent: 5 },
    lofi: { harmony: 3, bass: 2, lead: 4, accent: 5 },
    world: { harmony: 3, bass: 2, lead: 4, accent: 5 },
  };
  for (const genre of genres) {
    const plan = api.createCompositionPlan(corpus[0], genre, zero);
    assert.deepEqual(plain(plan.registers), expected[genre], genre);
  }
});

test('Random and Fusion keep four to seven valid layers across consecutive takes', () => {
  for (const genre of ['random', 'fusion:edm+jazz']) {
    for (const prompt of corpus) {
      for (let take = 0; take < 12; take++) {
        const state = { harmony: take, melody: take, groove: take, arrangement: take };
        const code = api.renderCompositionPlan(api.createCompositionPlan(prompt, genre, state));
        const count = layerBodies(code).length;
        assert.ok(count >= 4 && count <= 7, `${genre}/${prompt}/take ${take}: ${count} layers`);
        assert.equal((code.match(/^const harmony =/gm) || []).length, 1);
        assert.doesNotMatch(code, /(?:undefined|NaN|null)/);
      }
    }
  }
});
