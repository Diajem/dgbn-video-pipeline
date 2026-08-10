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

function templateSummary(template) {
  return {
    id: template.id,
    name: template.name,
    imageName: template.imageName,
    isServerless: template.isServerless,
    containerDiskInGb: template.containerDiskInGb,
    dockerEntrypoint: template.dockerEntrypoint,
    dockerStartCmd: template.dockerStartCmd,
    runtimeInMin: template.runtimeInMin,
  };
}

async function findEndpoint() {
  const endpoints = await api('/endpoints');
  const endpoint = control.endpointId
    ? endpoints.find((item) => item.id === control.endpointId)
    : endpoints.find((item) => item.name === (control.endpointName || 'dgbn-video-pipeline'));
  if (!endpoint) throw new Error(`RunPod endpoint not found: ${control.endpointId || control.endpointName || 'dgbn-video-pipeline'}`);
  if (endpoint.name !== 'dgbn-video-pipeline') {
    throw new Error(`Safety guard: refusing to operate on non-DGBN endpoint ${endpoint.name}`);
  }
  return endpoint;
}

async function updateEndpoint(endpoint, payload) {
  await api(`/endpoints/${endpoint.id}/update`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return findEndpoint();
}

async function inspectEndpoint() {
  const endpoint = await findEndpoint();
  const summary = endpointSummary(endpoint);
  console.log('ENDPOINT', JSON.stringify(summary, null, 2));
  if (summary.templateId) {
    const template = await api(`/templates/${summary.templateId}?includeEndpointBoundTemplates=true`);
    console.log('TEMPLATE', JSON.stringify(templateSummary(template), null, 2));
  }
}

async function freezeEndpoint() {
  const endpoint = await findEndpoint();
  console.log('Before freeze:', JSON.stringify(endpointSummary(endpoint), null, 2));
  const updated = await updateEndpoint(endpoint, { workersMin: 0, workersMax: 0 });
  console.log('After freeze:', JSON.stringify(endpointSummary(updated), null, 2));
  if (updated.workersMin !== 0 || updated.workersMax !== 0) {
    throw new Error('Endpoint freeze verification failed');
  }
}

function testConfig() {
  return {
    workersMin: 0,
    workersMax: 1,
    gpuCount: 1,
    gpuTypeIds: control.gpuTypeIds || [
      'NVIDIA RTX A4000',
      'NVIDIA RTX A4500',
      'NVIDIA RTX 4000 Ada Generation',
    ],
    allowedCudaVersions: control.allowedCudaVersions || [
      '11.8', '12.0', '12.1', '12.2', '12.3', '12.4',
      '12.5', '12.6', '12.7', '12.8', '12.9', '13.0',
    ],
    idleTimeout: Number.isInteger(control.idleTimeout) ? control.idleTimeout : 5,
  };
}

async function configureEndpoint() {
  const endpoint = await findEndpoint();
  const payload = {
    ...testConfig(),
    workersMin: Number.isInteger(control.workersMin) ? control.workersMin : 0,
    workersMax: Number.isInteger(control.workersMax) ? control.workersMax : 1,
  };
  const updated = await updateEndpoint(endpoint, payload);
  console.log('Updated endpoint:', JSON.stringify(endpointSummary(updated), null, 2));
}

async function cancelJob(endpointId, jobId) {
  if (!jobId) return;
  const response = await fetch(`${SERVERLESS_BASE}/${endpointId}/cancel/${jobId}`, {
    method: 'POST',
    headers,
  });
  const text = await response.text();
  if (!response.ok && response.status !== 404) {
    console.warn(`Cancel failed (${response.status}): ${text}`);
  } else {
    console.log(`Cancel response: ${text || response.status}`);
  }
}

async function healthcheckOnce() {
  let endpoint = await findEndpoint();
  let jobId = null;
  let completed = false;
  const timeoutMs = Number.isInteger(control.pollTimeoutMs) ? control.pollTimeoutMs : 240000;

  try {
    endpoint = await updateEndpoint(endpoint, testConfig());
    console.log('Test configuration:', JSON.stringify(endpointSummary(endpoint), null, 2));

    const submit = await fetch(`${SERVERLESS_BASE}/${endpoint.id}/run`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ input: { healthcheck: true }, ttl: Math.ceil(timeoutMs / 1000) + 60 }),
    });
    const submitText = await submit.text();
    const job = submitText ? JSON.parse(submitText) : null;
    if (!submit.ok) throw new Error(`Healthcheck submit failed (${submit.status}): ${submitText}`);
    jobId = job?.id;
    console.log('Healthcheck job:', JSON.stringify({ id: jobId, status: job?.status }, null, 2));

    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const response = await fetch(`${SERVERLESS_BASE}/${endpoint.id}/status/${jobId}`, { headers });
      const text = await response.text();
      const status = text ? JSON.parse(text) : null;
      if (!response.ok) throw new Error(`Healthcheck status failed (${response.status}): ${text}`);
      console.log('Healthcheck status:', status.status);
      if (['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(status.status)) {
        console.log('Healthcheck result:', JSON.stringify(status, null, 2));
        completed = status.status === 'COMPLETED';
        if (!completed) throw new Error(`Healthcheck ended with ${status.status}`);
        return;
      }
    }
    throw new Error(`Healthcheck exceeded ${timeoutMs}ms`);
  } finally {
    if (!completed && jobId) {
      await cancelJob(endpoint.id, jobId);
    }
    try {
      const current = await findEndpoint();
      const frozen = await updateEndpoint(current, { workersMin: 0, workersMax: 0 });
      console.log('Cleanup freeze:', JSON.stringify(endpointSummary(frozen), null, 2));
    } catch (cleanupError) {
      console.error('CRITICAL: endpoint cleanup failed:', cleanupError.message);
      process.exitCode = 1;
    }
  }
}

switch (control.action) {
  case 'inspect': await inspectEndpoint(); break;
  case 'freeze': await freezeEndpoint(); break;
  case 'configure': await configureEndpoint(); break;
  case 'healthcheck_once': await healthcheckOnce(); break;
  default: throw new Error(`Unsupported DGBN control action: ${control.action}`);
}
