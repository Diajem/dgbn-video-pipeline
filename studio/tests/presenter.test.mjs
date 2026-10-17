import test from 'node:test';
import assert from 'node:assert/strict';
import {gateProject, modeOf, splitScenes} from '../lib/project.mjs';

const project = () => ({
  headline: 'Studio check', script: 'One sentence. Another sentence.',
  scenes: [{text: 'One sentence.', layout: 'presenter', assets: []}, {text: 'Another sentence.', layout: 'presenter', assets: []}],
  productionMode: 'PRESENTER', presenter: {file: 'presenter.mp4', status: 'APPROVED'}
});
test('legacy projects remain faceless', () => assert.equal(modeOf({}), 'FACELESS'));
test('approved continuous presenter needs no separate audio or B-roll', () => assert.deepEqual(gateProject(project()).blockers, []));
test('final presenter export requires review', () => {
  const p = project(); p.presenter.status = 'DRAFT';
  assert.ok(gateProject(p).blockers.some(b => b.includes('approve')));
  assert.deepEqual(gateProject(p, {draft:true}).blockers, []);
});
test('B-roll and PIP need their own assets', () => {
  for (const layout of ['broll', 'pip']) {
    const p = project(); p.scenes[1].layout = layout;
    assert.ok(gateProject(p).blockers.some(b => b.includes('picture-in-picture')));
  }
});
test('changed scripts cannot reuse a stale presenter storyboard', () => {
  const p = project(); p.script += ' Changed line.';
  assert.ok(gateProject(p).blockers.some(b => b.includes('Split it')));
});
test('re-splitting retains layout choices', () => {
  const scenes = splitScenes('One paragraph.\n\nSecond paragraph.', [{id:'s123456',layout:'pip',assets:[]}]);
  assert.equal(scenes[0].layout, 'pip');
});
test('real camera recording can render with one scene and no script', () => {
  const p = project(); p.productionMode = 'REAL_CAMERA'; p.script = '';
  p.scenes = [{id: 's123456', text: '', layout: 'presenter', assets: []}];
  assert.deepEqual(gateProject(p).blockers, []);
  p.scenes.push({...p.scenes[0], id: 's654321'});
  assert.ok(gateProject(p).blockers.some(b => b.includes('one continuous')));
});
