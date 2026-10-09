// Project model, storyboard, rights gate and job export for the Video Studio.
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
export const DATA = path.join(ROOT, 'studio', 'data', 'projects');
const PUBLIC_ASSETS = path.join(ROOT, 'video-studio', 'remotion', 'public', 'assets', 'studio');
const JOBS = path.join(ROOT, 'jobs', 'renders');
const VALIDATOR = path.join(ROOT, 'scripts', 'validate-dgbn-faceless.mjs');

export const LABELS = ['EDITORIAL IMAGE', 'ILLUSTRATIVE IMAGE', 'ILLUSTRATIVE FOOTAGE', 'FILE FOOTAGE', 'ARCHIVE', 'AI-GENERATED ILLUSTRATION', 'GRAPHIC'];
export const RIGHTS = ['cleared', 'ai_labelled', 'needs_permission', 'unknown'];
export const STORY_TYPES = ['present', 'past', 'football', 'data', 'graphic'];
export const BRANDS = ['DGBN', 'DSN'];
// short = Shorts/Reels (no on-screen credits, unresolved rights warn), long = credits card at the end, website = strict.
export const FORMATS = ['short', 'long', 'website'];
export const formatOf = project => FORMATS.includes(project?.format) ? project.format : 'short';
const AI_LABEL = 'AI-GENERATED ILLUSTRATION';

export class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.extra = extra; }
}

export const newId = (bytes = 6) => crypto.randomBytes(bytes).toString('hex');
export const validId = id => /^[a-f0-9]{12}$/.test(String(id || ''));
export const projectDir = id => path.join(DATA, id);
export const assetsDir = id => path.join(DATA, id, 'assets');

