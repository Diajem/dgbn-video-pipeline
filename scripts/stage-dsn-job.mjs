import fs from 'node:fs/promises';
import path from 'node:path';

const [jobPath, stagedJobPath = 'jobs/samples/dsn-short-master-v1.json'] = process.argv.slice(2);
if (!jobPath) throw new Error('Usage: node scripts/stage-dsn-job.mjs <job.json> [staged-job.json]');

const job = JSON.parse(await fs.readFile(jobPath,'utf8'));
const staged = structuredClone(job);
const storyId = job.storyId || 'dsn-job';
const publicDir = path.resolve('video-studio/remotion/public/assets', storyId);
await fs.mkdir(publicDir,{recursive:true});

const isRemote = (value) => /^https?:\/\//i.test(value || '');

async function downloadRemote(url, filename) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download remote asset ${filename}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const output = path.join(publicDir, filename);
  await fs.writeFile(output, bytes);
  if (!bytes.length) throw new Error(`Downloaded asset is empty: ${filename}`);
  return `assets/${storyId}/${filename}`;
}

const spineUrl = staged.presenterSpine?.downloadUrl || staged.presenterSpine?.src;
if (isRemote(spineUrl)) {
  const relative = await downloadRemote(spineUrl, 'presenter-master.mp4');
  staged.presenterSpine.src = relative;
  staged.presenterSpine.audioSrc = relative;
}

const voiceoverUrl = staged.audio?.voiceoverDownloadUrl || staged.audio?.voiceoverSrc;
if (isRemote(voiceoverUrl)) {
  const relative = await downloadRemote(voiceoverUrl, 'voiceover.mp3');
  staged.audio = {...(staged.audio || {}), voiceoverSrc: relative};
}

// Stage remote B-roll referenced by the visual cue sheet once, rather than
// letting Chromium repeatedly fetch signed URLs while rendering frames.
const cues = staged.visualCueSheet?.visual_cues || [];
for (let index = 0; index < cues.length; index += 1) {
  const cue = cues[index];
  const remote = cue.asset_url || cue.assetUrl;
  if (!isRemote(remote)) continue;
  try {
    const parsed = new URL(remote);
    const ext = path.extname(parsed.pathname).toLowerCase();
    const safeExt = ['.png','.jpg','.jpeg','.webp','.mp4','.webm'].includes(ext) ? ext : '.jpg';
    cue.asset_url = await downloadRemote(remote, `cue-${String(index + 1).padStart(2,'0')}${safeExt}`);
  } catch (error) {
    throw new Error(`Failed to stage visual cue ${index + 1}: ${error.message}`);
  }
}

await fs.mkdir(path.dirname(stagedJobPath), {recursive:true});
await fs.writeFile(
  stagedJobPath,
  JSON.stringify(staged,null,2)+'\n',
);
console.log(JSON.stringify({
  event:'staged',
  storyId,
  presentationMode:job.presentationMode,
  presenterStaged:Boolean(staged.presenterSpine?.src),
  voiceoverStaged:Boolean(staged.audio?.voiceoverSrc),
  visualCueCount:cues.length,
  stagedJobPath
}));
