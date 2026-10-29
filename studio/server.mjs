// DGBN / DSN Video Studio - Phase 1. Local, standalone, separate from the newsroom.
// Run: npm run studio   (binds to 127.0.0.1 only)
import http from 'node:http';
import fs from 'node:fs/promises';
import fssync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {spawn, execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  HttpError, ROOT, MODES, LAYOUTS, ORIENTATIONS, modeOf, LABELS, RIGHTS, STORY_TYPES, BRANDS, BRAND_INFO, EDITIONS, FORMATS, formatOf, sourcesText, newId, validId, assetsDir, projectDir,
  loadProject, saveProject, listProjects, createProject, splitScenes, gateProject, exportJob, bookendClips, orientationOf,
} from './lib/project.mjs';
import {listClips, storeClip, removeClip, assertSlot, clipPath, CLIPS_DIR, CLIP_EXTS} from './lib/brand-clips.mjs';
import {gptImageStatus, saveGptImage, clearGptImageKey, checkGptImage, generateGptImage, QUALITIES} from './lib/gpt-image.mjs';
import {VOICES, getKey, saveKey, clearKey, narrate} from './lib/google-voice.mjs';
import {DEFAULT_NARRATOR, requireNarrator, requireNarrationStyle, pocketStatus, narratePocket} from './lib/pocket-voice.mjs';
import {importUrl, searchCommons, downloadImage, licenceRights} from './lib/sources.mjs';
import {PROVIDERS, stockStatus, saveStockKey, clearStockKey, searchStock, stockHostOk, downloadStock, stockAssetFields} from './lib/stock.mjs';
import {wanStatus, saveWan, clearWanKey, checkWan, startWanTest, wanTestStatus, wanClips, wanClipPath} from './lib/wan.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.STUDIO_PORT || 4177);
const REMOTE = process.env.STUDIO_REMOTE === '1';
const safeEqual = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
let ACCESS_KEY = '';
if (REMOTE) {
  const keyFile = new URL('./data/access-key.txt', import.meta.url);
  try { ACCESS_KEY = fssync.readFileSync(keyFile, 'utf8').trim(); } catch {}
  if (!/^[A-Za-z0-9_-]{32,}$/.test(ACCESS_KEY)) {
    ACCESS_KEY = crypto.randomBytes(24).toString('base64url');
    fssync.mkdirSync(new URL('./data/', import.meta.url), {recursive: true});
    fssync.writeFileSync(keyFile, ACCESS_KEY + '\n', {mode: 0o600});
  }
}
const PUBLIC = path.join(HERE, 'public');
const RENDERS = path.join(ROOT, 'renders');
const AI_LABEL = 'AI-GENERATED ILLUSTRATION';

const MEDIA = {
  '.jpg': ['image', 'image/jpeg'], '.jpeg': ['image', 'image/jpeg'], '.png': ['image', 'image/png'], '.webp': ['image', 'image/webp'],
  '.mp4': ['video', 'video/mp4'], '.webm': ['video', 'video/webm'], '.mov': ['video', 'video/quicktime'],
  '.wav': ['audio', 'audio/wav'], '.mp3': ['audio', 'audio/mpeg'], '.m4a': ['audio', 'audio/mp4'], '.aac': ['audio', 'audio/aac'], '.ogg': ['audio', 'audio/ogg'],
};
const STATIC = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8'};
const renderState = new Map();
const transcribeState = new Map();
const TRANSCRIBE_DIR = path.join(HERE, 'transcribe');
const TRANSCRIBE_MODEL = 'onnx-community/whisper-small_timestamped';

// Run a child process, keeping the tail of its output in state.log.
function runLogged(state, command, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {...options, windowsHide: true});
    const keep = chunk => { state.log = (state.log + chunk.toString()).slice(-3000); };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('error', reject);
    child.on('close', resolve);
  });
}

// Requests that change one project run one at a time, so two quick edits cannot overwrite each other.
const projectQueues = new Map();
function withProjectLock(key, fn) {
  const previous = projectQueues.get(key) || Promise.resolve();
  const run = previous.then(fn);
  const tail = run.catch(() => {});
  projectQueues.set(key, tail);
  tail.then(() => { if (projectQueues.get(key) === tail) projectQueues.delete(key); });
  return run;
}

const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, {'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'});
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
};

async function readJson(req, limit = 2_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Request too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'Invalid JSON'); }
}

async function streamToFile(req, file, max) {
  await new Promise((resolve, reject) => {
    const out = fssync.createWriteStream(file);
    let size = 0, failed = false;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > max && !failed) { failed = true; out.destroy(); req.destroy(); fs.unlink(file).catch(() => {}); reject(new HttpError(413, 'File is too large')); }
    });
    req.on('error', reject);
    out.on('error', reject);
    out.on('finish', () => !failed && resolve());
    req.pipe(out);
  });
}