export async function loadProject(id) {
  if (!validId(id)) throw new HttpError(400, 'Invalid project id');
  try {
    return JSON.parse(await fs.readFile(path.join(projectDir(id), 'project.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') throw new HttpError(404, 'Project not found');
    throw error;
  }
}

export async function saveProject(project) {
  project.updatedAt = new Date().toISOString();
  const dir = projectDir(project.id);
  await fs.mkdir(assetsDir(project.id), {recursive: true});
  const temp = path.join(dir, `project.json.${process.pid}.${newId(4)}.tmp`);
  await fs.writeFile(temp, JSON.stringify(project, null, 2) + '\n', 'utf8');
  try { await fs.rename(temp, path.join(dir, 'project.json')); } catch (error) { await fs.unlink(temp).catch(() => {}); throw error; }
  return project;
}

export async function listProjects() {
  await fs.mkdir(DATA, {recursive: true});
  const out = [];
  for (const entry of await fs.readdir(DATA, {withFileTypes: true})) {
    if (!entry.isDirectory() || !validId(entry.name)) continue;
    try {
      const p = await loadProject(entry.name);
      out.push({id: p.id, title: p.title, brand: p.brand, storyType: p.storyType, updatedAt: p.updatedAt, scenes: p.scenes.length});
    } catch { /* skip unreadable */ }
  }
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export async function createProject({title, brand, storyType, format, sourceText = '', sourceUrl = '', headline = '', candidates = []}) {
  const project = {
    id: newId(), title: String(title || 'Untitled video').slice(0, 140),
    brand: BRANDS.includes(brand) ? brand : 'DGBN',
    storyType: STORY_TYPES.includes(storyType) ? storyType : 'present',
    format: FORMATS.includes(format) ? format : 'short',
    headline: String(headline || '').slice(0, 200), script: '', sourceText, sourceUrl, candidates,
    scenes: [], audio: null, createdAt: new Date().toISOString(),
  };
  return saveProject(project);
}

const wordCount = text => String(text || '').trim().split(/\s+/).filter(Boolean).length;

// Split a script into scenes of roughly 15-30 words, keeping any assets already attached by position.
export function splitScenes(script, existing = []) {
  // One scene per paragraph when the script has paragraph breaks; otherwise group sentences into scenes of about 30 words.
  const paragraphs = String(script || '').split(/\n\s*\n/).map(t => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
  let groups = [];
  if (paragraphs.length >= 2) groups = paragraphs;
  else {
    const sentences = String(script || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).filter(Boolean);
    let current = [];
    for (const sentence of sentences) {
      current.push(sentence);
      if (wordCount(current.join(' ')) >= 30) { groups.push(current.join(' ')); current = []; }
    }
    if (current.length) {
      if (groups.length && wordCount(current.join(' ')) < 12) groups[groups.length - 1] += ' ' + current.join(' ');
      else groups.push(current.join(' '));
    }
  }
  return groups.map((text, i) => ({id: existing[i]?.id || 's' + newId(3), text, assets: existing[i]?.assets || []}));
}

function copiedFromSource(script, source, n = 10) {
  const words = t => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  const s = words(script), o = words(source);
  if (s.length < n || o.length < n) return false;
  const shingles = new Set();
  for (let i = 0; i <= o.length - n; i++) shingles.add(o.slice(i, i + n).join(' '));
  for (let i = 0; i <= s.length - n; i++) if (shingles.has(s.slice(i, i + n).join(' '))) return true;
  return false;
}

// The render gate. Blockers stop an export; warnings are shown to the editor.
export function gateProject(project, {draft = false} = {}) {
  const blockers = [], warnings = [];
  const format = formatOf(project);
  if (!project.headline?.trim()) blockers.push('Add a headline.');
  if (!project.script?.trim()) blockers.push('Add a script.');
  if (!project.scenes.length) blockers.push('Split the script into scenes.');
  if (project.scenes.length && !project.scenes.some(sc => sc.assets.length)) blockers.push('Add at least one image or clip. Scenes without their own picture keep the previous one on screen.');
  project.scenes.forEach((scene, i) => {
    const n = i + 1;
    if (!scene.assets.length && project.scenes.some(sc => sc.assets.length)) warnings.push(`Scene ${n} has no picture of its own, so the previous picture stays on screen. Add one if you want a change.`);
    for (const asset of scene.assets) {
      const where = `Scene ${n}, ${asset.file}`;
      const ai = asset.label === AI_LABEL;
      if (ai && asset.rights !== 'ai_labelled') blockers.push(`${where}: AI-generated assets must have the rights status "ai_labelled".`);
      if (!ai && asset.rights === 'ai_labelled') blockers.push(`${where}: only AI-generated assets can be "ai_labelled".`);
      if (asset.rights === 'cleared' && !String(asset.rightsNote || '').trim()) blockers.push(`${where}: cleared assets need a rights note saying where permission comes from.`);
      if (asset.rights === 'unknown' || asset.rights === 'needs_permission') {
        const state = asset.rights === 'unknown' ? 'unknown' : 'awaiting permission';
        if (draft || format !== 'website') warnings.push(`${where}: rights are ${state}. It will render, and it is listed in the sources text so it can be removed quickly if asked.`);
        else blockers.push(`${where}: rights are ${state}.`);
      }
      if (format !== 'short' && !asset.credit?.trim() && asset.origin !== 'own' && !ai && asset.label !== 'GRAPHIC') warnings.push(`${where}: no credit line set.`);
      if (ai && project.storyType === 'present') warnings.push(`${where}: this is a present-day story. Make sure the AI visual cannot be mistaken for real footage of the event.`);
      if (ai && project.storyType === 'football') warnings.push(`${where}: football reports should use real images of the people and places. Do not generate likenesses of real people.`);
    }
  });
  if (!project.audio?.file) blockers.push('Add narration (upload audio, or use the draft voice for a draft render).');
  else if (!draft && project.audio.status !== 'APPROVED') blockers.push('Narration must be marked APPROVED for a final export. The draft voice is for draft renders only.');
  if (project.sourceText && copiedFromSource(project.script, project.sourceText)) warnings.push('The script repeats a long run of words from the source article. Rewrite it in your own words.');
  return {blockers, warnings};
}

function probeDuration(file) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', file], {encoding: 'utf8'});
  const seconds = Number(out.trim());
  if (!(seconds > 3 && seconds < 600)) throw new HttpError(400, 'Narration must be between 3 seconds and 10 minutes long.');
  return seconds;
}

const round3 = n => Math.round(n * 1000) / 1000;

function probeSize(file) {
  try {
    const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_streams', '-of', 'json', file], {encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']});
    const stream = JSON.parse(out).streams?.[0] || {};
    let {width, height} = stream;
    const rotation = Math.abs(Number(stream.side_data_list?.find(d => d.rotation !== undefined)?.rotation ?? stream.tags?.rotate ?? 0));
    if (rotation === 90 || rotation === 270) [width, height] = [height, width];
    return width > 0 && height > 0 ? {width, height} : {};
  } catch { return {}; }
}

// Plain text for the video description: the AI-assisted note, then every credit and rights note.
export function sourcesText(project) {
  const lines = ['Made with AI assistance: AI-assisted script, voice and visuals.', ''];
  if (project.sourceUrl) lines.push('Story source: ' + project.sourceUrl, '');
  lines.push('Images and clips:');
  project.scenes.forEach((scene, i) => scene.assets.forEach(a => {
    const bits = [a.credit || (a.origin === 'own' ? 'Own material' : a.label === 'AI-GENERATED ILLUSTRATION' ? 'AI-generated' : 'credit not set')];
    bits.push(a.label, 'rights: ' + a.rights);
    if (a.rightsNote) bits.push(a.rightsNote);
    if (a.sourceUrl) bits.push(a.sourceUrl);
    lines.push(`Scene ${i + 1}: ${bits.join(' | ')}`);
  }));
  return lines.join('\n');
}

