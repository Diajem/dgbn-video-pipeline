import fs from 'node:fs/promises';
import path from 'node:path';

const REGION_HOSTS = {
  'eu-central-1': 'eu-central-1.maas.aliyuncs.com',
  'ap-southeast-1': 'ap-southeast-1.maas.aliyuncs.com',
  'us-east-1': 'us-east-1.maas.aliyuncs.com',
  'ap-northeast-1': 'ap-northeast-1.maas.aliyuncs.com',
  'cn-hongkong': 'cn-hongkong.maas.aliyuncs.com',
  'cn-beijing': 'cn-beijing.maas.aliyuncs.com',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function requiredEnv(name, fallbackName = null) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : '');
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function buildBaseUrl() {
  const region = process.env.WAN_3_REGION || 'eu-central-1';
  const workspaceId = requiredEnv('WAN_3_WORKSPACE_ID');
  const host = REGION_HOSTS[region];
  if (!host) throw new Error(`Unsupported WAN_3_REGION: ${region}`);
  return `https://${workspaceId}.${host}/api/v1`;
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Wan API ${response.status}: ${body.message || body.code || response.statusText}`);
  }
  return body;
}

export async function submitWan3Shot({job, shot}) {
  const apiKey = requiredEnv('WAN_3_API_KEY', 'DASHSCOPE_API_KEY');
  const baseUrl = buildBaseUrl();
  const model = shot.model || process.env.WAN_3_MODEL || 'wan3.0-video';
  const ratio = job.aspectRatio || '9:16';
  const media = (shot.media || []).filter((item) => item?.type && item?.url && !item.url.includes('example.invalid'));

  const payload = {
    model,
    input: {
      prompt: [shot.prompt, shot.dialogue ? `Dialogue: ${shot.dialogue}` : null].filter(Boolean).join('\n'),
      ...(media.length ? {media} : {}),
    },
    parameters: {
      resolution: shot.resolution || '720P',
      ratio,
      duration: Math.max(2, Math.min(30, Math.round(shot.durationSec || 5))),
      prompt_extend: true,
      watermark: false,
      audio: shot.audio !== false,
    },
  };

  const body = await requestJson(`${baseUrl}/services/aigc/video-generation/video-synthesis`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(payload),
  });

  const taskId = body.output?.task_id;
  if (!taskId) throw new Error(`Wan submission returned no task_id: ${JSON.stringify(body)}`);
  return {taskId, baseUrl, apiKey, requestId: body.request_id, payload};
}

export async function pollWan3Task({taskId, baseUrl, apiKey, intervalMs = 15000, maxPolls = 80}) {
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const body = await requestJson(`${baseUrl}/tasks/${taskId}`, {
      headers: {Authorization: `Bearer ${apiKey}`},
    });
    const status = body.output?.task_status;
    if (status === 'SUCCEEDED') {
      const videoUrl = body.output?.video_url;
      if (!videoUrl) throw new Error('Wan task succeeded but returned no video_url');
      return {videoUrl, result: body};
    }
    if (['FAILED', 'CANCELED', 'UNKNOWN'].includes(status)) {
      throw new Error(`Wan task ${taskId} ended with status ${status}: ${body.message || body.code || ''}`);
    }
    await sleep(intervalMs);
  }
  throw new Error(`Wan task ${taskId} did not finish within polling window`);
}

export async function downloadVideo(url, outputPath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download generated video: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await fs.mkdir(path.dirname(outputPath), {recursive: true});
  await fs.writeFile(outputPath, bytes);
  return {outputPath, bytes: bytes.length};
}

async function main() {
  const [jobPath, shotId] = process.argv.slice(2);
  if (!jobPath || !shotId) {
    throw new Error('Usage: node scripts/wan3-client.mjs <job.json> <shot-id>');
  }
  const job = JSON.parse(await fs.readFile(jobPath, 'utf8'));
  const shot = (job.shots || []).find((item) => item.shotId === shotId);
  if (!shot) throw new Error(`Shot not found: ${shotId}`);
  if (shot.provider && shot.provider !== 'WAN_3') throw new Error(`Shot provider is ${shot.provider}, not WAN_3`);

  const submitted = await submitWan3Shot({job, shot});
  console.log(JSON.stringify({event: 'submitted', shotId, taskId: submitted.taskId, requestId: submitted.requestId}));
  const completed = await pollWan3Task(submitted);
  const outputPath = shot.outputPath || `renders/cinematic/${job.storyId}/${shotId}.mp4`;
  const saved = await downloadVideo(completed.videoUrl, outputPath);
  console.log(JSON.stringify({event: 'saved', shotId, taskId: submitted.taskId, ...saved}));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
}
