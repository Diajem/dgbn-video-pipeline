// Local speech-to-text with word timings (Whisper via transformers.js). No cloud, no cost.
// Usage: node transcribe.mjs <media> <out.json> [model] [language|auto]
import {pipeline, env} from '@huggingface/transformers';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
env.cacheDir = path.join(here, 'models');
const [media, outFile, model = 'onnx-community/whisper-small_timestamped', language = 'english'] = process.argv.slice(2);
if (!media || !outFile) { console.error('usage: node transcribe.mjs <media> <out.json> [model] [language]'); process.exit(2); }

// 16 kHz mono PCM via ffmpeg (system ffmpeg, or the one Remotion ships with)
function ffmpegPath() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const probe = spawnSync('ffmpeg', ['-version'], {encoding: 'utf8'});
  if (probe.status === 0) return 'ffmpeg';
  const root = path.resolve(here, '..', '..', 'node_modules');
  for (const pkg of ['@remotion/compositor-win32-x64-msvc', '@remotion/compositor-linux-x64-gnu', '@remotion/compositor-darwin-arm64', '@remotion/compositor-darwin-x64']) {
    const f = path.join(root, pkg, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    if (fs.existsSync(f)) return f;
  }
  throw new Error('ffmpeg not found');
}
const r = spawnSync(ffmpegPath(), ['-v', 'error', '-i', media, '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', '-'], {maxBuffer: 1024 * 1024 * 1024});
if (r.status !== 0) throw new Error('ffmpeg failed: ' + String(r.stderr));
const buf = r.stdout;
const audio = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
const durationSec = audio.length / 16000;

const asr = await pipeline('automatic-speech-recognition', model, {dtype: 'q8', progress_callback: p => { if (p.status === 'progress' && Math.round(p.progress) % 20 === 0) console.error(`model ${p.file} ${Math.round(p.progress)}%`); }});
const out = await asr(audio, {return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5, ...(language && language !== 'auto' ? {language} : {}), task: 'transcribe'});
const words = (out.chunks || []).map(c => ({word: c.text.trim(), start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] + 0.3})).filter(w => w.word);
fs.writeFileSync(outFile, JSON.stringify({model, language, durationSec, text: out.text.trim(), words}, null, 2));
console.log(JSON.stringify({words: words.length, durationSec}));