const webUrl = v => /^https?:\/\//i.test(String(v || '')) ? String(v).slice(0, 400) : '';
const sceneOf = (project, sid) => project.scenes.find(s => s.id === sid) || (() => { throw new HttpError(404, 'Scene not found'); })();

function newAsset(kind, file, fields) {
  return {id: 'a' + newId(3), kind, file, label: 'EDITORIAL IMAGE', rights: 'unknown', credit: '', rightsNote: '', sourceUrl: '', origin: 'other', ...fields};
}

async function api(req, res, url, p) {
  const method = req.method;
  let m;

  if (p === '/api/health') return send(res, 200, {ok: true, labels: LABELS, rights: RIGHTS, storyTypes: STORY_TYPES, brands: BRANDS, brandInfo: BRAND_INFO, editions: EDITIONS, formats: FORMATS, productionModes: MODES});
  if (p === '/api/projects' && method === 'GET') return send(res, 200, await listProjects());
  if (p === '/api/projects' && method === 'POST') return send(res, 200, await createProject(await readJson(req)));

  if (p === '/api/import-url' && method === 'POST') {
    const body = await readJson(req);
    const page = await importUrl(String(body.url || ''));
    const project = await createProject({
      title: page.title || 'Imported article', brand: body.brand, edition: body.edition, storyType: body.storyType,
      sourceText: page.text, sourceUrl: page.sourceUrl, headline: '', candidates: page.images.map(image => ({url: image})),
    });
    return send(res, 200, project);
  }

  if (p === '/api/commons' && method === 'GET') {
    const q = String(url.searchParams.get('q') || '').trim();
    if (q.length < 2) throw new HttpError(400, 'Enter a search term');
    return send(res, 200, await searchCommons(q));
  }

  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})$/))) {
    const project = await loadProject(m[1]);
    if (method === 'GET') return send(res, 200, project);
    if (method === 'PUT') {
      const b = await readJson(req);
      if (typeof b.title === 'string') project.title = b.title.slice(0, 140);
      if (BRANDS.includes(b.brand)) project.brand = b.brand;
      if (EDITIONS.includes(b.edition)) project.edition = b.edition;
      if (typeof b.bookends === 'boolean') project.bookends = b.bookends;
      if (['only', 'first', 'middle', 'last'].includes(b.part)) project.part = b.part;
      if (Array.isArray(b.extraCredits)) project.extraCredits = b.extraCredits.map(c => String(c).slice(0, 140)).slice(0, 200);
      if (STORY_TYPES.includes(b.storyType)) project.storyType = b.storyType;
      if (FORMATS.includes(b.format)) project.format = b.format;
      if (typeof b.headline === 'string') project.headline = b.headline.slice(0, 200);
      if (MODES.includes(b.productionMode)) project.productionMode = b.productionMode;
      if (ORIENTATIONS.includes(b.orientation)) project.orientation = b.orientation;
      if (b.narratorId !== undefined) {
        requireNarrator(b.narratorId);
        if (b.narratorId !== project.narratorId && project.audio?.origin === 'pocket-tts') project.audio.status = 'DRAFT';
        project.narratorId = b.narratorId;
      }
      if (b.narrationStyle !== undefined) {
        requireNarrationStyle(b.narrationStyle);
        if (b.narrationStyle !== (project.narrationStyle || 'natural') && project.audio?.origin === 'pocket-tts') project.audio.status = 'DRAFT';
        project.narrationStyle = b.narrationStyle;
      }
      if (typeof b.script === 'string' && b.script.slice(0, 20000) !== project.script) {
        project.script = b.script.slice(0, 20000);
        if (project.audio) project.audio.status = 'DRAFT';
        if (project.presenter) project.presenter.status = 'DRAFT';
      }
      if (typeof b.sourceText === 'string') project.sourceText = b.sourceText.slice(0, 100000);
      return send(res, 200, await saveProject(project));
    }
  }

  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})\/split$/)) && method === 'POST') {
    const project = await loadProject(m[1]);
    const b = await readJson(req);
    if (b.noScript) {
      if (project.productionMode !== 'REAL_CAMERA') throw new HttpError(400, 'Script-free recording is available in Real camera mode');
      project.script = '';
      project.scenes = [{id: project.scenes[0]?.id || 's' + newId(3), text: '', layout: 'presenter', assets: []}];
      if (project.presenter) project.presenter.status = 'DRAFT';
    } else project.scenes = splitScenes(project.script, project.scenes);
    return send(res, 200, await saveProject(project));
  }

  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})\/scenes\/(s[a-f0-9]{6})\/upload$/)) && method === 'POST') {
    const project = await loadProject(m[1]);
    const scene = sceneOf(project, m[2]);
    const name = String(url.searchParams.get('name') || 'file');
    const ext = path.extname(name).toLowerCase();
    const media = MEDIA[ext];
    if (!media || media[0] === 'audio') throw new HttpError(400, 'Upload a JPG, PNG, WebP, MP4, WebM or MOV file');
    const origin = ['own', 'ai', 'other'].includes(url.searchParams.get('origin')) ? url.searchParams.get('origin') : 'other';
    const id = 'a' + newId(3);
    const file = id + ext;
    await fs.mkdir(assetsDir(project.id), {recursive: true});
    await streamToFile(req, path.join(assetsDir(project.id), file), 300 * 1024 * 1024);
    const fields = {id, sourceUrl: '', origin, credit: '', notes: name.slice(0, 120)};
    if (origin === 'own') Object.assign(fields, {rights: 'cleared', rightsNote: 'Own material uploaded by the editor'});
    if (origin === 'ai') Object.assign(fields, {rights: 'ai_labelled', label: AI_LABEL});
    scene.assets.push(newAsset(media[0], file, fields));
    return send(res, 200, await saveProject(project));
  }

  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})\/scenes\/(s[a-f0-9]{6})\/assets$/)) && method === 'POST') {
    const project = await loadProject(m[1]);
    const scene = sceneOf(project, m[2]);
    const b = await readJson(req);
    const source = String(b.url || '');
    if (b.type === 'commons' && !['upload.wikimedia.org', 'thumb.wikimedia.org'].includes((() => { try { return new URL(source).hostname; } catch { return ''; } })())) throw new HttpError(400, 'Commons images must come from Wikimedia (upload.wikimedia.org or thumb.wikimedia.org)');
    const {buffer, ext} = await downloadImage(source);
    const id = 'a' + newId(3);
    const file = id + ext;
    await fs.mkdir(assetsDir(project.id), {recursive: true});
    await fs.writeFile(path.join(assetsDir(project.id), file), buffer);
    const asset = b.type === 'commons'
      ? newAsset('image', file, {id, origin: 'commons', sourceUrl: webUrl(b.pageUrl) || source, credit: String(b.credit || '').slice(0, 400),
        rights: licenceRights(b.licence), rightsNote: licenceRights(b.licence) === 'cleared' ? `Wikimedia Commons licence: ${String(b.licence).slice(0, 80)}` : '', notes: String(b.title || '').slice(0, 160)})
      : newAsset('image', file, {id, origin: 'url', sourceUrl: source, notes: 'Imported from URL - rights not yet confirmed'});
    scene.assets.push(asset);
    return send(res, 200, await saveProject(project));
  }

  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})\/scenes\/(s[a-f0-9]{6})\/assets\/(a[a-f0-9]{6})$/))) {
    const project = await loadProject(m[1]);
    const scene = sceneOf(project, m[2]);
    const idx = scene.assets.findIndex(a => a.id === m[3]);
    if (idx < 0) throw new HttpError(404, 'Asset not found');
    const asset = scene.assets[idx];
    if (method === 'DELETE') {
      scene.assets.splice(idx, 1);
      await fs.unlink(path.join(assetsDir(project.id), asset.file)).catch(() => {});
      return send(res, 200, await saveProject(project));
    }
    if (method === 'PUT') {
      const b = await readJson(req);
      if (b.label !== undefined) {
        if (!LABELS.includes(b.label)) throw new HttpError(400, 'Unknown label');
        asset.label = b.label;
        if (b.label === AI_LABEL) asset.rights = 'ai_labelled';
        else if (asset.rights === 'ai_labelled') asset.rights = 'unknown';
      }
      if (['auto', 'fill', 'fit'].includes(b.fit)) asset.fit = b.fit;
      if (b.card !== undefined) {
        const t = (v, n) => String(v || '').trim().slice(0, n);
        const status = t(b.card?.status, 12).toUpperCase();
        const card = {name: t(b.card?.name, 40), role: t(b.card?.role, 50), status: ['OUT', 'DOUBT', 'AVAILABLE', 'PREDICTED'].includes(status) ? status : '', line: t(b.card?.line, 80)};
        if (card.name) asset.card = card; else delete asset.card;
      }
      if (typeof b.credit === 'string') asset.credit = b.credit.slice(0, 400);
      if (typeof b.rightsNote === 'string') asset.rightsNote = b.rightsNote.slice(0, 600);
      if (b.rights !== undefined) {
        if (!RIGHTS.includes(b.rights)) throw new HttpError(400, 'Unknown rights status');
        if (b.rights === 'ai_labelled' && asset.label !== AI_LABEL) throw new HttpError(400, 'Set the label to AI-GENERATED ILLUSTRATION first');
        if (b.rights === 'cleared' && !String(asset.rightsNote || '').trim()) throw new HttpError(400, 'Add a rights note saying where permission comes from before marking this cleared');
        asset.rights = asset.label === AI_LABEL ? 'ai_labelled' : b.rights;
      }
      return send(res, 200, await saveProject(project));
    }
  }

  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})\/scenes\/(s[a-f0-9]{6})\/layout$/)) && method === 'PUT') {
    const project = await loadProject(m[1]);
    const b = await readJson(req);
    if (!LAYOUTS.includes(b.layout)) throw new HttpError(400, 'Unknown scene layout');
    sceneOf(project, m[2]).layout = b.layout;
    return send(res, 200, await saveProject(project));
  }
  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})\/presenter$/))) {
    const project = await loadProject(m[1]);
    if (method === 'POST') {
      const name = String(url.searchParams.get('name') || '');
      const ext = path.extname(name).toLowerCase();
      if (MEDIA[ext]?.[0] !== 'video') throw new HttpError(400, 'Upload an MP4, WebM or MOV presenter recording');
      const file = 'presenter-' + newId(3) + ext;
      await fs.mkdir(assetsDir(project.id), {recursive: true});
      const target = path.join(assetsDir(project.id), file);
      await streamToFile(req, target, 300 * 1024 * 1024);
      try {
        const output = await new Promise((resolve, reject) => execFile('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', target], {maxBuffer: 2000000}, (e, stdout) => e ? reject(e) : resolve(stdout)));
        const streams = JSON.parse(output).streams || [];
        if (!streams.some(s => s.codec_type === 'video') || !streams.some(s => s.codec_type === 'audio')) throw new Error('Missing video or audio');
      } catch {
        await fs.unlink(target).catch(() => {});
        throw new HttpError(400, 'Presenter recording must contain both video and spoken audio');
      }
      const previous = project.presenter?.file;
      project.presenter = {file, status: 'DRAFT', name: name.slice(0, 120)};
      await saveProject(project);
      if (previous) await fs.unlink(path.join(assetsDir(project.id), previous)).catch(() => {});
      return send(res, 200, project);
    }
    if (method === 'PUT') {
      const b = await readJson(req);
      if (!project.presenter) throw new HttpError(400, 'Upload a presenter recording first');
      if (!['DRAFT', 'APPROVED'].includes(b.status)) throw new HttpError(400, 'Unknown review status');
      project.presenter.status = b.status;
      return send(res, 200, await saveProject(project));
    }
  }

  // Local speech-to-text: gives every spoken word a time, and writes the script when there is none.
  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})\/transcribe$/))) {
    const id = m[1];
    if (method === 'GET') return send(res, 200, transcribeState.get(id) || {status: 'idle'});
    if (method === 'POST') {
      if (transcribeState.get(id)?.status === 'running') throw new HttpError(409, 'A transcription is already running for this project');
      const project = await loadProject(id);
      if (!project.presenter?.file) throw new HttpError(400, 'Upload a recording first');
      const b = await readJson(req);
      const language = typeof b.language === 'string' && /^[a-z]{2,20}$/i.test(b.language) ? b.language.toLowerCase() : 'english';
      const state = {status: 'running', step: 'starting', startedAt: new Date().toISOString(), log: ''};
      transcribeState.set(id, state);
      const mediaFile = path.join(assetsDir(id), project.presenter.file);
      const presenterFile = project.presenter.file;
      (async () => {
        try {
          const installed = await fs.stat(path.join(TRANSCRIBE_DIR, 'node_modules', '@huggingface', 'transformers')).then(() => true, () => false);
          if (!installed) {
            state.step = 'installing the speech tools (first run only)';
            const code = await runLogged(state, 'npm', ['install', '--no-audit', '--no-fund'], {cwd: TRANSCRIBE_DIR, shell: true});
            if (code !== 0) throw new Error('Installing the speech tools failed.');
          }
          state.step = 'transcribing (the first run also downloads the speech model)';
          const outFile = path.join(projectDir(id), 'transcript.json');
          const code = await runLogged(state, process.execPath, [path.join(TRANSCRIBE_DIR, 'transcribe.mjs'), mediaFile, outFile, TRANSCRIBE_MODEL, language], {cwd: TRANSCRIBE_DIR});
          if (code !== 0) throw new Error('Transcription failed.');
          const t = JSON.parse(await fs.readFile(outFile, 'utf8'));
          if (!Array.isArray(t.words) || !t.words.length) throw new Error('No speech was found in the recording.');
          await withProjectLock(id, async () => {
            const fresh = await loadProject(id);
            if (fresh.presenter?.file !== presenterFile) throw new Error('The recording changed while transcribing. Run it again.');
            fresh.presenter.transcript = {text: t.text, words: t.words, model: t.model, language, durationSec: t.durationSec, createdAt: new Date().toISOString()};
            if (!fresh.script.trim()) {
              fresh.script = t.text.slice(0, 20000);
              fresh.scenes = splitScenes(fresh.script, fresh.scenes);
              fresh.presenter.status = 'DRAFT';
            }
            await saveProject(fresh);
          });
          state.status = 'done'; state.step = 'done'; state.finishedAt = new Date().toISOString();
        } catch (error) {
          state.status = 'failed'; state.error = error.message; state.finishedAt = new Date().toISOString();
        }
      })();
      return send(res, 202, state);
    }
  }

  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})\/audio$/))) {
    const project = await loadProject(m[1]);
    if (method === 'POST') {
      const name = String(url.searchParams.get('name') || 'narration.wav');
      const ext = path.extname(name).toLowerCase();
      if (MEDIA[ext]?.[0] !== 'audio') throw new HttpError(400, 'Upload a WAV, MP3, M4A, AAC or OGG file');
      const file = 'narration-' + newId(3) + ext;
      await fs.mkdir(assetsDir(project.id), {recursive: true});
      await streamToFile(req, path.join(assetsDir(project.id), file), 200 * 1024 * 1024);
      if (project.audio?.file) await fs.unlink(path.join(assetsDir(project.id), project.audio.file)).catch(() => {});
      project.audio = {file, status: 'DRAFT', origin: 'upload', name: name.slice(0, 120)};
      return send(res, 200, await saveProject(project));
    }
    if (method === 'PUT') {
      const b = await readJson(req);
      if (!project.audio) throw new HttpError(400, 'No narration yet');
      if (!['DRAFT', 'APPROVED'].includes(b.status)) throw new HttpError(400, 'Status must be DRAFT or APPROVED');
      if (b.status === 'APPROVED' && project.audio.origin === 'draft-voice') throw new HttpError(400, 'The draft Windows voice cannot be approved for publication');
      if (b.status === 'APPROVED' && project.audio.origin === 'pocket-tts') {
        if (project.audio.voiceId !== (project.narratorId || DEFAULT_NARRATOR)) throw new HttpError(400, 'Generate narration with the selected voice before approving it');
        if ((project.audio.styleId || 'natural') !== (project.narrationStyle || 'natural')) throw new HttpError(400, 'Generate narration with the selected style before approving it');
        if (project.audio.scriptSha256 !== crypto.createHash('sha256').update(project.script).digest('hex')) throw new HttpError(400, 'The script changed. Generate the updated narration before approving it');
      }
      project.audio.status = b.status;
      return send(res, 200, await saveProject(project));
    }
  }

  if (p === '/api/wan' && method === 'GET') return send(res, 200, await wanStatus());
  if (p === '/api/wan' && method === 'PUT') { const b = await readJson(req); await saveWan(b); return send(res, 200, await wanStatus()); }
  if (p === '/api/wan' && method === 'DELETE') { await clearWanKey(); return send(res, 200, await wanStatus()); }
  if (p === '/api/wan/check' && method === 'POST') return send(res, 200, await checkWan());
  if (p === '/api/wan/test' && method === 'POST') { const b = await readJson(req).catch(() => ({})); return send(res, 200, await startWanTest({prompt: b.prompt})); }
  if (p === '/api/wan/clips' && method === 'GET') return send(res, 200, {clips: await wanClips()});
  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})\/scenes\/(s[a-f0-9]{6})\/wan-clip$/)) && method === 'POST') {
    const project = await loadProject(m[1]);
    const scene = sceneOf(project, m[2]);
    const b = await readJson(req);
    const src = await wanClipPath(String(b.file || ''));
    const id = 'a' + newId(3);
    const file = id + '.mp4';
    await fs.mkdir(assetsDir(project.id), {recursive: true});
    await fs.copyFile(src, path.join(assetsDir(project.id), file));
    scene.assets.push(newAsset('video', file, {id, origin: 'ai', rights: 'ai_labelled', label: AI_LABEL, notes: 'Wan AI-generated motion clip'}));
    return send(res, 200, await saveProject(project));
  }
  if (p === '/api/wan/test' && method === 'GET') return send(res, 200, wanTestStatus());

  // Brand intro / outro clips, one per brand, edition and slot.
  if (p === '/api/brand-clips' && method === 'GET') return send(res, 200, {clips: await listClips()});
  if ((m = p.match(/^\/api\/brand-clips\/([A-Z_]+)\/(MORNING|EVENING)\/(intro|outro)$/))) {
    const [, brand, edition, slot] = m;
    assertSlot(brand, edition, slot);
    if (method === 'DELETE') { await removeClip(brand, edition, slot); return send(res, 200, {clips: await listClips()}); }
    if (method === 'POST') {
      const ext = path.extname(String(url.searchParams.get('name') || '')).toLowerCase();
      if (!CLIP_EXTS.includes(ext)) throw new HttpError(400, 'Upload an MP4, WebM or MOV clip');
      await fs.mkdir(CLIPS_DIR, {recursive: true});
      const temp = path.join(CLIPS_DIR, `.upload-${newId(4)}${ext}`);
      await streamToFile(req, temp, 300 * 1024 * 1024);
      const info = await storeClip(brand, edition, slot, temp, ext);
      return send(res, 200, {clips: await listClips(), info});
    }
  }

  // GPT Image: the last-resort picture when Commons, stock and cards have nothing suitable.
  if (p === '/api/gpt-image' && method === 'GET') return send(res, 200, await gptImageStatus());
  if (p === '/api/gpt-image' && method === 'PUT') { await saveGptImage(await readJson(req)); return send(res, 200, await gptImageStatus()); }
  if (p === '/api/gpt-image' && method === 'DELETE') { await clearGptImageKey(); return send(res, 200, await gptImageStatus()); }
  if (p === '/api/gpt-image/check' && method === 'POST') return send(res, 200, await checkGptImage());
  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})\/scenes\/(s[a-f0-9]{6})\/gpt-image$/)) && method === 'POST') {
    const b = await readJson(req);
    const quality = QUALITIES.includes(b.quality) ? b.quality : 'medium';
    const project = await loadProject(m[1]);
    const scene = sceneOf(project, m[2]);
    // Requests for one project run one at a time, so the project cannot change while the picture is generated.
    const image = await generateGptImage({prompt: b.prompt, orientation: orientationOf(project), quality});
    const id = 'a' + newId(3);
    const file = id + image.ext;
    await fs.mkdir(assetsDir(project.id), {recursive: true});
    await fs.writeFile(path.join(assetsDir(project.id), file), image.buffer);
    scene.assets.push(newAsset('image', file, {id, origin: 'ai', rights: 'ai_labelled', label: AI_LABEL, credit: `AI-generated image (OpenAI ${image.model})`,
      notes: 'GPT image: ' + String(b.prompt || '').slice(0, 140), aiPrompt: image.prompt, aiModel: image.model, aiQuality: quality}));
    return send(res, 200, await saveProject(project));
  }

  if (p === '/api/stock' && method === 'GET') return send(res, 200, {providers: PROVIDERS, configured: await stockStatus()});
  if ((m = p.match(/^\/api\/stock\/(pexels|pixabay)$/)) && method === 'PUT') { const b = await readJson(req); await saveStockKey(m[1], b.apiKey); return send(res, 200, {configured: await stockStatus()}); }
  if ((m = p.match(/^\/api\/stock\/(pexels|pixabay)$/)) && method === 'DELETE') { await clearStockKey(m[1]); return send(res, 200, {configured: await stockStatus()}); }
  if (p === '/api/stock/search' && method === 'GET') return send(res, 200, await searchStock(url.searchParams.get('provider'), url.searchParams.get('q'), url.searchParams.get('kind') || 'photo'));
  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})\/scenes\/(s[a-f0-9]{6})\/stock$/)) && method === 'POST') {
    const project = await loadProject(m[1]);
    const scene = sceneOf(project, m[2]);
    const b = await readJson(req);
    if (!PROVIDERS[b.provider] || !['photo', 'video'].includes(b.kind)) throw new HttpError(400, 'Unknown stock source');
    if (!stockHostOk(String(b.fileUrl || ''), b.provider)) throw new HttpError(400, `Files must come from ${PROVIDERS[b.provider]}`);
    const {buffer, ext} = await downloadStock(String(b.fileUrl), b.kind);
    const id = 'a' + newId(3);
    const file = id + ext;
    await fs.mkdir(assetsDir(project.id), {recursive: true});
    await fs.writeFile(path.join(assetsDir(project.id), file), buffer);
    scene.assets.push(newAsset(b.kind === 'video' ? 'video' : 'image', file, {id, ...stockAssetFields({...b, provider: b.provider})}));
    return send(res, 200, await saveProject(project));
  }

  if (p === '/api/voice/google' && method === 'GET') return send(res, 200, {configured: !!(await getKey()), voices: VOICES});
  if (p === '/api/voice/pocket' && method === 'GET') return send(res, 200, await pocketStatus());
  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})\/audio\/pocket-voice$/)) && method === 'POST') {
    const b = await readJson(req);
    const project = await loadProject(m[1]);
    const voiceId = b.voice || project.narratorId || DEFAULT_NARRATOR;
    const voice = requireNarrator(voiceId);
    const styleId = b.style || project.narrationStyle || 'natural';
    requireNarrationStyle(styleId);
    const file = 'narration-' + newId(3) + '.wav';
    const dir = assetsDir(project.id);
    await fs.mkdir(dir, {recursive: true});
    let info;
    try { info = await narratePocket(project.script, voiceId, path.join(dir, file), styleId); }
    catch (error) { await fs.unlink(path.join(dir, file)).catch(() => {}); throw error; }
    const previous = project.audio?.file;
    project.narratorId = voiceId;
    project.narrationStyle = styleId;
    project.audio = {file, status: 'DRAFT', origin: 'pocket-tts', name: voice.label, ...info};
    const saved = await saveProject(project);
    if (previous) await fs.unlink(path.join(dir, previous)).catch(() => {});
    return send(res, 200, saved);
  }
  if (p === '/api/voice/google' && method === 'PUT') { const b = await readJson(req); await saveKey(b.apiKey); return send(res, 200, {configured: true}); }
  if (p === '/api/voice/google' && method === 'DELETE') { await clearKey(); return send(res, 200, {configured: !!(await getKey())}); }

  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})\/audio\/google-voice$/)) && method === 'POST') {
    const b = await readJson(req);
    const project = await loadProject(m[1]);
    if (!project.script.trim()) throw new HttpError(400, 'Add a script first');
    const dir = assetsDir(project.id);
    await fs.mkdir(dir, {recursive: true});
    const file = 'narration-' + newId(3) + '.wav';
    const info = await narrate(project.script, String(b.voice || VOICES[0].id), path.join(dir, file));
    if (project.audio?.file) await fs.unlink(path.join(dir, project.audio.file)).catch(() => {});
    const voice = VOICES.find(v => v.id === (b.voice || VOICES[0].id));
    project.audio = {file, status: 'DRAFT', origin: 'google-voice', name: 'Google voice - ' + voice.label.split(' (')[0]};
    return send(res, 200, await saveProject(project));
  }

  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})\/audio\/draft-voice$/)) && method === 'POST') {
    if (process.platform !== 'win32') throw new HttpError(400, 'The draft voice needs Windows');
    const project = await loadProject(m[1]);
    if (!project.script.trim()) throw new HttpError(400, 'Add a script first');
    const dir = assetsDir(project.id);
    await fs.mkdir(dir, {recursive: true});
    const file = 'narration-' + newId(3) + '.wav';
    const textFile = path.join(dir, '.draft-voice.txt');
    await fs.writeFile(textFile, project.script, 'utf8');
    await new Promise((resolve, reject) => execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(HERE, 'lib', 'draft-voice.ps1'), '-Out', path.join(dir, file), '-TextFile', textFile],
      {timeout: 120000}, error => error ? reject(new HttpError(500, 'Draft voice failed: ' + error.message)) : resolve()));
    await fs.unlink(textFile).catch(() => {});
    if (project.audio?.file) await fs.unlink(path.join(dir, project.audio.file)).catch(() => {});
    project.audio = {file, status: 'DRAFT', origin: 'draft-voice', name: 'Draft Windows voice'};
    return send(res, 200, await saveProject(project));
  }

  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})\/sources$/)) && method === 'GET') return send(res, 200, {text: sourcesText(await loadProject(m[1]))});

  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})\/check$/)) && method === 'POST') {
    const b = await readJson(req);
    const project = await loadProject(m[1]);
    const result = gateProject(project, {draft: !!b.draft});
    result.warnings.push(...(await bookendClips(project)).warnings);
    return send(res, 200, result);
  }

  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})\/export$/)) && method === 'POST') {
    const b = await readJson(req);
    const result = await exportJob(await loadProject(m[1]), {draft: !!b.draft});
    return send(res, result.ok ? 200 : 422, result);
  }

  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})\/render$/))) {
    const id = m[1];
    if (method === 'GET') return send(res, 200, renderState.get(id) || {status: 'idle'});
    if (method === 'POST') {
      if (renderState.get(id)?.status === 'running') throw new HttpError(409, 'A render is already running for this project');
      const b = await readJson(req);
      const draft = !!b.draft;
      const result = await exportJob(await loadProject(id), {draft});
      if (!result.ok) return send(res, 422, result);
      await fs.mkdir(RENDERS, {recursive: true});
      const outName = `studio-${id}-${result.mode}-${new Date().toISOString().replace(/\D/g, '').slice(2, 14)}.mp4`;
      const state = {status: 'running', mode: result.mode, startedAt: new Date().toISOString(), output: null, log: '', warnings: result.warnings};
      renderState.set(id, state);
      const child = spawn('npx', ['remotion', 'render', 'src/index.jsx', result.composition, path.join(RENDERS, outName), `--props=${result.propsPath}`],
        {cwd: path.join(ROOT, 'video-studio', 'remotion'), shell: true, windowsHide: true});
      const keep = chunk => { state.log = (state.log + chunk.toString()).slice(-4000); };
      child.stdout.on('data', keep);
      child.stderr.on('data', keep);
      child.on('error', error => { state.status = 'failed'; state.finishedAt = new Date().toISOString(); state.log += '\n' + error.message; });
      child.on('close', code => {
        if (state.status === 'failed') return;
        state.status = code === 0 ? 'done' : 'failed';
        state.finishedAt = new Date().toISOString();
        if (code === 0) state.output = outName;
      });
      return send(res, 202, state);
    }
  }

  throw new HttpError(404, 'Not found');
}

