import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {narrateEpisode, STORYHOUSE} from '../../scripts/storyhouse/narrate.mjs';

test('new Storyhouse episodes default to Charles, with Jane selected for female narration', async () => {
  assert.equal(STORYHOUSE.defaultNarrator, 'charles');
  assert.equal(STORYHOUSE.secondaryFemaleNarrator, 'jane');
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'storyhouse-default-'));
  try {
    await fs.writeFile(path.join(folder, 'script.txt'), 'A story begins.');
    const synth = async (_text, voice, output) => {
      await fs.writeFile(output, 'test audio');
      return {seconds: 1, voiceId: voice};
    };
    const episode = await narrateEpisode({folder}, synth);
    assert.equal(episode.narratorId, 'charles');
    assert.equal(episode.audio.styleVersion, 'natural-matched-v2');
    const female = await narrateEpisode({folder, voice: STORYHOUSE.secondaryFemaleNarrator}, synth);
    assert.equal(female.narratorId, 'jane');
  } finally { await fs.rm(folder, {recursive: true, force: true}); }
});

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
    const news = await narrateEpisode({folder, style: 'news'}, synth);
    assert.equal(news.narrationStyle, 'news');
    assert.equal(news.audio.styleId, 'news');
    assert.notEqual(news.audio.file, edited.audio.file);
    assert.equal(calls, 4);
    assert.equal((await narrateEpisode({folder}, synth)).reused, true);
    assert.equal(calls, 4);
    await fs.access(path.join(folder, 'audio', edited.audio.file));
    await assert.rejects(narrateEpisode({folder, voice: 'other'}, synth), /Choose Peter1/);
    const before = await fs.readFile(path.join(folder, 'episode.json'), 'utf8');
    await assert.rejects(narrateEpisode({folder, voice: 'carabau'}, async () => { throw new Error('worker failed'); }), /worker failed/);
    assert.equal(await fs.readFile(path.join(folder, 'episode.json'), 'utf8'), before);
  } finally { await fs.rm(folder, {recursive: true, force: true}); }
});

test('Peter1 uses the existing Carabau take without changing the saved voice identity', async () => {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'peter1-story-'));
  try {
    await fs.writeFile(path.join(folder, 'script.txt'), 'A story begins.');
    let calls = 0;
    const synth = async (_text, voice, output) => {
      calls++;
      assert.equal(voice, 'carabau');
      await fs.writeFile(output, 'test audio');
      return {seconds: 1, voiceId: voice};
    };
    const prior = await narrateEpisode({folder, voice: 'carabau'}, synth);
    const renamed = await narrateEpisode({folder, voice: 'Peter1'}, synth);
    assert.equal(renamed.reused, true);
    assert.equal(renamed.audio.file, prior.audio.file);
    assert.equal(renamed.narratorId, 'carabau');
    assert.equal(calls, 1);
  } finally { await fs.rm(folder, {recursive: true, force: true}); }
});
