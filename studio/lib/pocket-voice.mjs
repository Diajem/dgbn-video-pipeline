import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {existsSync} from 'node:fs';
import {ROOT, HttpError} from './project.mjs';

const SCRIPT = path.join(ROOT, 'scripts', 'pocket_tts', 'engine.py');
const registry = JSON.parse(await fs.readFile(path.join(ROOT, 'config', 'narration-voices.json'), 'utf8'));
const localPython = path.join(ROOT, '.venv-voice', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
export const POCKET_VOICES = registry.voices;
export const DEFAULT_NARRATOR = registry.defaultVoice;
export function requireNarrator(id) {
  const voice = POCKET_VOICES.find(v => v.id === id);
  if (!voice) throw new HttpError(400, 'Choose Carabau, Charles or Jane');
  return voice;
}

function run(args, input, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const child = execFile(process.env.POCKET_TTS_PYTHON || (existsSync(localPython) ? localPython : 'python'), [SCRIPT, ...args],
      {cwd: ROOT, timeout, maxBuffer: 2 * 1024 * 1024, windowsHide: true}, (error, stdout, stderr) => {
        if (error) {
          let message = error.code === 'ENOENT' ? 'Pocket TTS Python is not installed or configured' : 'Pocket TTS could not finish the narration';
          for (const line of String(stderr || '').trim().split('\n').reverse()) {
            try { const body = JSON.parse(line); if (body.error) message = body.error; break; } catch {}
          }
          return reject(new HttpError(503, message));
        }
        try { resolve(JSON.parse(stdout.trim().split('\n').at(-1))); }
        catch { reject(new HttpError(502, 'Pocket TTS returned an invalid result')); }
      });
    child.stdin.on('error', () => {});
    child.stdin.end(input ? JSON.stringify(input) : '');
  });
}

export async function pocketStatus() {
  try { return await run(['--status']); }
  catch (error) {
    return {runtimeReady: false, defaultVoice: DEFAULT_NARRATOR, standardVersion: registry.standardVersion,
      error: error.message, voices: POCKET_VOICES.map(({id, label, gender}) => ({id, label, gender, ready: false}))};
  }
}

// Pocket TTS is not thread-safe. Keep one CPU synthesis running at a time.
let queue = Promise.resolve();
export function narratePocket(text, voice, outFile) {
  requireNarrator(voice);
  if (!String(text || '').trim() || text.length > 20000) throw new HttpError(400, 'Add a script of up to 20,000 characters');
  const task = queue.then(() => run(['--output', outFile], {text, voice}, 20 * 60 * 1000));
  queue = task.catch(() => {});
  return task;
}
