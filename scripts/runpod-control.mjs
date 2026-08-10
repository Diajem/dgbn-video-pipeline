const API_BASE = 'https://rest.runpod.io/v1';
const SERVERLESS_BASE = 'https://api.runpod.ai/v2';

const rawApiKey = process.env.RUNPOD_API_KEY;
if (!rawApiKey) throw new Error('RUNPOD_API_KEY is not configured');
const apiKey = rawApiKey.trim().replace(/[“”‘’\"'`]/g, '');
if (!apiKey) throw new Error('RUNPOD_API_KEY is empty after normalization');

const controlPath = process.env.RUNPOD_CONTROL_FILE || '.runpod/control.json';
const { readFile } = await import('node:fs/promises');
const control = JSON.parse(await readFile(controlPath, 'utf8'));

const headers = {
  Authorization: `Bearer ${apiKey}`,
  'Content-Type': 'application/json',
};

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!response.ok) {
    throw new Error(`${options.method || 'GET'} ${path} failed (${response.status}): ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  }
  return body;
}

function endpointSummary(endpoint) {
  return {
    id: endpoint.id,
    name: endpoint.name,
    workersMin: endpoint.workersMin,
    workersMax: endpoint.workersMax,
    gpuCount: endpoint.gpuCount,
    gpuTypeIds: endpoint.gpuTypeIds,
    allowedCudaVersions: endpoint.allowedCudaVersions,
    idleTimeout: endpoint.idleTimeout,
    executionTimeoutMs: endpoint.executionTimeoutMs,
    templateId: endpoint.template?.id || endpoint.templateId || null,
  };
}

function podSummary(pod) {
  return {
    id: pod.id,
    name: pod.name,
    desiredStatus: pod.desiredStatus,
    costPerHr: pod.costPerHr,
    adjustedCostPerHr: pod.adjustedCostPerHr,
    gpu: pod.gpu ? { id: pod.gpu.id, displayName: pod.gpu.displayName, count: pod.gpu.count } : null,
    endpointId: pod.endpointId,
    locked: pod.locked,
  };
}

async function findEndpoint() {
  const endpoints = await api('/endpoints');
  const endpoint = control.endpointId
    ? endpoints.find((item) => item.id === control.endpointId)
    : endpoints.find((item) => item.name === (control.endpointName || 'dgbn-video-pipeline'));
  if (!endpoint) throw new Error(`RunPod endpoint not found: ${control.endpointId || control.endpointName || 'dgbn-video-pipeline'}`);
  return endpoint;
}

async function inspectAll() {
  const endpoint = await findEndpoint();
  const pods = await api('/pods');
  console.log('ENDPOINT', JSON.stringify(endpointSummary(endpoint), null, 2));
  console.log('PODS', JSON.stringify(pods.map(podSummary), null, 2));
  return endpoint;
}

async function freezeEndpoint() {
  const endpoint = await findEndpoint();
  console.log('Before freeze:', JSON.stringify(endpointSummary(endpoint), null, 2));
  await api(`/endpoints/${endpoint.id}/update`, {
    method: 'POST',
    body: JSON.stringify({ workersMin: 0, workersMax: 0 }),
  });
  const updated = await findEndpoint();
  console.log('After freeze:', JSON.stringify(endpointSummary(updated), null, 2));
  if (updated.workersMin !== 0 || updated.workersMax !== 0) {
    throw new Error('Endpoint freeze verification failed');
  }
  const pods = await api('/pods');
  console.log('PODS', JSON.stringify(pods.map(podSummary), null, 2));
}

async function configureEndpoint() {
  const endpoint = await findEndpoint();
  const gpuTypeIds = control.gpuTypeIds || ['NVIDIA RTX A4000'];
  const payload = {
    workersMin: Number.isInteger(control.workersMin) ? control.workersMin : 0,
    workersMax: Number.isInteger(control.workersMax) ? control.workersMax : 1,
    gpuCount: Number.isInteger(control.gpuCount) ? control.gpuCount : 1,
    gpuTypeIds,
    allowedCudaVersions: control.allowedCudaVersions || ['11.8'],
    idleTimeout: Number.isInteger(control.idleTimeout) ? control.idleTimeout : 5,
  };
  console.log('Applying configuration:', JSON.stringify(payload, null, 2));
  await api(`/endpoints/${endpoint.id}/update`, { method: 'POST', body: JSON.stringify(payload) });
  const updated = await findEndpoint();
  console.log('Updated endpoint:', JSON.stringify(endpointSummary(updated), null, 2));
}

async function getPodOrThrow() {
  if (!control.podId) throw new Error(`${control.action} requires an explicit podId in control.json`);
  const pods = await api('/pods');
  const pod = pods.find((item) => item.id === control.podId);
  if (!pod) throw new Error(`Pod not found: ${control.podId}`);
  return pod;
}

async function stopPod() {
  const pod = await getPodOrThrow();
  console.log('Stopping pod:', JSON.stringify(podSummary(pod), null, 2));
  await api(`/pods/${pod.id}/stop`, { method: 'POST' });
  console.log(`Stop request accepted for pod ${pod.id}`);
}

async function startPod() {
  const pod = await getPodOrThrow();
  console.log('Starting pod:', JSON.stringify(podSummary(pod), null, 2));
  await api(`/pods/${pod.id}/start`, { method: 'POST' });
  console.log(`Start request accepted for pod ${pod.id}`);
}

async function healthcheck() {
  const endpoint = await findEndpoint();
  const submit = await fetch(`${SERVERLESS_BASE}/${endpoint.id}/run`, {
    method: 'POST', headers, body: JSON.stringify({ input: { healthcheck: true } }),
  });
  const submitText = await submit.text();
  const job = submitText ? JSON.parse(submitText) : null;
  if (!submit.ok) throw new Error(`Healthcheck submit failed (${submit.status}): ${submitText}`);
  console.log('Healthcheck job:', JSON.stringify({ id: job.id, status: job.status }, null, 2));
  const timeoutMs = control.pollTimeoutMs || 180000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 5000));
    const response = await fetch(`${SERVERLESS_BASE}/${endpoint.id}/status/${job.id}`, { headers });
    const text = await response.text();
    const status = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(`Healthcheck status failed (${response.status}): ${text}`);
    console.log('Healthcheck status:', status.status);
    if (['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(status.status)) {
      console.log('Healthcheck result:', JSON.stringify(status, null, 2));
      if (status.status !== 'COMPLETED') process.exitCode = 1;
      return;
    }
  }
  throw new Error(`Healthcheck polling exceeded ${timeoutMs}ms`);
}

switch (control.action) {
  case 'inspect':
    await inspectAll();
    break;
  case 'freeze':
    await freezeEndpoint();
    break;
  case 'configure':
    await configureEndpoint();
    break;
  case 'stop_pod':
    await stopPod();
    break;
  case 'start_pod':
    await startPod();
    break;
  case 'healthcheck':
    await healthcheck();
    break;
  default:
    throw new Error(`Unsupported control action: ${control.action}`);
}
