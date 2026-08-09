import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const presenterId = process.argv[2] || 'peet';
const apiKey = process.env.RUNPOD_API_KEY;
const endpointId = process.env.RUNPOD_ENDPOINT_ID;

if (!apiKey) throw new Error('RUNPOD_API_KEY is not set');
if (!endpointId) throw new Error('RUNPOD_ENDPOINT_ID is not set');

const workDir = path.join(root, 'avatar-service', 'work', presenterId);
const manifestPath = path.join(workDir, 'musetalk-benchmark-input.json');
if (!fs.existsSync(manifestPath)) {
  throw new Error(`Benchmark input not found. Run: node scripts/prepare-musetalk-source.mjs ${presenterId}`);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const video = fs.readFileSync(path.join(root, manifest.sourceVideo)).toString('base64');
const audio = fs.readFileSync(path.join(root, manifest.benchmarkAudio)).toString('base64');

const headers = {
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
};

const submitUrl = `https://api.runpod.ai/v2/${endpointId}/run`;
const submitResponse = await fetch(submitUrl, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    input: {
      task_id: `${presenterId}-musetalk-benchmark`,
      video_b64: video,
      audio_b64: audio,
    },
  }),
});

if (!submitResponse.ok) {
  throw new Error(`RunPod submit failed: ${submitResponse.status} ${await submitResponse.text()}`);
}

const submit = await submitResponse.json();
if (!submit.id) throw new Error(`RunPod did not return a job id: ${JSON.stringify(submit)}`);
console.log(`Submitted RunPod job ${submit.id}`);

const statusUrl = `https://api.runpod.ai/v2/${endpointId}/status/${submit.id}`;
let result;
for (;;) {
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const statusResponse = await fetch(statusUrl, {headers});
  if (!statusResponse.ok) {
    throw new Error(`RunPod status failed: ${statusResponse.status} ${await statusResponse.text()}`);
  }
  result = await statusResponse.json();
  console.log(`RunPod status: ${result.status}`);
  if (result.status === 'COMPLETED') break;
  if (['FAILED', 'CANCELLED', 'TIMED_OUT'].includes(result.status)) {
    throw new Error(`RunPod job ended with ${result.status}: ${JSON.stringify(result)}`);
  }
}

const output = result.output;
if (!output || output.error) {
  throw new Error(`MuseTalk worker error: ${JSON.stringify(output || result)}`);
}
if (!output.video_b64) throw new Error('RunPod result did not contain video_b64');

const outputDir = path.join(root, 'avatar-service', 'output');
fs.mkdirSync(outputDir, {recursive: true});
const outputPath = path.join(outputDir, `${presenterId}-musetalk-runpod.mp4`);
fs.writeFileSync(outputPath, Buffer.from(output.video_b64, 'base64'));
console.log(`Saved ${path.relative(root, outputPath)} (${output.bytes || fs.statSync(outputPath).size} bytes)`);
