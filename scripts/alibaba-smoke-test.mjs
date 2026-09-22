import fs from 'node:fs/promises';
import {submitWan3Shot, pollWan3Task} from './wan3-client.mjs';

const args = new Set(process.argv.slice(2));
const runWan = args.has('--wan');
const confirmPaid = args.has('--confirm-paid');

const qwenKey = process.env.QWEN_API_KEY || process.env.WAN_3_API_KEY;
const workspace = process.env.QWEN_WORKSPACE_ID || process.env.WAN_3_WORKSPACE_ID;
const region = process.env.QWEN_REGION || process.env.WAN_3_REGION || 'eu-central-1';
const qwenModel = process.env.QWEN_VIDEO_PLANNER_MODEL || 'qwen3.8-omni-flash';
const qwenBase = process.env.QWEN_BASE_URL || (
  workspace ? `https://${workspace}.${region}.maas.aliyuncs.com/compatible-mode/v1` : ''
);

if (!qwenKey) throw new Error('Missing QWEN_API_KEY or WAN_3_API_KEY');
if (!workspace) throw new Error('Missing QWEN_WORKSPACE_ID or WAN_3_WORKSPACE_ID');
if (!qwenBase) throw new Error('Unable to resolve Qwen base URL');

const qwenResponse = await fetch(`${qwenBase.replace(/\/$/,'')}/chat/completions`, {
  method:'POST',
  headers:{
    Authorization:`Bearer ${qwenKey}`,
    'Content-Type':'application/json'
  },
  body:JSON.stringify({
    model:qwenModel,
    messages:[
      {
        role:'system',
        content:'Return JSON only.'
      },
      {
        role:'user',
        content:'Return exactly one JSON object with keys status, model_test and purpose. Set status to ok, model_test to qwen-video-planner, and purpose to DSN.'
      }
    ],
    temperature:0
  })
});

const qwenBody = await qwenResponse.json().catch(()=>({}));
if (!qwenResponse.ok) {
  throw new Error(`Qwen smoke test failed HTTP ${qwenResponse.status}: ${qwenBody.message || qwenBody.code || 'unknown error'}`);
}
const qwenContent = qwenBody.choices?.[0]?.message?.content;
if (!qwenContent) throw new Error('Qwen returned no content');

console.log(JSON.stringify({
  provider:'QWEN',
  status:'READY',
  model:qwenModel,
  region,
  workspace,
  response_received:true
}));

if (!runWan) {
  console.log(JSON.stringify({
    provider:'WAN_3',
    status:'SKIPPED',
    reason:'Paid Wan smoke test not requested'
  }));
  process.exit(0);
}

if (!confirmPaid) {
  throw new Error('Wan generation is paid. Re-run with --wan --confirm-paid');
}

const job = {
  storyId:'dsn-alibaba-smoke-test',
  aspectRatio:'9:16',
  characters:[]
};
const shot = {
  shotId:'smoke-shot',
  provider:'WAN_3',
  model:process.env.WAN_3_MODEL || 'wan3.0-video',
  status:'APPROVED',
  purpose:'ILLUSTRATIVE_BROLL',
  prompt:'A generic cinematic football stadium tunnel with dramatic neutral lighting, no people, no club crests, no league logos, no text, no scoreboard, no broadcast styling. Editorial illustration only.',
  resolution:'720P',
  durationSec:2,
  audio:false
};

const submitted = await submitWan3Shot({job,shot});
console.log(JSON.stringify({
  provider:'WAN_3',
  status:'SUBMITTED',
  taskId:submitted.taskId,
  requestId:submitted.requestId || null,
  region:process.env.WAN_3_REGION || region,
  workspace:process.env.WAN_3_WORKSPACE_ID || workspace
}));

const completed = await pollWan3Task({
  ...submitted,
  intervalMs:10000,
  maxPolls:60
});

if (!completed.videoUrl) throw new Error('Wan smoke test completed without video URL');

await fs.writeFile(
  '/tmp/alibaba-smoke-result.json',
  JSON.stringify({
    qwen:{status:'READY',model:qwenModel,region,workspace},
    wan:{status:'READY',taskId:submitted.taskId,video_url_received:true}
  },null,2)
);

console.log(JSON.stringify({
  provider:'WAN_3',
  status:'READY',
  taskId:submitted.taskId,
  video_url_received:true
}));
