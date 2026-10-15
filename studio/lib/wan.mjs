// Wan motion clips (Alibaba Cloud Model Studio). The API key lives only on this computer (studio/data/secrets.json, git-ignored).
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SECRETS = process.env.STUDIO_SECRETS_FILE || path.join(HERE, '..', 'data', 'secrets.json');
export const REGION_HOSTS = {
  'eu-central-1': 'eu-central-1.maas.aliyuncs.com',
  'ap-southeast-1': 'ap-southeast-1.maas.aliyuncs.com',
  'us-east-1': 'us-east-1.maas.aliyuncs.com',
  'ap-northeast-1': 'ap-northeast-1.maas.aliyuncs.com',
  'cn-hongkong': 'cn-hongkong.maas.aliyuncs.com',
  'cn-beijing': 'cn-beijing.maas.aliyuncs.com',
};

async function readSecrets() {
  try { return JSON.parse(await fs.readFile(SECRETS, 'utf8')); } catch { return {}; }
}
async function writeSecrets(secrets) {
  await fs.mkdir(path.dirname(SECRETS), {recursive: true});
  await fs.writeFile(SECRETS, JSON.stringify(secrets), {mode: 0o600});
}

// Never returns the key itself.
export async function wanStatus() {
  const s = await readSecrets();
  return {
    keySaved: !!(s.wanApiKey || process.env.WAN_3_API_KEY || process.env.DASHSCOPE_API_KEY),
    workspaceId: s.wanWorkspaceId || process.env.WAN_3_WORKSPACE_ID || '',
    region: s.wanRegion || process.env.WAN_3_REGION || 'eu-central-1',
    regions: Object.keys(REGION_HOSTS),
  };
}

export async function saveWan({apiKey, workspaceId, region}) {
  const s = await readSecrets();
  if (apiKey !== undefined && String(apiKey).trim() !== '') {
    const value = String(apiKey).trim();
    if (!/^sk-[A-Za-z0-9_\-.:]{16,200}$/.test(value)) throw Object.assign(new Error('That does not look like an Alibaba API key. It starts with sk-'), {status: 400});
    s.wanApiKey = value;
  }
  if (workspaceId !== undefined && String(workspaceId).trim() !== '') {
    const ws = String(workspaceId).trim();
    if (!/^ws-[a-z0-9]{8,40}$/.test(ws)) throw Object.assign(new Error('The workspace ID starts with ws- (letters and numbers only)'), {status: 400});
    s.wanWorkspaceId = ws;
  }
  if (region !== undefined && String(region).trim() !== '') {
    if (!REGION_HOSTS[region]) throw Object.assign(new Error('Unknown Alibaba region'), {status: 400});
    s.wanRegion = region;
  }
  await writeSecrets(s);
}

export async function clearWanKey() {
  const s = await readSecrets();
  delete s.wanApiKey;
  await writeSecrets(s);
}

export async function wanConfig() {
  const s = await readSecrets();
  return {
    apiKey: (s.wanApiKey || process.env.WAN_3_API_KEY || process.env.DASHSCOPE_API_KEY || '').trim(),
    workspaceId: (s.wanWorkspaceId || process.env.WAN_3_WORKSPACE_ID || '').trim(),
    region: s.wanRegion || process.env.WAN_3_REGION || 'eu-central-1',
  };
}

// Free check: asks Wan about a task that does not exist. A wrong key is refused (401/403); a right key gets "task not found".
// No video is generated, so nothing is charged.
export async function checkWan(fetchImpl = fetch) {
  const {apiKey, workspaceId, region} = await wanConfig();
  if (!apiKey) throw Object.assign(new Error('No Wan key saved yet'), {status: 400});
  if (!workspaceId) throw Object.assign(new Error('Add the workspace ID first'), {status: 400});
  const host = REGION_HOSTS[region];
  if (!host) throw Object.assign(new Error('Unknown Alibaba region'), {status: 400});
  let res;
  try {
    res = await fetchImpl(`https://${workspaceId}.${host}/api/v1/tasks/studio-connection-check`, {headers: {Authorization: `Bearer ${apiKey}`}, signal: AbortSignal.timeout(20_000)});
  } catch {
    throw Object.assign(new Error('Could not reach Alibaba. Check the internet connection and the workspace ID.'), {status: 502});
  }
  if (res.status === 401 || res.status === 403) throw Object.assign(new Error('Alibaba refused the key. Check it was copied whole, and that it belongs to this workspace.'), {status: 400});
  if (res.status >= 500) throw Object.assign(new Error('Alibaba had a problem (HTTP ' + res.status + '). Try again shortly.'), {status: 502});
  // Anything else (typically 404, task not found) means the key was accepted.
  return {ok: true, message: 'Connected. Alibaba accepted the key. Nothing was generated and nothing was charged.'};
}
