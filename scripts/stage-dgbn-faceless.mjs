import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const [source, target = 'jobs/samples/dgbn-faceless-v1.json'] = process.argv.slice(2);
if (!source) throw new Error('Usage: node scripts/stage-dgbn-faceless.mjs <source> [target]');
const job = JSON.parse(await fs.readFile(source, 'utf8'));
const staged = structuredClone(job);
const folder = path.resolve('video-studio/remotion/public/assets', String(job.storyId));
await fs.mkdir(folder, {recursive:true});

async function stage(url, file, label) {
  if (!/^https:\/\//i.test(url || '')) throw new Error(label + ' requires an HTTPS asset URL');
  const headers = {};
  if (job.mediaBaseUrl && new URL(url).origin === new URL(job.mediaBaseUrl).origin) {
    const token = process.env.VIDEO_RENDER_CALLBACK_TOKEN;
    if (!token) throw new Error('Renderer media token is missing');
    headers.Authorization = 'Bearer ' + token;
  }
  const response = await fetch(url, {headers, redirect:'error'});
  if (!response.ok) throw new Error(label + ' download failed: ' + response.status);
  const data = Buffer.from(await response.arrayBuffer());
  if (!data.length || data.length > 120 * 1024 * 1024) throw new Error(label + ' asset is empty or too large');
  const absolute = path.join(folder,file);
  await fs.writeFile(absolute,data);
  return {absolute, relative:'assets/' + job.storyId + '/' + file};
}

const audio = await stage(job.audio.voiceoverSrc,'narration.wav','Approved narration');
staged.audio.voiceoverSrc = audio.relative;
const seconds = Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',audio.absolute],{encoding:'utf8'}).trim());
if (!(seconds > 3 && seconds < 600)) throw new Error('Narration duration is outside DGBN short limits');
staged.durationSec = seconds;
for (let i=0;i<staged.visuals.length;i++) {
  const visual = staged.visuals[i];
  const fromUrl = path.extname(new URL(visual.src).pathname).toLowerCase();
  const allowed = visual.kind === 'video' ? ['.mp4','.webm','.mov'] : ['.png','.jpg','.jpeg','.webp'];
  const extension = allowed.includes(fromUrl) ? fromUrl : (visual.kind === 'video' ? '.mp4' : '.png');
  const output = await stage(visual.src,'visual-'+String(i+1).padStart(2,'0')+extension,'Approved visual '+(i+1));
  visual.src = output.relative;
}
staged.staged = true;
await fs.mkdir(path.dirname(target), {recursive:true});
await fs.writeFile(target,JSON.stringify(staged,null,2)+'\n');
console.log(JSON.stringify({event:'dgbn-faceless-staged',storyId:job.storyId,visuals:staged.visuals.length,durationSec:seconds}));
