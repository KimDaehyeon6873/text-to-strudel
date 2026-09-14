import fs from 'node:fs';
import vm from 'node:vm';
import { loadMusicEngine } from '../test/helpers/load-app.mjs';

const args = process.argv.slice(2);
const argument = (name) => args[args.indexOf(name) + 1];
const baselinePath = args.includes('--baseline') ? argument('--baseline') : null;
const output = args.includes('--out') ? argument('--out') : '/tmp/text-to-strudel-music-audit.json';
const genres = ['edm', 'jazz', 'classical', 'blues', 'ambient', 'lofi', 'world', 'random', 'fusion:jazz+edm'];
const corpus = ['q7X-2049 / 🪐 / 바람... 314159', '0123456789', 'loop loop loop / 東京의 비'];
const zero = { harmony: 0, melody: 0, groove: 0, arrangement: 0 };
const takes = 64;

function audit(api) {
  return genres.map((genre) => {
    const rows = corpus.map((input) => {
      const melodies = new Set(), grooves = new Set(), arrangements = new Set(), harmonies = new Set();
      for (let take = 0; take < takes; take++) {
        melodies.add(api.createCompositionPlan(input, genre, {...zero, melody: take}).phrase.lead);
        const groove = api.createCompositionPlan(input, genre, {...zero, groove: take});
        if (groove.drums) grooves.add(JSON.stringify(groove.drums));
        const arrangement = api.createCompositionPlan(input, genre, {...zero, arrangement: take});
        arrangements.add(JSON.stringify([arrangement.form.masks, arrangement.sounds]));
        const harmony = api.createCompositionPlan(input, genre, {...zero, harmony: take});
        harmonies.add(JSON.stringify(harmony.harmony.symbols));
      }
      return {melodies: melodies.size, grooves: grooves.size, arrangements: arrangements.size, harmonies: harmonies.size};
    });
    return {genre, minimumDistinct: Object.fromEntries(Object.keys(rows[0]).map((field) => [field, Math.min(...rows.map(row => row[field]))]))};
  });
}

const report = {takes, corpus, measurement: 'Minimum distinct musical outputs across the three inputs; comments and labels excluded. Groove 0 means no drums.', candidate: audit(loadMusicEngine().api)};
if (baselinePath) {
  const baseline = loadMusicEngine();
  const source = fs.readFileSync(baselinePath, 'utf8');
  vm.runInContext(source.slice(0, source.indexOf('// ---- Music Engine End ----')), baseline.context);
  report.baseline = audit(baseline.context.__TTS_MUSIC_TEST__);
}
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.table(report.candidate.map(row => ({genre: row.genre, ...row.minimumDistinct})));
console.log(`Saved ${output}`);
