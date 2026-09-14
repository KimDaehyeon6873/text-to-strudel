// Record the real pinned Strudel/Web Audio graph before destination clipping.
// Local QA only; no recording code is shipped in the application.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { loadMusicEngine } from '../test/helpers/load-app.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const output = option('--out', '/tmp/text-to-strudel-audio');
const url = option('--url', 'http://127.0.0.1:4173/index.html');
const baselinePath = option('--baseline', null);
const input = 'q7X-2049 / 🪐 / 바람... 314159';
const engines = {candidate: loadMusicEngine().api};
if (baselinePath) {
  const baseline = loadMusicEngine();
  const source = fs.readFileSync(baselinePath, 'utf8');
  vm.runInContext(source.slice(0, source.indexOf('// ---- Music Engine End ----')), baseline.context);
  engines.baseline = baseline.context.__TTS_MUSIC_TEST__;
}
fs.mkdirSync(output, {recursive: true});
const browser = await chromium.launch({args: ['--autoplay-policy=no-user-gesture-required']});

async function record(version, genre) {
  const api = engines[version];
  const plan = api.createCompositionPlan(input, genre, {harmony: 0, melody: 0, groove: 0, arrangement: 0});
  const code = api.renderCompositionPlan(plan);
  const page = await browser.newPage();
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    const connect = AudioNode.prototype.connect;
    const graphs = [];
    window.__audioQA = {graphs, recording: false};
    AudioNode.prototype.connect = function(destination, ...args) {
      if (destination === this.context.destination) {
        let graph = graphs.find(graph => graph.context === this.context);
        if (!graph) {
          const context = this.context;
          const input = context.createGain();
          const processor = context.createScriptProcessor(4096, 2, 1);
          graph = {context, input, processor, left: [], right: []};
          const target = graph;
          processor.onaudioprocess = event => {
            if (!window.__audioQA.recording) return;
            target.left.push(event.inputBuffer.getChannelData(0).slice());
            target.right.push(event.inputBuffer.getChannelData(1).slice());
          };
          connect.call(input, processor);
          connect.call(processor, context.destination); // silent output keeps the tap running
          graphs.push(graph);
        }
        connect.call(this, graph.input, ...args);
      }
      return connect.call(this, destination, ...args);
    };
  });
  try {
    await page.goto(url);
    const frame = page.frame({url: /strudel-host\.html/});
    await frame.waitForFunction(() => Boolean(document.getElementById('strudelEditor')?.editor));
    await frame.evaluate(async code => {
      const editor = document.getElementById('strudelEditor').editor;
      editor.setCode(code);
      await editor.evaluate(true);
    }, code);
    // Warm the graph and sample cache, then restart at the form's beginning.
    await page.waitForTimeout(10000);
    const seconds = plan.form.length * 240 / plan.tempo + 2;
    const audio = await frame.evaluate(async seconds => {
      const editor = document.getElementById('strudelEditor').editor;
      await editor.stop();
      window.__audioQA.recording = true;
      await editor.evaluate(true);
      await new Promise(resolve => setTimeout(resolve, seconds * 1000));
      window.__audioQA.recording = false;
      await editor.stop();
      const graph = window.__audioQA.graphs.find(graph => graph.left.length);
      if (!graph) throw new Error('No Web Audio samples captured');
      const frames = graph.left.reduce((sum, chunk) => sum + chunk.length, 0);
      const interleaved = new Float32Array(frames * 2);
      let offset = 0;
      graph.left.forEach((left, index) => {
        const right = graph.right[index];
        for (let i = 0; i < left.length; i++) {
          interleaved[offset++] = left[i]; interleaved[offset++] = right[i];
        }
      });
      const blob = new Blob([interleaved.buffer]);
      const data = await new Promise(resolve => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob);
      });
      return {data, sampleRate: graph.context.sampleRate, frames, error: String(editor.repl.state.evalError || editor.repl.state.schedulerError || '')};
    }, seconds);
    if (audio.error) throw new Error(audio.error);
    const samples = Buffer.from(audio.data.split(',')[1], 'base64');
    const header = Buffer.alloc(44);
    header.write('RIFF', 0); header.writeUInt32LE(36 + samples.length, 4); header.write('WAVEfmt ', 8);
    header.writeUInt32LE(16, 16); header.writeUInt16LE(3, 20); header.writeUInt16LE(2, 22);
    header.writeUInt32LE(audio.sampleRate, 24); header.writeUInt32LE(audio.sampleRate * 8, 28);
    header.writeUInt16LE(8, 32); header.writeUInt16LE(32, 34); header.write('data', 36); header.writeUInt32LE(samples.length, 40);
    const name = `${version}-${genre}`;
    fs.writeFileSync(path.join(output, name + '.wav'), Buffer.concat([header, samples]));
    fs.writeFileSync(path.join(output, name + '.strudel'), code + '\n');
    fs.writeFileSync(path.join(output, name + '.json'), JSON.stringify({input, genre, version, tempo: plan.tempo, seconds, frames: audio.frames, sampleRate: audio.sampleRate, scoreSha256: createHash('sha256').update(code).digest('hex'), consoleErrors: [...new Set(errors)]}, null, 2));
    console.log(`${name}: captured ${(audio.frames / audio.sampleRate).toFixed(1)}s; ${errors.length} console errors`);
  } finally { await page.close(); }
}

try {
  for (const genre of ['edm', 'ambient']) {
    await Promise.all(Object.keys(engines).map(version => record(version, genre)));
  }
} finally { await browser.close(); }
