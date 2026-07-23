import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMusicEngine, plain } from './helpers/load-app.mjs';

const { api } = loadMusicEngine();
const metrics = ['energy', 'brightness', 'weight', 'space', 'complexity', 'valence', 'tension'];

test('analyzeText returns finite normalized metrics for Unicode and Hangul corpus', () => {
  for (const input of ['안녕하세요 세상', '햇살과 바람 🌤️', '조용한 밤…', 'café déjà vu', '東京の雨']) {
    const analysis = api.analyzeText(input);
    for (const metric of metrics) {
      assert.ok(Number.isFinite(analysis[metric]), `${input}: ${metric} must be finite`);
      assert.ok(analysis[metric] >= 0 && analysis[metric] <= 1, `${input}: ${metric} must be normalized`);
    }
  }
});

test('analyzeText does not collapse distinct Hangul prompts to one analysis', () => {
  const analyses = [
    '햇살이 번지는 여름 바람',
    '비 내리는 겨울밤의 그림자',
    '불꽃처럼 달려가는 폭풍',
    '고요히 숨 쉬는 평온한 호수',
  ].map((input) => JSON.stringify(plain(api.analyzeText(input))));
  assert.equal(new Set(analyses).size, analyses.length);
});

test('analyzeText distinguishes bright and dark Korean semantics', () => {
  const bright = api.analyzeText('햇살 빛 여름 미소 기쁨 희망 사랑');
  const dark = api.analyzeText('밤 그림자 비 슬픔 외로움 공허 겨울');
  assert.ok(bright.brightness > dark.brightness);
  assert.ok(bright.valence > dark.valence);
});

test('analyzeText distinguishes intense and calm Korean semantics', () => {
  const intense = api.analyzeText('불 분노 번개 폭풍 질주 폭발 격렬');
  const calm = api.analyzeText('고요 평온 잠 숨 부드러운 잔잔 느린');
  assert.ok(intense.energy > calm.energy);
  assert.ok(intense.tension > calm.tension);
});
