import fs from 'node:fs/promises';
import path from 'node:path';
import {
  submitWan3Shot,
  pollWan3Task,
  downloadVideo,
  getWan3RuntimeConfig,
} from './wan3-client.mjs';

const [jobPath = 'jobs/samples/dsn-short-master-v1.json'] = process.argv.slice(2);
const job = JSON.parse(await fs.readFile(jobPath,'utf8'));
const cueSheet = job.visualCueSheet || {};
const candidates = cueSheet.cinematic_candidates || [];

const configured = Boolean(
  (process.env.WAN_3_API_KEY || process.env.DASHSCOPE_API_KEY) &&
  process.env.WAN_3_WORKSPACE_ID
);

if (!configured) {
  console.log(JSON.stringify({
    event:'wan3-skipped',
    reason:'WAN_3 credentials not configured',
    candidates:candidates.length
  }));
  process.exit(0);
}

const requestedMaxShots = Number(job.wanPolicy?.maxShots ?? process.env.WAN_3_MAX_SHOTS ?? 2);
const requestedMaxDurationSec = Number(job.wanPolicy?.maxDurationSec ?? process.env.WAN_3_MAX_DURATION_SEC ?? 5);
const maxShots = Number.isFinite(requestedMaxShots) ? Math.max(0, Math.min(4, Math.floor(requestedMaxShots))) : 2;
const maxDurationSec = Number.isFinite(requestedMaxDurationSec)
  ? Math.max(2, Math.min(8, requestedMaxDurationSec))
  : 5;

const storyId = job.storyId || 'dsn-job';
const publicRoot = path.resolve('video-studio/remotion/public');
const generatedDir = path.resolve(publicRoot, 'assets', storyId, 'wan');
await fs.mkdir(generatedDir,{recursive:true});
cueSheet.visual_cues = cueSheet.visual_cues || [];

function absolutePublicPath(relativePath) {
  const clean = String(relativePath || '').replace(/^[/\\]+/, '');
  const resolved = path.resolve(publicRoot, clean);
  if (resolved !== publicRoot && !resolved.startsWith(publicRoot + path.sep)) {
    throw new Error('WAN output path escaped the Remotion public directory');
  }
  return resolved;
}

function ensureGeneratedCue(candidate) {
  const relative = candidate.outputPath;
  if (!relative) return;
  const exists = cueSheet.visual_cues.some((cue) =>
    (cue.asset_url || cue.assetUrl) === relative
  );
  if (exists) return;
  const durationSec = Math.max(
    2,
    Math.min(maxDurationSec, Number(candidate.end || 0) - Number(candidate.start || 0) || 4)
  );
  cueSheet.visual_cues.push({
    start:Number(candidate.start || 0),
    end:Number(candidate.end || (Number(candidate.start || 0)+durationSec)),
    spoken_idea:candidate.reason || 'Approved illustrative visual',
    visual_type:'BROLL',
    layout:'FULL',
    rights_strategy:'GENERATED_ILLUSTRATION',
    asset_url:relative,
    generated:true,
    disclosure:'AI-GENERATED ILLUSTRATION',
    notes:'Wan-generated illustrative insert approved by the production rights gate. Narration continues underneath.'
  });
}

let restored = 0;
const reusable = candidates.filter((candidate) =>
  candidate &&
  candidate.status === 'GENERATED' &&
  candidate.taskId &&
  candidate.outputPath
);

if (reusable.length) {
  const runtime = getWan3RuntimeConfig();
  for (const candidate of reusable) {
    const outputPath = absolutePublicPath(candidate.outputPath);
    let present = false;
    try {
      const stat = await fs.stat(outputPath);
      present = stat.isFile() && stat.size > 0;
    } catch {
      present = false;
    }
    if (!present) {
      const completed = await pollWan3Task({
        taskId:candidate.taskId,
        baseUrl:runtime.baseUrl,
        apiKey:runtime.apiKey,
        intervalMs:1000,
        maxPolls:3,
      });
      const saved = await downloadVideo(completed.videoUrl,outputPath);
      candidate.bytes=saved.bytes;
      restored += 1;
      console.log(JSON.stringify({
        event:'wan3-restored',
        taskId:candidate.taskId,
        outputPath:candidate.outputPath,
        bytes:saved.bytes
      }));
    }
    ensureGeneratedCue(candidate);
  }
}

const allEligible = candidates.filter((candidate) =>
  candidate &&
  candidate.documentary === false &&
  candidate.prompt &&
  ['APPROVED','APPROVED_BY_RIGHTS_GATE'].includes(candidate.status)
);
const eligible = allEligible.slice(0, maxShots);

if (allEligible.length > eligible.length) {
  console.log(JSON.stringify({
    event:'wan3-candidates-capped',
    eligible:allEligible.length,
    selected:eligible.length,
    maxShots,
    maxDurationSec
  }));
}

if (!eligible.length) {
  job.visualCueSheet=cueSheet;
  await fs.writeFile(jobPath,JSON.stringify(job,null,2)+'\n');
  console.log(JSON.stringify({
    event:'wan3-no-new-generation-required',
    restored,
    reusable:reusable.length,
    jobPath
  }));
  process.exit(0);
}

for (let index = 0; index < eligible.length; index += 1) {
  const candidate = eligible[index];
  const shotId = `wan-cue-${String(index + 1).padStart(2,'0')}`;
  const durationSec = Math.max(
    2,
    Math.min(maxDurationSec, Number(candidate.end || 0) - Number(candidate.start || 0) || 4)
  );
  const absoluteOutputPath = path.join(generatedDir, shotId + '.mp4');
  const relativeOutputPath = `assets/${storyId}/wan/${shotId}.mp4`;
  const shot = {
    shotId,
    purpose:'ILLUSTRATIVE_BROLL',
    prompt:[
      candidate.prompt,
      'Editorial football illustration only. Do not imitate broadcast footage.',
      'No club crest, league logo, on-screen text, scoreboard or watermark.',
      'Do not present the image as documentary evidence of the real match.'
    ].join(' '),
    dialogue:null,
    provider:'WAN_3',
    model:process.env.WAN_3_MODEL || 'wan3.0-video',
    resolution:candidate.resolution || '720P',
    durationSec,
    status:'APPROVED',
    outputPath:absoluteOutputPath
  };

  const submitted = await submitWan3Shot({job,shot});
  console.log(JSON.stringify({
    event:'wan3-submitted',
    shotId,
    taskId:submitted.taskId
  }));
  const completed = await pollWan3Task(submitted);
  const saved = await downloadVideo(completed.videoUrl,absoluteOutputPath);

  candidate.status='GENERATED';
  candidate.provider='WAN_3';
  candidate.outputPath=relativeOutputPath;
  candidate.taskId=submitted.taskId;
  candidate.bytes=saved.bytes;
  ensureGeneratedCue(candidate);
}

job.visualCueSheet=cueSheet;
await fs.writeFile(jobPath,JSON.stringify(job,null,2)+'\n');

console.log(JSON.stringify({
  event:'wan3-cues-ready',
  generated:eligible.length,
  restored,
  eligibleTotal:allEligible.length,
  maxShots,
  maxDurationSec,
  jobPath
}));
