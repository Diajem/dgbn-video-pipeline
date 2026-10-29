import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {renderFile} from '../../scripts/pocket_tts/narrate.mjs';

test('shared agent command publishes the chosen sound with script metadata and protects existing takes', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-voice-'));
  try {
    const script = path.join(folder, 'script.txt'), output = path.join(folder, 'news.wav');
    await fs.writeFile(script, 'Welcome to Diajem Global Black News.');
    let calls = 0;
    const synth = async (text, voice, file, style) => {
      calls++;
      assert.equal(voice, 'charles'); assert.equal(style, 'news');
      await fs.writeFile(file, 'completed take');
      return {seconds: 3, voiceId: voice, styleId: style, styleVersion: 'news-clarity-2026-10-29'};
    };
    const result = await renderFile({script, output, voice: 'charles', style: 'news'}, synth);
    assert.equal(result.status, 'DRAFT');
    assert.equal(result.script, 'Welcome to Diajem Global Black News.');
    assert.equal(result.styleVersion, 'news-clarity-2026-10-29');
    assert.equal(JSON.parse(await fs.readFile(output + '.json')).scriptSha256, result.scriptSha256);
    await assert.rejects(renderFile({script, output, voice: 'charles'}, synth), /Output exists/);
    assert.equal(calls, 1);
    assert.equal(await fs.readFile(output, 'utf8'), 'completed take');
    const failed = path.join(folder, 'failed.wav');
    await assert.rejects(renderFile({script, output: failed}, async (_t, _v, pending) => {
      await fs.writeFile(pending, 'incomplete'); throw new Error('generation failed');
    }), /generation failed/);
    await assert.rejects(fs.access(failed));
    assert.deepEqual((await fs.readdir(folder)).sort(), ['news.wav', 'news.wav.json', 'script.txt']);
    await assert.rejects(renderFile({script, output: failed, style: 'unknown'}, synth), /natural or news/);
  } finally { await fs.rm(folder, {recursive: true, force: true}); }
});
