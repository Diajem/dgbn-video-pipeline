import fs from 'node:fs/promises';
import path from 'node:path';

const [jobPath] = process.argv.slice(2);
if (!jobPath) throw new Error('Usage: node scripts/stage-dsn-job.mjs <job.json>');

const job = JSON.parse(await fs.readFile(jobPath,'utf8'));
const staged = structuredClone(job);
const publicDir = path.resolve('video-studio/remotion/public/assets', job.storyId || 'dsn-job');
await fs.mkdir(publicDir,{recursive:true});

const spineUrl = staged.presenterSpine?.downloadUrl || staged.presenterSpine?.src;
if (spineUrl && /^https?:\/\//i.test(spineUrl)) {
  const response = await fetch(spineUrl);
  if (!response.ok) throw new Error(`Failed to download presenter spine: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  const output = path.join(publicDir,'presenter-master.mp4');
  await fs.writeFile(output,bytes);
  const relative = `assets/${job.storyId || 'dsn-job'}/presenter-master.mp4`;
  staged.presenterSpine.src = relative;
  staged.presenterSpine.audioSrc = relative;
}

await fs.writeFile('jobs/samples/dsn-short-master-v1.json',JSON.stringify(staged,null,2)+'\n');
console.log(JSON.stringify({event:'staged',storyId:job.storyId,presentationMode:job.presentationMode}));
