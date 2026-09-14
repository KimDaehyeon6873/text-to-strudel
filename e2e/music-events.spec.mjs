import { test, expect } from '@playwright/test';
import { loadMusicEngine, plain } from '../test/helpers/load-app.mjs';

const { api, context } = loadMusicEngine();
const zero = { harmony: 0, melody: 0, groove: 0, arrangement: 0 };
const genres = ['edm', 'jazz', 'classical', 'blues', 'ambient', 'lofi', 'world', 'random', 'fusion:jazz+edm'];

async function strudelHost(page) {
  await page.goto('/index.html');
  const frame = page.frame({ url: /strudel-host\.html/ });
  await frame.waitForFunction(() => Boolean(document.getElementById('strudelEditor')?.editor));
  return frame;
}

test('drum dynamics preserve exactly one onset per written hit', async ({ page }) => {
  const host = await strudelHost(page);
  for (const genre of genres) {
    for (let groove = 0; groove < 4; groove++) {
      const plan = plain(api.createCompositionPlan('햇살과 폭풍 사이의 오래된 춤', genre, { ...zero, groove }));
      if (!plan.drums) continue;
      plan.form.masks.drums = '<1@' + plan.form.length + '>';
      const code = context.getLayerBlock(api.renderCompositionPlan(plan), 'drums');
      const result = await host.evaluate(async ({ code, plan }) => {
        const editor = document.getElementById('strudelEditor').editor;
        editor.setCode(code);
        await editor.evaluate(false);
        if (editor.repl.state.evalError) throw new Error(String(editor.repl.state.evalError));
        const hits = (pattern) => pattern.queryArc(0, 4).filter((event) => event.hasOnset());
        const identity = (event) => [event.value.s, Number(event.whole.begin)];
        const actual = hits(editor.repl.state.pattern);
        const expected = Object.values(plan.drums).filter(Boolean).flatMap((pattern) => {
          let voice = s(mini(pattern));
          if (plan.swing) voice = voice.swing(4);
          return hits(voice).map(identity);
        });
        return {
          actual: actual.map(identity).sort(), expected: expected.sort(),
          velocities: actual.map((event) => [event.value.s, event.value.velocity]),
        };
      }, { code, plan });
      expect(result.actual, `${genre}/groove ${groove}: dropped or duplicated hits`).toEqual(result.expected);
      for (const [sound, velocity] of result.velocities) {
        expect(velocity).toBeGreaterThan(0);
        expect(velocity).toBeLessThanOrEqual(sound === 'hh' ? .301 : .81);
      }
    }
  }
});

test('opaque inputs produce bounded audible scores across genres and successive takes', async ({ page }) => {
  const host = await strudelHost(page);
  for (const genre of genres) {
    for (const [take, input] of ['0123456789', 'q7X-2049/🪐', '!!!?...🫧'].entries()) {
      const plan = plain(api.createCompositionPlan(input, genre, {harmony: take, melody: take, groove: take, arrangement: take}));
      const code = api.renderCompositionPlan(plan);
      const result = await host.evaluate(async ({code, length}) => {
        const editor = document.getElementById('strudelEditor').editor;
        editor.setCode(code); await editor.evaluate(false);
        if (editor.repl.state.evalError) throw new Error(String(editor.repl.state.evalError));
        const events = editor.repl.state.pattern.queryArc(0, length).filter(event => event.hasOnset());
        const tonal = events.filter(event => [2,3,4,5].includes(event.value.orbit));
        // Full voicings use note names; selected melody/bass notes use MIDI.
        const midi = note => {
          if (typeof note === 'number') return note;
          const match = String(note).match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
          if (!match) return NaN;
          return (Number(match[3]) + 1) * 12 + {C:0,D:2,E:4,F:5,G:7,A:9,B:11}[match[1].toUpperCase()] + (match[2] === '#' ? 1 : match[2] === 'b' ? -1 : 0);
        };
        const perCycle = Array.from({length}, (_, cycle) => events.filter(event => Number(event.whole.begin) >= cycle && Number(event.whole.begin) < cycle + 1).length);
        return {
          notes: tonal.flatMap(event => event.value.note).map(midi),
          maxEvents: Math.max(...perCycle),
          harmonyBars: [...new Set(tonal.filter(event => event.value.orbit === 3).map(event => Math.floor(Number(event.whole.begin))))].filter(cycle => cycle >= 0),
          leadAttacks: tonal.filter(event => event.value.orbit === 4).length,
        };
      }, {code, length: plan.form.length});
      expect(result.notes.every(note => Number.isFinite(note) && note >= 12 && note <= 108), `${genre}/${input}: invalid register`).toBe(true);
      expect(result.leadAttacks, `${genre}/${input}: silent melody`).toBeGreaterThan(0);
      expect(result.maxEvents, `${genre}/${input}: excessive density`).toBeLessThan(100);
      expect(result.harmonyBars.length, `${genre}/${input}: silent harmonic bars`).toBeGreaterThanOrEqual(plan.form.length - 1);
    }
  }
});

