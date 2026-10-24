// Stock photo and video search (Pexels, Pixabay). API keys live only on this computer (studio/data/secrets.json, git-ignored).
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {safeFetch, userError} from './sources.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SECRETS = path.join(HERE, '..', 'data', 'secrets.json');
const UA = 'DGBN-Video-Studio/1.0';
export const PROVIDERS = {pexels: 'Pexels', pixabay: 'Pixabay'};
const FIELD = {pexels: 'pexelsApiKey', pixabay: 'pixabayApiKey'};
const KINDS = ['photo', 'video'];

async function readSecrets() {
  try { return JSON.parse(await fs.readFile(SECRETS, 'utf8')); } catch { return {}; }
}
async function writeSecrets(secrets) {
  await fs.mkdir(path.dirname(SECRETS), {recursive: true});
  await fs.writeFile(SECRETS, JSON.stringify(secrets), {mode: 0o600});
}
function provider(name) {
  if (!PROVIDERS[name]) throw Object.assign(new Error('Unknown stock source'), {status: 400});
  return name;
}
export async function stockStatus() {
  const s = await readSecrets();
  return Object.fromEntries(Object.keys(PROVIDERS).map(p => [p, !!(s[FIELD[p]] || process.env[p.toUpperCase() + '_API_KEY'])]));
}
export async function saveStockKey(name, key) {
  provider(name);
  const value = String(key || '').trim();
  if (!/^[A-Za-z0-9_\-:.]{16,120}$/.test(value)) throw Object.assign(new Error(`That does not look like a ${PROVIDERS[name]} API key`), {status: 400});
  const s = await readSecrets();
  s[FIELD[name]] = value;
  await writeSecrets(s);
}
export async function clearStockKey(name) {
  provider(name);
  const s = await readSecrets();
  delete s[FIELD[name]];
  await writeSecrets(s);
}
async function getKey(name) {
  const s = await readSecrets();
  return s[FIELD[name]] || process.env[name.toUpperCase() + '_API_KEY'] || '';
}

async function getJson(url, headers = {}) {
  let res;
  try { res = await fetch(url, {headers: {'User-Agent': UA, ...headers}, signal: AbortSignal.timeout(20_000)}); }
  catch { throw Object.assign(new Error('Could not reach the stock site. Check the internet connection and try again.'), {status: 502}); }
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('The API key was refused. Check it is the right key for this source.'), {status: 400});
  if (res.status === 429) throw Object.assign(new Error('Too many searches just now. Wait a minute and try again.'), {status: 429});
  if (!res.ok) throw Object.assign(new Error('Stock search failed: HTTP ' + res.status), {status: 502});
  return res.json();
}

