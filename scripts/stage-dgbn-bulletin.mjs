import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const [source, target = 'jobs/renders/staged-dgbn-bulletin.json'] = process.argv.slice(2);
if (!source) throw new Error('Usage: node scripts/stage-dgbn-bulletin.mjs <source> [target]');

const job = JSON.parse(await fs.readFile(source, 'utf8'));
if (job.brand !== 'DGBN' || job.jobType !== 'bulletin') {
  throw new Error('DGBN bulletin staging requires brand=DGBN and jobType=bulletin');
}
if (job.approval?.status !== 'approved') {
  throw new Error('DGBN bulletin must be human-approved before final assembly');
}

const presenterUrl = job.presenter?.masterVideoSrc;
if (!/^https:\/\//i.test(presenterUrl || '')) {
  throw new Error('Approved HeyGen presenter master URL is required');
}

const safeId = String(job.jobId || 'dgbn-bulletin').replace(/[^a-zA-Z0-9_-]+/g, '-');
const folder = path.resolve('video-studio/remotion/public/assets', safeId);
await fs.mkdir(folder, {recursive:true});

async function stage(url, filename, label) {
  if (!/^https:\/\//i.test(url || '')) return url;
  const headers = {};
  if (job.mediaBaseUrl && new URL(url).origin === new URL(job.mediaBaseUrl).origin) {
    const token = process.env.VIDEO_RENDER_CALLBACK_TOKEN;
    if (!token) throw new Error('Renderer media token is missing');
    headers.Authorization = 'Bearer ' + token;
  }
  const response = await fetch(url, {
    headers,
    redirect: headers.Authorization ? 'error' : 'follow',
  });
  if (!response.ok) throw new Error(label + ' download failed: ' + response.status);
  const data = Buffer.from(await response.arrayBuffer());
  if (!data.length || data.length > 250 * 1024 * 1024) {
    throw new Error(label + ' is empty or too large');
  }
  const absolute = path.join(folder, filename);
  await fs.writeFile(absolute, data);
  return 'assets/' + safeId + '/' + filename;
}

const staged = structuredClone(job);
staged.presenter.masterVideoPath = await stage(
  presenterUrl,
  'heygen-presenter-master.mp4',
  'HeyGen presenter master',
);

const presenterAbsolute = path.join(
  folder,
  path.basename(staged.presenter.masterVideoPath),
);
const durationSec = Number(execFileSync(
  'ffprobe',
  ['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',presenterAbsolute],
  {encoding:'utf8'},
).trim());
if (!(durationSec > 5 && durationSec < 1800)) {
  throw new Error('Presenter master duration is outside bulletin limits');
}
staged.durationSec = durationSec;
staged.presenter.durationSec = durationSec;

let visualIndex = 0;
for (const story of staged.stories || []) {
  if (!story.visuals) story.visuals = {};
  const assets = Array.isArray(story.visuals.assets) ? story.visuals.assets : [];
  for (const asset of assets) {
    const url = asset.src;
    if (!/^https:\/\//i.test(url || '')) continue;
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).toLowerCase();
    const kind = (asset.kind || '').toLowerCase();
    const allowed = kind === 'video' ? ['.mp4','.webm','.mov'] : ['.png','.jpg','.jpeg','.webp'];
    const suffix = allowed.includes(ext) ? ext : (kind === 'video' ? '.mp4' : '.jpg');
    visualIndex += 1;
    asset.src = await stage(
      url,
      'visual-' + String(visualIndex).padStart(3,'0') + suffix,
      'Bulletin visual ' + visualIndex,
    );
  }
}

staged.staged = true;
staged.assembly = {
  presenterAudioSpine: true,
  heygenContainsBroll: false,
  hyperframesQwenWanStageComplete: true,
  finalCompositor: 'REMOTION',
  youtubeReady: false,
  requiresFinalQc: true,
};

await fs.mkdir(path.dirname(target), {recursive:true});
await fs.writeFile(target, JSON.stringify(staged,null,2)+'\n');
console.log(JSON.stringify({
  event:'dgbn-bulletin-staged',
  jobId:staged.jobId,
  durationSec,
  stories:(staged.stories || []).length,
  visuals:visualIndex,
}));
