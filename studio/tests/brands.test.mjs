import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const secretsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-gpt-'));
process.env.STUDIO_SECRETS_FILE = path.join(secretsDir, 'secrets.json');
const {BRANDS, BRAND_INFO, EDITIONS, editionOf, gateProject, bookendClips} = await import('../lib/project.mjs');
const {assertSlot} = await import('../lib/brand-clips.mjs');
const {saveGptImage, generateGptImage, buildPrompt, PROMPT_GUARD} = await import('../lib/gpt-image.mjs');

test('four brands, with old DGBN projects kept as DGBN Africa', () => {
  assert.deepEqual(BRANDS, ['DGBN', 'DGBN_CARIBBEAN', 'DGBN_DIASPORA', 'DSN']);
  assert.equal(BRAND_INFO.DGBN.name, 'DGBN Africa News');
  for (const b of BRANDS) assert.match(BRAND_INFO[b].accent, /^#[0-9a-f]{6}$/i);
});

test('projects default to the morning edition', () => {
  assert.deepEqual(EDITIONS, ['MORNING', 'EVENING']);
  assert.equal(editionOf({}), 'MORNING');
  assert.equal(editionOf({edition: 'EVENING'}), 'EVENING');
});

test('intro/outro slots reject unknown brands, editions and slots', () => {
  assert.doesNotThrow(() => assertSlot('DGBN_CARIBBEAN', 'EVENING', 'intro'));
  assert.throws(() => assertSlot('CNN', 'EVENING', 'intro'), /Unknown brand/);
  assert.throws(() => assertSlot('DSN', 'NOON', 'intro'), /Unknown edition/);
  assert.throws(() => assertSlot('DSN', 'MORNING', 'middle'), /intro or outro/);
});

test('turning bookends off uses no clips and gives no warnings', async () => {
  assert.deepEqual(await bookendClips({brand: 'DSN', bookends: false}), {clips: {}, warnings: []});
});

test('a labelled AI image on a present-day story is accepted without a warning', () => {
  const project = {
    headline: 'Kingston flood response', script: 'Water is rising.', storyType: 'present', format: 'short',
    scenes: [{text: 'Water is rising.', assets: [{file: 'a.png', label: 'AI-GENERATED ILLUSTRATION', rights: 'ai_labelled'}]}],
    audio: {file: 'n.wav', status: 'APPROVED'},
  };
  const {blockers, warnings} = gateProject(project);
  assert.deepEqual(blockers, []);
  assert.equal(warnings.some(w => /present-day/.test(w)), false);
});

test('every GPT prompt carries the no-real-people guard', () => {
  assert.ok(buildPrompt('A flooded street at dusk').endsWith(PROMPT_GUARD));
  assert.throws(() => buildPrompt('hi'), /Describe/);
});

test('GPT image request uses the saved model and a frame-shaped size', async () => {
  await saveGptImage({apiKey: 'sk-test_' + 'x'.repeat(24), model: 'gpt-image-2'});
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  let sent;
  const fakeFetch = async (url, options) => {
    sent = {url, body: JSON.parse(options.body), auth: options.headers.Authorization};
    return {ok: true, json: async () => ({data: [{b64_json: png.toString('base64')}]})};
  };
  const image = await generateGptImage({prompt: 'A flooded street at dusk', orientation: 'LANDSCAPE', quality: 'low'}, fakeFetch);
  assert.equal(sent.url, 'https://api.openai.com/v1/images/generations');
  assert.equal(sent.body.model, 'gpt-image-2');
  assert.equal(sent.body.size, '1536x1024');
  assert.equal(sent.body.quality, 'low');
  assert.match(sent.auth, /^Bearer sk-test_/);
  assert.equal(image.ext, '.png');
});

test.after(() => fs.rm(secretsDir, {recursive: true, force: true}));
