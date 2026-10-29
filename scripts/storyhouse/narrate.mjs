// Storyhouse episode narration. Shares the approved engine and private voice pack with the Video Studio.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {ROOT} from '../../studio/lib/project.mjs';
import {requireNarrator, requireNarrationStyle, pocketStatus, narratePocket} from '../../studio/lib/pocket-voice.mjs';

export const STORYHOUSE = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'storyhouse-narration.json'), 'utf8'));

export async function narrateEpisode({folder, scriptFile, voice, style, regenerate = false}, synth = narratePocket) {
  if (!folder) throw new Error('Choose a Storyhouse episode folder with --project');
  folder = path.resolve(folder);
  const manifest = path.join(folder, 'episode.json');
  let episode;
  try { episode = JSON.parse(await fs.readFile(manifest, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; episode = {}; }
  const narratorId = voice || episode.narratorId || STORYHOUSE.defaultNarrator;
  if (!STORYHOUSE.narrators.includes(narratorId)) throw new Error('Choose Carabau, Charles or Jane for Storyhouse');
  requireNarrator(narratorId);
  const narrationStyle = style || episode.narrationStyle || 'natural';
  requireNarrationStyle(narrationStyle);
  let script;
  if (scriptFile) script = await fs.readFile(path.resolve(scriptFile), 'utf8');
  else {
    try { script = await fs.readFile(path.join(folder, 'script.txt'), 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT' || typeof episode.script !== 'string') throw error;
      script = episode.script;
    }
  }
  if (!script.trim() || script.length > 20000) throw new Error('Add an episode script of up to 20,000 characters');
  const scriptSha256 = crypto.createHash('sha256').update(script).digest('hex');
  if (!regenerate && episode.audio?.voiceId === narratorId && episode.audio?.scriptSha256 === scriptSha256 &&
      (episode.audio?.styleId || 'natural') === narrationStyle &&
      /^[\w.-]+\.wav$/.test(episode.audio.file || '')) {
    try { await fs.access(path.join(folder, 'audio', episode.audio.file)); return {...episode, reused: true}; } catch {}
  }
  const filename = 'narration-' + crypto.randomBytes(6).toString('hex') + '.wav';
  const output = path.join(folder, 'audio', filename);
  await fs.mkdir(path.dirname(output), {recursive: true});
  try {
    const result = await synth(script, narratorId, output, narrationStyle);
    const updated = {...episode, project: STORYHOUSE.projectName, script, narratorId, narrationStyle,
      audio: {...result, file: filename, voiceId: narratorId, styleId: narrationStyle, scriptSha256, status: 'DRAFT', provider: 'pocket-tts'},
      updatedAt: new Date().toISOString()};
    const pending = manifest + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
    await fs.writeFile(pending, JSON.stringify(updated, null, 2) + '\n', 'utf8');
    await fs.rename(pending, manifest);
    return updated;
  } catch (error) {
    await fs.unlink(output).catch(() => {});
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--list-voices')) return console.log(JSON.stringify(await pocketStatus(), null, 2));
  const allowed = new Set(['--project', '--script', '--voice', '--style', '--regenerate']);
  const options = {};
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!allowed.has(flag)) throw new Error('Usage: npm run storyhouse:voice -- --project <episode-folder> [--script <text-file>] [--voice carabau|charles|jane] [--style natural|news] [--regenerate]');
    if (flag === '--regenerate') options.regenerate = true;
    else {
      const value = args[++index];
      if (!value || value.startsWith('--')) throw new Error('Missing value for ' + flag);
      options[{'--project': 'folder', '--script': 'scriptFile', '--voice': 'voice', '--style': 'style'}[flag]] = value;
    }
  }
  const episode = await narrateEpisode(options);
  console.log(JSON.stringify({project: episode.project, narratorId: episode.narratorId,
    file: path.resolve(options.folder, 'audio', episode.audio.file), status: episode.audio.status,
    styleId: episode.audio.styleId, seconds: episode.audio.seconds, reused: !!episode.reused}, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
