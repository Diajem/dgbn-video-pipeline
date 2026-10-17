// Reusable brand intro and outro clips (e.g. the avatar intro), one per brand, edition and slot.
// Rendered once, uploaded here, then added to every video of that brand and edition. Stored in studio/data (git-ignored).
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
// project.mjs imports this module too, so its values are only used inside functions (never while modules load).
import {BRANDS, EDITIONS, HttpError} from './project.mjs';

export const CLIPS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'brand-clips');
export const SLOTS = ['intro', 'outro'];
export const CLIP_EXTS = ['.mp4', '.webm', '.mov'];
export const MAX_CLIP_SEC = 30;
const NAME = /^([A-Z_]+)-(MORNING|EVENING)-(intro|outro)(\.mp4|\.webm|\.mov)$/;

export function assertSlot(brand, edition, slot) {
  if (!BRANDS.includes(brand)) throw new HttpError(400, 'Unknown brand');
  if (!EDITIONS.includes(edition)) throw new HttpError(400, 'Unknown edition');
  if (!SLOTS.includes(slot)) throw new HttpError(400, 'Slot must be intro or outro');
}

export function probeClip(file) {
  return new Promise((resolve, reject) => execFile('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], {maxBuffer: 2_000_000}, (error, stdout) => {
    if (error) return reject(new HttpError(400, 'That file is not a readable video'));
    const info = JSON.parse(stdout);
    const video = (info.streams || []).find(s => s.codec_type === 'video');
    const durationSec = Number(info.format?.duration);
    if (!video || !(durationSec > 0)) return reject(new HttpError(400, 'That file is not a readable video'));
    let {width, height} = video;
    const rotation = Math.abs(Number(video.side_data_list?.find(d => d.rotation !== undefined)?.rotation ?? video.tags?.rotate ?? 0));
    if (rotation === 90 || rotation === 270) [width, height] = [height, width];
    resolve({durationSec: Math.round(durationSec * 1000) / 1000, width, height, hasAudio: (info.streams || []).some(s => s.codec_type === 'audio')});
  }));
}

export async function listClips() {
  await fs.mkdir(CLIPS_DIR, {recursive: true});
  const out = [];
  for (const name of await fs.readdir(CLIPS_DIR)) {
    const m = NAME.exec(name);
    if (!m) continue;
    const stat = await fs.stat(path.join(CLIPS_DIR, name));
    out.push({brand: m[1], edition: m[2], slot: m[3], file: name, size: stat.size, updatedAt: stat.mtime.toISOString()});
  }
  return out;
}

// The stored clip for one slot, or null.
export async function findClip(brand, edition, slot) {
  for (const ext of CLIP_EXTS) {
    const file = path.join(CLIPS_DIR, `${brand}-${edition}-${slot}${ext}`);
    if (await fs.stat(file).then(() => true, () => false)) return file;
  }
  return null;
}

// Moves an uploaded temp file into its slot, replacing any earlier clip there.
export async function storeClip(brand, edition, slot, tempFile, ext) {
  assertSlot(brand, edition, slot);
  const info = await probeClip(tempFile).catch(async error => { await fs.unlink(tempFile).catch(() => {}); throw error; });
  if (info.durationSec > MAX_CLIP_SEC) {
    await fs.unlink(tempFile).catch(() => {});
    throw new HttpError(400, `Intro and outro clips must be ${MAX_CLIP_SEC} seconds or shorter (this one is ${Math.round(info.durationSec)}s)`);
  }
  await removeClip(brand, edition, slot);
  await fs.rename(tempFile, path.join(CLIPS_DIR, `${brand}-${edition}-${slot}${ext}`));
  return info;
}

export async function removeClip(brand, edition, slot) {
  assertSlot(brand, edition, slot);
  for (const ext of CLIP_EXTS) await fs.unlink(path.join(CLIPS_DIR, `${brand}-${edition}-${slot}${ext}`)).catch(() => {});
}

export const clipPath = name => {
  if (!NAME.test(name)) throw new HttpError(404, 'Not found');
  return path.join(CLIPS_DIR, name);
};
