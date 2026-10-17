// Google Cloud Text-to-Speech narration. The API key lives only on this computer (studio/data/secrets.json, git-ignored)
// or in the GOOGLE_TTS_API_KEY environment variable / .env file. It is never sent to the browser or logged.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {HttpError} from './project.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SECRETS = path.join(HERE, '..', 'data', 'secrets.json');
const ENDPOINT = process.env.STUDIO_TTS_ENDPOINT || 'https://texttospeech.googleapis.com/v1/text:synthesize';
const SAMPLE_RATE = 24000;
const MAX_BYTES = 4200; // Google limit is 5000 bytes of text per request

export const VOICES = [
  {id: 'en-GB-Chirp3-HD-Charon', label: 'British male - Charon (Chirp 3 HD, calm newsreader)'},
  {id: 'en-GB-Chirp3-HD-Fenrir', label: 'British male - Fenrir (Chirp 3 HD, stronger)'},
  {id: 'en-GB-Chirp3-HD-Aoede', label: 'British female - Aoede (Chirp 3 HD, warm)'},
  {id: 'en-GB-Chirp3-HD-Kore', label: 'British female - Kore (Chirp 3 HD, clear)'},
  {id: 'en-GB-Studio-B', label: 'British male - Studio B'},
  {id: 'en-GB-Studio-C', label: 'British female - Studio C'},
  {id: 'en-GB-Neural2-B', label: 'British male - Neural2 B'},
  {id: 'en-GB-Neural2-A', label: 'British female - Neural2 A'},
];

async function readSecrets() {
  try { return JSON.parse(await fs.readFile(SECRETS, 'utf8')); } catch { return {}; }
}
export async function getKey() {
  const s = await readSecrets();
  return (s.googleTtsApiKey || process.env.GOOGLE_TTS_API_KEY || '').trim();
}
export async function saveKey(key) {
  key = String(key || '').trim();
  if (!/^[A-Za-z0-9_\-]{20,80}$/.test(key)) throw new HttpError(400, 'That does not look like a Google API key (it is one long line of letters and numbers)');
  const secrets = await readSecrets();
  secrets.googleTtsApiKey = key;
  await fs.mkdir(path.dirname(SECRETS), {recursive: true});
  await fs.writeFile(SECRETS, JSON.stringify(secrets), {mode: 0o600});
}
export async function clearKey() {
  const secrets = await readSecrets();
  delete secrets.googleTtsApiKey;
  await fs.mkdir(path.dirname(SECRETS), {recursive: true});
  await fs.writeFile(SECRETS, JSON.stringify(secrets), {mode: 0o600});
}

export function chunkText(text) {
  const out = [];
  let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (const para of String(text).replace(/\r/g, '').split(/\n{2,}|\n/)) {
    for (const sentence of para.match(/[^.!?]+[.!?]*["')\]]*\s*/g) || [para]) {
      if (Buffer.byteLength(cur + sentence) > MAX_BYTES) push();
      cur += sentence;
    }
    cur += ' ';
  }
  push();
  return out;
}

async function synth(text, voice, key, signal) {
  const res = await fetch(ENDPOINT, {
    method: 'POST', signal,
    headers: {'content-type': 'application/json', 'x-goog-api-key': key},
    body: JSON.stringify({input: {text}, voice: {languageCode: 'en-GB', name: voice}, audioConfig: {audioEncoding: 'LINEAR16', sampleRateHertz: SAMPLE_RATE}}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || res.statusText;
    if (/billing/i.test(msg)) throw new HttpError(502, 'Google says billing is not switched on for this project. Link a billing account to the Diajem Newsroom project (the monthly free allowance still applies), then try again.');
    if (res.status === 403) throw new HttpError(502, 'Google refused the key. Check that the Cloud Text-to-Speech API is enabled and the key is allowed to use it. (' + msg + ')');
    if (res.status === 400 && /voice/i.test(msg)) throw new HttpError(502, 'Google does not offer that voice: ' + msg);
    throw new HttpError(502, 'Google voice failed: ' + msg);
  }
  const wav = Buffer.from(body.audioContent || '', 'base64');
  if (wav.length < 100) throw new HttpError(502, 'Google returned no audio');
  const at = wav.indexOf('data');
  return wav.subarray(at >= 0 ? at + 8 : 44); // raw 16-bit PCM
}

export async function narrate(text, voice, outFile) {
  const key = await getKey();
  if (!key) throw new HttpError(400, 'Add your Google API key first');
  if (!VOICES.some(v => v.id === voice)) throw new HttpError(400, 'Unknown voice');
  const parts = [];
  const gap = Buffer.alloc(Math.round(SAMPLE_RATE * 0.35) * 2);
  const signal = AbortSignal.timeout(120000);
  for (const chunk of chunkText(text)) { parts.push(await synth(chunk, voice, key, signal), gap); }
  const pcm = Buffer.concat(parts);
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24); header.writeUInt32LE(SAMPLE_RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  await fs.writeFile(outFile, Buffer.concat([header, pcm]));
  return {seconds: pcm.length / 2 / SAMPLE_RATE};
}
