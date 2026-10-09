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
  HttpError, ROOT, LABELS, RIGHTS, STORY_TYPES, BRANDS, FORMATS, formatOf, sourcesText, newId, validId, assetsDir, projectDir,
  loadProject, saveProject, listProjects, createProject, splitScenes, gateProject, exportJob,
} from './lib/project.mjs';
import {VOICES, getKey, saveKey, clearKey, narrate} from './lib/google-voice.mjs';
import {importUrl, searchCommons, downloadImage, licenceRights} from './lib/sources.mjs';
import {PROVIDERS, stockStatus, saveStockKey, clearStockKey, searchStock, stockHostOk, downloadStock, stockAssetFields} from './lib/stock.mjs';

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

  if (p === '/api/health') return send(res, 200, {ok: true, labels: LABELS, rights: RIGHTS, storyTypes: STORY_TYPES, brands: BRANDS, formats: FORMATS});
  if (p === '/api/projects' && method === 'GET') return send(res, 200, await listProjects());
  if (p === '/api/projects' && method === 'POST') return send(res, 200, await createProject(await readJson(req)));

  if (p === '/api/import-url' && method === 'POST') {
    const body = await readJson(req);
    const page = await importUrl(String(body.url || ''));
    const project = await createProject({
      title: page.title || 'Imported article', brand: body.brand, storyType: body.storyType,
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
      if (STORY_TYPES.includes(b.storyType)) project.storyType = b.storyType;
      if (FORMATS.includes(b.format)) project.format = b.format;
      if (typeof b.headline === 'string') project.headline = b.headline.slice(0, 200);
      if (typeof b.script === 'string') project.script = b.script.slice(0, 20000);
      if (typeof b.sourceText === 'string') project.sourceText = b.sourceText.slice(0, 100000);
      return send(res, 200, await saveProject(project));
    }
  }

  if ((m = p.match(/^\/api\/projects\/([a-f0-9]{12})\/split$/)) && method === 'POST') {
    const project = await loadProject(m[1]);
    project.scenes = splitScenes(project.script, project.scenes);
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
      project.audio.status = b.status;
      return send(res, 200, await saveProject(project));
    }
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
    return send(res, 200, gateProject(await loadProject(m[1]), {draft: !!b.draft}));
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
      const child = spawn('npx', ['remotion', 'render', 'src/index.jsx', 'DGBNFaceless9x16', path.join(RENDERS, outName), `--props=${result.propsPath}`],
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
