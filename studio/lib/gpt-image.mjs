// AI images from OpenAI's GPT Image models. The API key lives only on this computer (studio/data/secrets.json, git-ignored).
// Used as the last resort, when Wikimedia Commons, stock and branded cards have nothing suitable. Every image is labelled AI-generated.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {userError} from './sources.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SECRETS = process.env.STUDIO_SECRETS_FILE || path.join(HERE, '..', 'data', 'secrets.json');
const API = 'https://api.openai.com/v1';
export const DEFAULT_MODEL = 'gpt-image-2';
export const QUALITIES = ['low', 'medium', 'high'];
// Added to every prompt so a generated picture is not passed off as a real person or a photo of the event.
export const PROMPT_GUARD = 'Editorial news illustration. Do not show identifiable real people, real logos, flags with text, or any writing.';

async function readSecrets() {
  try { return JSON.parse(await fs.readFile(SECRETS, 'utf8')); } catch { return {}; }
}
async function writeSecrets(secrets) {
  await fs.mkdir(path.dirname(SECRETS), {recursive: true});
  await fs.writeFile(SECRETS, JSON.stringify(secrets), {mode: 0o600});
}
async function settings() {
  const s = await readSecrets();
  return {key: s.openaiApiKey || process.env.OPENAI_API_KEY || '', model: s.gptImageModel || process.env.GPT_IMAGE_MODEL || DEFAULT_MODEL};
}

// Never returns the key itself.
export async function gptImageStatus() {
  const {key, model} = await settings();
  return {keySaved: !!key, model, qualities: QUALITIES};
}

export async function saveGptImage({apiKey, model} = {}) {
  const s = await readSecrets();
  if (apiKey !== undefined) {
    const key = String(apiKey || '').trim();
    if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(key)) throw userError('That does not look like an OpenAI API key (it starts with sk-)');
    s.openaiApiKey = key;
  }
  if (model !== undefined) {
    const name = String(model || '').trim();
    if (!/^[a-z0-9][a-z0-9.-]{2,60}$/.test(name)) throw userError('Enter a model name such as gpt-image-2');
    s.gptImageModel = name;
  }
  await writeSecrets(s);
}

export async function clearGptImageKey() {
  const s = await readSecrets();
  delete s.openaiApiKey;
  await writeSecrets(s);
}

async function call(method, url, body, fetchImpl, timeoutMs) {
  const {key} = await settings();
  if (!key) throw userError('Save your OpenAI API key first');
  const res = await fetchImpl(url, {
    method, signal: AbortSignal.timeout(timeoutMs),
    headers: {Authorization: 'Bearer ' + key, ...(body ? {'Content-Type': 'application/json'} : {})},
    ...(body ? {body: JSON.stringify(body)} : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw userError('OpenAI: ' + (data.error?.message || `request failed (${res.status})`), res.status === 401 ? 400 : 502);
  return data;
}

// Free: asks whether the key works and the model exists. Generates nothing.
export async function checkGptImage(fetchImpl = fetch) {
  const {model} = await settings();
  await call('GET', `${API}/models/${encodeURIComponent(model)}`, null, fetchImpl, 20_000);
  return {ok: true, message: `Key works and ${model} is available.`};
}

export function buildPrompt(prompt) {
  const text = String(prompt || '').replace(/\s+/g, ' ').trim();
  if (text.length < 5) throw userError('Describe the picture you want (at least a few words)');
  if (text.length > 1500) throw userError('Keep the description under 1,500 characters');
  return `${text}\n\n${PROMPT_GUARD}`;
}

// Returns {buffer, ext, model, prompt}. Portrait or landscape to match the video.
export async function generateGptImage({prompt, orientation = 'PORTRAIT', quality = 'medium'} = {}, fetchImpl = fetch) {
  const {model} = await settings();
  const fullPrompt = buildPrompt(prompt);
  if (!QUALITIES.includes(quality)) throw userError('Quality must be low, medium or high');
  const data = await call('POST', `${API}/images/generations`, {
    model, prompt: fullPrompt, n: 1, quality, size: orientation === 'LANDSCAPE' ? '1536x1024' : '1024x1536',
  }, fetchImpl, 240_000);
  const item = data.data?.[0];
  let buffer;
  if (item?.b64_json) buffer = Buffer.from(item.b64_json, 'base64');
  else if (/^https:\/\//.test(item?.url || '')) {
    const res = await fetchImpl(item.url, {signal: AbortSignal.timeout(60_000)});
    if (!res.ok) throw userError('OpenAI returned an image link that could not be downloaded', 502);
    buffer = Buffer.from(await res.arrayBuffer());
  }
  if (!buffer?.length) throw userError('OpenAI did not return an image', 502);
  const ext = buffer.subarray(0, 4).toString('hex') === '89504e47' ? '.png' : buffer[0] === 0xff && buffer[1] === 0xd8 ? '.jpg' : '.webp';
  return {buffer, ext, model, prompt: fullPrompt};
}