test('the runtime plays every composed melody attack and keeps the answer in its rests', async ({ page }) => {
  const host = await strudelHost(page);
  for (const genre of genres) {
    for (const melody of [0, 1, 2, 3]) {
      const plan = plain(api.createCompositionPlan('햇살과 폭풍 사이의 오래된 춤', genre, {
        harmony: melody, melody, groove: melody, arrangement: melody,
      }));
      // Open the section masks to inspect a complete phrase, including parts
      // that a normal intro or breakdown temporarily mutes.
      for (const role of Object.keys(plan.form.masks)) plan.form.masks[role] = '<1@' + plan.form.length + '>';
      plan.accentRole = 'counter';
      const code = api.renderCompositionPlan(plan);
      const result = await host.evaluate(async ({ code, plan }) => {
        const editor = document.getElementById('strudelEditor').editor;
        editor.setCode(code);
        await editor.evaluate(false);
        if (editor.repl.state.evalError) throw new Error(String(editor.repl.state.evalError));
        const span = (event) => [Number(event.whole.begin), Number(event.whole.end)];
        const gate = (event) => {
          const [start, end] = span(event);
          return [start, start + (end - start) * (event.value.clip ?? 1)];
        };
        const uniqueSpans = (events) => [...new Set(events.map((event) => JSON.stringify(span(event))))].sort();
        const hits = (pattern) => pattern.queryArc(0, plan.harmony.phraseBars).filter((event) => event.hasOnset());
        const events = hits(editor.repl.state.pattern);
        const lead = events.filter((event) => event.value.orbit === 4);
        const counter = events.filter((event) => event.value.orbit === 5);
        const expected = (pattern) => {
          let rhythm = n(mini(pattern));
          if (plan.swing) rhythm = rhythm.swing(4);
          return uniqueSpans(hits(rhythm));
        };
        return {
          lead: uniqueSpans(lead), expectedLead: expected(plan.phrase.lead),
          counter: uniqueSpans(counter), expectedCounter: expected(plan.phrase.counter),
          notes: lead.concat(counter).map((event) => event.value.note),
          overlaps: counter.some((answer) => lead.some((call) => {
            const [a, b] = gate(answer), [c, d] = gate(call);
            return a < d - 1e-8 && c < b - 1e-8;
          })),
        };
      }, { code, plan });
      expect(result.lead, `${genre}/melody ${melody}: missing lead attacks`).toEqual(result.expectedLead);
      expect(result.counter, `${genre}/melody ${melody}: missing answers`).toEqual(result.expectedCounter);
      expect(result.overlaps, `${genre}: answer overlaps a lead note or sustain`).toBe(false);
      expect(result.notes.every((note) => Number.isFinite(note))).toBe(true);
    }
  }
});
