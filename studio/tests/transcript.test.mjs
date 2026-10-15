import test from 'node:test';
import assert from 'node:assert/strict';
import {alignWords, sceneBounds, gateProject, orientationOf} from '../lib/project.mjs';

const words = ['one', 'two', 'three', 'four', 'five', 'six'].map((word, i) => ({word, start: i, end: i + 0.6}));

test('script words matching the transcript take its exact timing', () => {
  const out = alignWords('One two three four five six', words);
  assert.equal(out.length, 6);
  assert.deepEqual(out[2], {text: 'three', start: 2, end: 2.6});
});
test('a corrected script with extra words keeps timings inside the recording', () => {
  const out = alignWords('One two three four five six seven', words);
  assert.equal(out.length, 7);
  assert.ok(out.every(w => w.end > w.start && w.start >= 0 && w.end <= 6.6 + 1e-9));
  assert.ok(out.every((w, i) => i === 0 || w.start >= out[i - 1].start));
});
test('scene boundaries sit in the pause between words', () => {
  const scenes = [{text: 'one two three'}, {text: 'four five six'}];
  const b = sceneBounds(scenes, words, 7);
  assert.deepEqual(b[0], {startSec: 0, endSec: 2.8});
  assert.deepEqual(b[1], {startSec: 2.8, endSec: 7});
});
test('a transcript replaces the need for a typed script', () => {
  const p = {headline: 'x', script: '', scenes: [], productionMode: 'REAL_CAMERA', presenter: {file: 'a.mp4', status: 'APPROVED', transcript: {words}}};
  assert.ok(gateProject(p).blockers.some(b => b.includes('Transcribe')));
});
test('missing transcript only warns', () => {
  const p = {headline: 'x', script: 'One two.', scenes: [{text: 'One two.', layout: 'presenter', assets: []}], productionMode: 'REAL_CAMERA', presenter: {file: 'a.mp4', status: 'APPROVED'}};
  const g = gateProject(p);
  assert.deepEqual(g.blockers, []);
  assert.ok(g.warnings.some(w => w.includes('No transcript')));
});
test('orientation defaults to portrait', () => {
  assert.equal(orientationOf({}), 'PORTRAIT');
  assert.equal(orientationOf({orientation: 'LANDSCAPE'}), 'LANDSCAPE');
});
