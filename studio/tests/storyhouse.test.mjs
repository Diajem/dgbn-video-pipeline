import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {narrateEpisode} from '../../scripts/storyhouse/narrate.mjs';

test('Storyhouse saves voice per episode, reuses unchanged audio and keeps prior takes', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'storyhouse-voice-'));
  try {
    await fs.writeFile(path.join(folder, 'script.txt'), 'The Oba arrived in Benin.');
    let calls = 0;
    const synth = async (text, voice, output) => {
      calls++;
      await fs.writeFile(output, 'test audio');
      return {seconds: 3, voiceId: voice, standardVersion: 'carabau-clean-2026-10-28'};
    };
    const first = await narrateEpisode({folder, voice: 'jane'}, synth);
    assert.equal(first.project, 'Diajem Storyhouse');
    assert.equal(first.narratorId, 'jane');
    assert.equal(first.audio.status, 'DRAFT');
    assert.equal(first.script, 'The Oba arrived in Benin.');
    const reused = await narrateEpisode({folder}, synth);
    assert.equal(reused.reused, true);
    assert.equal(calls, 1);
    const second = await narrateEpisode({folder, voice: 'charles'}, synth);
    assert.equal(second.narratorId, 'charles');
    assert.notEqual(second.audio.file, first.audio.file);
    await fs.access(path.join(folder, 'audio', first.audio.file));
    assert.equal(calls, 2);
    await fs.writeFile(path.join(folder, 'script.txt'), 'The king returned to Benin.');
    const edited = await narrateEpisode({folder}, synth);
    assert.equal(edited.script, 'The king returned to Benin.');
    assert.equal(edited.narratorId, 'charles');
    assert.equal(calls, 3);
    await assert.rejects(narrateEpisode({folder, voice: 'other'}, synth), /Choose Carabau/);
    const before = await fs.readFile(path.join(folder, 'episode.json'), 'utf8');
    await assert.rejects(narrateEpisode({folder, voice: 'carabau'}, async () => { throw new Error('worker failed'); }), /worker failed/);
    assert.equal(await fs.readFile(path.join(folder, 'episode.json'), 'utf8'), before);
  } finally { await fs.rm(folder, {recursive: true, force: true}); }
});
