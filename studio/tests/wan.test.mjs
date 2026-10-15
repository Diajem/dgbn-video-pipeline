import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'wan-'));
process.env.STUDIO_SECRETS_FILE = path.join(dir, 'secrets.json');
delete process.env.WAN_3_API_KEY; delete process.env.DASHSCOPE_API_KEY; delete process.env.WAN_3_WORKSPACE_ID;
const {wanStatus, saveWan, clearWanKey, checkWan} = await import('../lib/wan.mjs');

const KEY = 'sk-ws-TESTKEY1234567890abcdef';
const res = status => ({status});

test('status starts empty and never contains a key', async () => {
  const s = await wanStatus();
  assert.equal(s.keySaved, false);
  assert.equal(s.region, 'eu-central-1');
});

test('rejects things that are not an Alibaba key or workspace id', async () => {
  await assert.rejects(saveWan({apiKey: 'hello'}), /does not look like/);
  await assert.rejects(saveWan({workspaceId: 'abc'}), /ws-/);
  await assert.rejects(saveWan({region: 'mars-1'}), /region/);
});

test('check needs a key and a workspace first', async () => {
  await assert.rejects(checkWan(async () => res(404)), /No Wan key/);
  await saveWan({apiKey: KEY});
  await assert.rejects(checkWan(async () => res(404)), /workspace/);
});

test('saves key and workspace, status hides the key, file is private', async () => {
  await saveWan({workspaceId: 'ws-p622q5ojsvpqbvxl', region: 'eu-central-1'});
  const s = await wanStatus();
  assert.equal(s.keySaved, true);
  assert.equal(s.workspaceId, 'ws-p622q5ojsvpqbvxl');
  assert.ok(!JSON.stringify(s).includes(KEY));
  if (process.platform !== 'win32') assert.equal((await fs.stat(process.env.STUDIO_SECRETS_FILE)).mode & 0o077, 0);
});

test('check: accepted key (task not found) is OK, calls the workspace address with the bearer key and generates nothing', async () => {
  let seen;
  const out = await checkWan(async (url, opts) => { seen = {url, opts}; return res(404); });
  assert.equal(out.ok, true);
  assert.equal(seen.url, 'https://ws-p622q5ojsvpqbvxl.eu-central-1.maas.aliyuncs.com/api/v1/tasks/studio-connection-check');
  assert.equal(seen.opts.headers.Authorization, 'Bearer ' + KEY);
  assert.equal(seen.opts.method, undefined); // a GET, never a generation request
});

test('check: refused key, server error, and no network give clear messages', async () => {
  await assert.rejects(checkWan(async () => res(401)), /refused the key/);
  await assert.rejects(checkWan(async () => res(403)), /refused the key/);
  await assert.rejects(checkWan(async () => res(503)), /problem/);
  await assert.rejects(checkWan(async () => { throw new Error('offline'); }), /Could not reach/);
});

test('clearing removes the key but keeps the workspace', async () => {
  await clearWanKey();
  const s = await wanStatus();
  assert.equal(s.keySaved, false);
  assert.equal(s.workspaceId, 'ws-p622q5ojsvpqbvxl');
});