// Normalised result: {provider, kind, title, thumbUrl, fileUrl, pageUrl, credit, width, height, duration}
export async function searchStock(name, query, kind = 'photo') {
  provider(name);
  if (!KINDS.includes(kind)) throw Object.assign(new Error('Unknown media type'), {status: 400});
  const q = String(query || '').trim().slice(0, 120);
  if (!q) throw Object.assign(new Error('Type something to search for'), {status: 400});
  const key = await getKey(name);
  if (!key) throw Object.assign(new Error(`${PROVIDERS[name]} is not set up yet. Paste its API key first.`), {status: 400});
  const base = process.env.STUDIO_STOCK_ENDPOINT;

  if (name === 'pexels') {
    const root = base || 'https://api.pexels.com';
    const headers = {Authorization: key};
    if (kind === 'photo') {
      const d = await getJson(`${root}/v1/search?` + new URLSearchParams({query: q, per_page: '15', orientation: 'portrait'}), headers);
      return (d.photos || []).map(p => ({provider: name, kind, title: String(p.alt || q).slice(0, 100), thumbUrl: p.src?.medium || p.src?.small,
        fileUrl: p.src?.large2x || p.src?.large, pageUrl: p.url, credit: `${p.photographer || 'Unknown'} / Pexels`, width: p.width, height: p.height})).filter(r => r.fileUrl);
    }
    const d = await getJson(`${root}/videos/search?` + new URLSearchParams({query: q, per_page: '12', orientation: 'portrait'}), headers);
    return (d.videos || []).map(v => {
      const files = (v.video_files || []).filter(f => /mp4/i.test(f.file_type || '') && f.link);
      const ok = files.filter(f => Math.min(f.width, f.height) <= 1080).sort((a, b) => b.width * b.height - a.width * a.height);
      const pick = ok[0] || files.sort((a, b) => a.width * a.height - b.width * b.height)[0];
      return pick && {provider: name, kind, title: q, thumbUrl: v.image, fileUrl: pick.link, pageUrl: v.url, credit: `${v.user?.name || 'Unknown'} / Pexels`,
        width: pick.width, height: pick.height, duration: v.duration};
    }).filter(Boolean);
  }

  const root = base || 'https://pixabay.com';
  if (kind === 'photo') {
    const d = await getJson(`${root}/api/?` + new URLSearchParams({key, q, image_type: 'photo', orientation: 'vertical', per_page: '15', safesearch: 'true'}));
    return (d.hits || []).map(h => ({provider: name, kind, title: String(h.tags || q).slice(0, 100), thumbUrl: h.webformatURL, fileUrl: h.largeImageURL || h.webformatURL,
      pageUrl: h.pageURL, credit: `${h.user || 'Unknown'} / Pixabay`, width: h.imageWidth, height: h.imageHeight})).filter(r => r.fileUrl);
  }
  const d = await getJson(`${root}/api/videos/?` + new URLSearchParams({key, q, per_page: '12', safesearch: 'true'}));
  return (d.hits || []).map(h => {
    const v = h.videos?.large?.url ? h.videos.large : h.videos?.medium;
    return v?.url && {provider: name, kind, title: String(h.tags || q).slice(0, 100),
      thumbUrl: h.picture_id ? `https://i.vimeocdn.com/video/${h.picture_id}_640x360.jpg` : (h.videos?.tiny?.thumbnail || ''),
      fileUrl: v.url, pageUrl: h.pageURL, credit: `${h.user || 'Unknown'} / Pixabay`, width: v.width, height: v.height, duration: h.duration};
  }).filter(Boolean);
}

export function stockHostOk(value, name) {
  let host;
  try { host = new URL(value).hostname; } catch { return false; }
  const allowed = name === 'pexels' ? ['pexels.com'] : ['pixabay.com'];
  return allowed.some(d => host === d || host.endsWith('.' + d));
}

const IMAGE_EXT = {'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp'};
export async function downloadStock(url, kind, fetcher = safeFetch) {
  const video = kind === 'video';
  const {buffer, contentType} = await fetcher(url, {maxBytes: video ? 150_000_000 : 30_000_000, timeoutMs: video ? 180_000 : 30_000, accept: video ? 'video/mp4,video/*' : 'image/*'});
  const type = contentType.split(';')[0].trim().toLowerCase();
  if (video) {
    if (!/^video\/mp4$|^application\/octet-stream$/.test(type)) throw userError('That clip is not an MP4 video');
    return {buffer, ext: '.mp4'};
  }
  const ext = IMAGE_EXT[type];
  if (!ext) throw userError('That picture is not a JPEG, PNG or WebP image');
  return {buffer, ext};
}

export function stockAssetFields(r) {
  const video = r.kind === 'video';
  return {
    origin: 'stock', sourceUrl: /^https?:\/\//i.test(String(r.pageUrl || '')) ? String(r.pageUrl).slice(0, 400) : '', credit: String(r.credit || '').slice(0, 400),
    label: video ? 'ILLUSTRATIVE FOOTAGE' : 'ILLUSTRATIVE IMAGE', rights: 'cleared',
    rightsNote: `${PROVIDERS[r.provider]} licence: free to use, credit not required. Generic stock, not footage or a photo of this event.`,
    notes: String(r.title || '').slice(0, 160),
  };
}