async function serveFile(req, res, file, types, allowRange = true) {
  const ext = path.extname(file).toLowerCase();
  const entry = types[ext];
  const type = Array.isArray(entry) ? entry[1] : entry;
  if (!type) throw new HttpError(404, 'Not found');
  let stat;
  try { stat = await fs.stat(file); } catch { throw new HttpError(404, 'Not found'); }
  const range = allowRange && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) { res.writeHead(416, {'Content-Range': `bytes */${stat.size}`}); return res.end(); }
    res.writeHead(206, {'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1});
    return fssync.createReadStream(file, {start, end}).pipe(res);
  }
  res.writeHead(200, {'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff'});
  fssync.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const host = String(req.headers.host || '').split(':')[0];
    const url = new URL(req.url, 'http://localhost');
    // The Host header can be faked by anyone on the network, so in phone-access mode also require a genuine loopback connection.
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
    const isLocal = ['127.0.0.1', 'localhost'].includes(host) && (!REMOTE || loopback);
    if (!isLocal) {
      // Phone / remote access: only when started with STUDIO_REMOTE=1, and only with the access key.
      if (!REMOTE) throw new HttpError(403, 'Forbidden host');
      const cookie = /(?:^|;\s*)studio_key=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || '')?.[1];
      const given = url.searchParams.get('key');
      if (given && safeEqual(given, ACCESS_KEY)) {
        res.writeHead(302, {'Set-Cookie': `studio_key=${ACCESS_KEY}; Path=/; HttpOnly; SameSite=Strict; Max-Age=31536000`, Location: '/'});
        return res.end();
      }
      if (!cookie || !safeEqual(cookie, ACCESS_KEY)) {
        res.writeHead(401, {'Content-Type': 'text/html; charset=utf-8'});
        return res.end('<meta name=viewport content="width=device-width"><body style="font-family:sans-serif;padding:24px"><h2>Video Studio</h2><p>Access key needed. Open the full link shown on the PC (it ends with <code>?key=...</code>) once on this device.</p>');
      }
    }
    let p;
    try { p = decodeURIComponent(url.pathname); } catch { throw new HttpError(400, 'Bad request path'); }
    if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-studio'] !== '1') throw new HttpError(403, 'Missing X-Studio header');
    if (p.startsWith('/api/')) {
      const lockId = req.method === 'GET' ? null : (p.match(/^\/api\/projects\/([a-f0-9]{12})(?:\/|$)/) || [])[1];
      return lockId ? await withProjectLock(lockId, () => api(req, res, url, p)) : await api(req, res, url, p);
    }
    let m;
    if ((m = p.match(/^\/files\/([a-f0-9]{12})\/([\w.-]+)$/))) return await serveFile(req, res, path.join(assetsDir(m[1]), m[2]), MEDIA);
    if ((m = p.match(/^\/brand-clips\/([\w-]+\.(?:mp4|webm|mov))$/))) return await serveFile(req, res, clipPath(m[1]), MEDIA);
    if ((m = p.match(/^\/renders\/(studio-[a-f0-9]{12}-(?:draft|final)(?:-\d{12})?\.mp4)$/))) return await serveFile(req, res, path.join(RENDERS, m[1]), MEDIA);
    const name = p === '/' ? 'index.html' : p.slice(1);
    if (/^[\w.-]+$/.test(name) && STATIC[path.extname(name)]) return await serveFile(req, res, path.join(PUBLIC, name), STATIC, false);
    throw new HttpError(404, 'Not found');
  } catch (error) {
    const status = error.status || 500;
    if (status === 500) console.error(error);
    if (!res.headersSent) send(res, status, {error: error.message, ...(error.extra || {})});
    else res.destroy();
  }
});

server.listen(PORT, REMOTE ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`Video Studio running at http://127.0.0.1:${PORT}`);
  if (REMOTE) {
    console.log('Phone access is ON. On the same Wi-Fi, open one of these on your phone (first time only):');
    for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`  http://${a.address}:${PORT}/?key=${ACCESS_KEY}`);
  }
});
