import fs from 'node:fs/promises';
import path from 'node:path';
import {submitWan3Shot, pollWan3Task, downloadVideo} from './wan3-client.mjs';

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

const eligible = candidates.filter((candidate) =>
  candidate &&
  candidate.documentary === false &&
  candidate.prompt &&
  ['APPROVED','APPROVED_BY_RIGHTS_GATE'].includes(candidate.status)
);

if (!eligible.length) {
  console.log(JSON.stringify({event:'wan3-no-approved-candidates'}));
  process.exit(0);
}

const storyId = job.storyId || 'dsn-job';
const generatedDir = path.resolve(
  'video-studio/remotion/public/assets',
  storyId,
  'wan'
);
await fs.mkdir(generatedDir,{recursive:true});

cueSheet.visual_cues = cueSheet.visual_cues || [];

for (let index = 0; index < eligible.length; index += 1) {
  const candidate = eligible[index];
  const shotId = `wan-cue-${String(index + 1).padStart(2,'0')}`;
  const durationSec = Math.max(
    2,
    Math.min(8, Number(candidate.end || 0) - Number(candidate.start || 0) || 4)
  );
  const outputPath = path.join(generatedDir, shotId + '.mp4');
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
    outputPath
  };

  const submitted = await submitWan3Shot({job,shot});
  console.log(JSON.stringify({
    event:'wan3-submitted',
    shotId,
    taskId:submitted.taskId
  }));
  const completed = await pollWan3Task(submitted);
  const saved = await downloadVideo(completed.videoUrl,outputPath);
  const relative = `assets/${storyId}/wan/${shotId}.mp4`;

  candidate.status='GENERATED';
  candidate.provider='WAN_3';
  candidate.outputPath=relative;
  candidate.taskId=submitted.taskId;
  candidate.bytes=saved.bytes;

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

job.visualCueSheet=cueSheet;
await fs.writeFile(jobPath,JSON.stringify(job,null,2)+'\n');

console.log(JSON.stringify({
  event:'wan3-cues-ready',
  generated:eligible.length,
  jobPath
}));