export async function exportJob(project, {draft = false} = {}) {
  const format = formatOf(project);
  const {blockers, warnings} = gateProject(project, {draft});
  if (blockers.length) return {ok: false, blockers, warnings};

  const dest = path.join(PUBLIC_ASSETS, project.id);
  if (path.dirname(dest) !== PUBLIC_ASSETS) throw new HttpError(400, 'Invalid project id');
  await fs.rm(dest, {recursive: true, force: true});
  await fs.mkdir(dest, {recursive: true});

  const audioExt = path.extname(project.audio.file);
  await fs.copyFile(path.join(assetsDir(project.id), project.audio.file), path.join(dest, 'narration' + audioExt));
  const durationSec = round3(probeDuration(path.join(dest, 'narration' + audioExt)));

  const totalWords = project.scenes.reduce((sum, s) => sum + Math.max(1, wordCount(s.text)), 0);
  let cursor = 0;
  let lastAssets = null;
  const firstAsset = project.scenes.flatMap(sc => sc.assets)[0];
  const visuals = [];
  for (const scene of project.scenes) {
    const sceneStart = durationSec * cursor / totalWords;
    cursor += Math.max(1, wordCount(scene.text));
    const sceneEnd = durationSec * cursor / totalWords;
    if (scene.assets.length) lastAssets = scene.assets;
    const sceneAssets = scene.assets.length ? scene.assets : (lastAssets || [firstAsset]);
    const slice = (sceneEnd - sceneStart) / sceneAssets.length;
    for (let i = 0; i < sceneAssets.length; i++) {
      const asset = sceneAssets[i];
      const prev = visuals[visuals.length - 1];
      if (prev && prev.assetId === asset.id && i === 0) { prev.endSec = round3(sceneStart + slice * (i + 1)); continue; }
      await fs.copyFile(path.join(assetsDir(project.id), asset.file), path.join(dest, asset.file));
      const size = probeSize(path.join(dest, asset.file));
      visuals.push({
        ...size, fit: ['auto', 'fill', 'fit'].includes(asset.fit) ? asset.fit : 'auto',
        assetId: asset.id, src: `assets/studio/${project.id}/${asset.file}`, kind: asset.kind, label: asset.label,
        rights: asset.rights, rightsNote: asset.rightsNote || '', credit: asset.credit || '', origin: asset.origin,
        startSec: round3(sceneStart + slice * i), endSec: round3(sceneStart + slice * (i + 1)),
      });
    }
  }
  visuals[visuals.length - 1].endSec = durationSec;

  const job = {
    version: 'DGBN_FACELESS_V1', brand: project.brand, storyId: project.id,
    sourceScriptArtifactId: `studio-${project.id}-script`, narrationArtifactId: `studio-${project.id}-audio`,
    headline: project.headline, script: project.script, durationSec, staged: true,
    audio: {voiceoverSrc: `assets/studio/${project.id}/narration${audioExt}`, voiceoverStatus: project.audio.status},
    visuals, qualityPolicy: draft ? 'DRAFT' : 'PRODUCTION', draft,
    format, aiAssisted: true,
    credits: format === 'long' ? [...new Set(project.scenes.flatMap(sc => sc.assets.map(a => a.credit?.trim()).filter(Boolean)))].slice(0, 12) : [],
    studio: {projectId: project.id, format, storyType: project.storyType, sourceUrl: project.sourceUrl || null, exportedAt: new Date().toISOString()},
  };
  await fs.mkdir(JOBS, {recursive: true});
  const mode = draft ? 'draft' : 'final';
  const jobPath = path.join(JOBS, `studio-${project.id}-${mode}.json`);
  await fs.writeFile(jobPath, JSON.stringify(job, null, 2) + '\n', 'utf8');
  const propsPath = path.join(JOBS, `studio-${project.id}-${mode}-props.json`);
  await fs.writeFile(propsPath, JSON.stringify({config: job}) + '\n', 'utf8');

  try {
    execFileSync('node', [VALIDATOR, jobPath], {cwd: ROOT, env: {...process.env, ALLOW_DRAFT: draft ? '1' : ''}, encoding: 'utf8', stdio: 'pipe'});
  } catch (error) {
    const text = String(error.stderr || error.message).split('\n').find(l => /validation failed/i.test(l)) || String(error.message);
    return {ok: false, blockers: [text.trim()], warnings};
  }
  return {ok: true, jobPath, propsPath, mode, durationSec, warnings};
}
