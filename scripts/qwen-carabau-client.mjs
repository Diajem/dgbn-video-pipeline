import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const SUPPORTED_REGIONS = new Set(['ap-southeast-1','cn-beijing']);
const region = process.env.QWEN_TTS_REGION || process.env.QWEN_REGION || 'ap-southeast-1';
if (!SUPPORTED_REGIONS.has(region)) {
  throw new Error('Qwen voice cloning/TTS requires QWEN_TTS_REGION=ap-southeast-1 or cn-beijing');
}
const apiKey = process.env.QWEN_TTS_API_KEY || process.env.QWEN_API_KEY || process.env.DASHSCOPE_API_KEY;
const workspaceId = process.env.QWEN_TTS_WORKSPACE_ID || process.env.QWEN_WORKSPACE_ID;
if (!apiKey) throw new Error('Missing QWEN_TTS_API_KEY/QWEN_API_KEY');
if (!workspaceId) throw new Error('Missing QWEN_TTS_WORKSPACE_ID/QWEN_WORKSPACE_ID');

const host = region === 'cn-beijing'
  ? `${workspaceId}.cn-beijing.maas.aliyuncs.com`
  : `${workspaceId}.ap-southeast-1.maas.aliyuncs.com`;
const base = `https://${host}/api/v1`;
const targetModel = process.env.QWEN_TTS_MODEL || 'qwen3-tts-vc-2026-01-22';

async function postJson(url, body) {
  const response = await fetch(url, {
    method:'POST',
    headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify(body),
  });
  const json = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(`Qwen TTS HTTP ${response.status}: ${json.message || json.code || response.statusText}`);
  return json;
}

function mimeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.wav') return 'audio/wav';
  if (ext === '.m4a' || ext === '.mp4') return 'audio/mp4';
  return 'audio/mpeg';
}

export async function createVoice({referencePath, preferredName='carabau', transcript=null}) {
  const bytes = await fs.readFile(referencePath);
  if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('Reference audio must be non-empty and <=10 MB');
  const audio = {data:`data:${mimeFor(referencePath)};base64,${bytes.toString('base64')}`};
  const input = {
    action:'create',
    target_model:targetModel,
    preferred_name:preferredName,
    audio,
    ...(transcript ? {text:transcript} : {}),
  };
  const result = await postJson(`${base}/services/audio/tts/customization`, {
    model:'qwen-voice-enrollment',
    input,
  });
  const voice = result.output?.voice;
  if (!voice) throw new Error('Voice enrollment returned no voice identifier');
  if (result.output?.fallback_mode) {
    console.error(JSON.stringify({event:'voice-enrollment-warning',reason:result.output?.fallback_reason || 'fallback_mode'}));
  }
  return {voice, targetModel, requestId:result.request_id || null};
}

function chunkText(text, maxChars=1400) {
  const clean = String(text || '').replace(/\r/g,'').trim();
  if (!clean) return [];
  const paragraphs = clean.split(/\n{2,}/).map(x=>x.trim()).filter(Boolean);
  const chunks = [];
  let current = '';
  const flush = () => { if (current.trim()) chunks.push(current.trim()); current=''; };
  for (const p of paragraphs) {
    const sentences = p.match(/[^.!?]+[.!?]+(?:["'’”)]*)|[^.!?]+$/g) || [p];
    for (const sentence of sentences) {
      const candidate = current ? `${current} ${sentence.trim()}` : sentence.trim();
      if (candidate.length <= maxChars) current = candidate;
      else {
        flush();
        if (sentence.length <= maxChars) current = sentence.trim();
        else {
          for (let i=0;i<sentence.length;i+=maxChars) chunks.push(sentence.slice(i,i+maxChars).trim());
        }
      }
    }
    flush();
  }
  return chunks;
}

async function synthesizeChunk({voice,text,outputPath}) {
  const result = await postJson(`${base}/services/audio/tts/SpeechSynthesizer`, {
    model:targetModel,
    input:{text,voice,format:'wav',sample_rate:24000},
  });
  const url = result.output?.audio?.url;
  if (!url) throw new Error('Qwen TTS returned no output.audio.url');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download synthesized audio: ${response.status}`);
  await fs.writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
  return {requestId:result.request_id || null,urlReceived:true};
}

export async function synthesizeNarration({voice,text,outputPath}) {
  const chunks = chunkText(text);
  if (!chunks.length) throw new Error('Narration text is empty');
  const dir = path.join(path.dirname(outputPath), '.qwen-tts-parts');
  await fs.mkdir(dir,{recursive:true});
  const parts = [];
  for (let i=0;i<chunks.length;i+=1) {
    const part = path.join(dir,`part-${String(i+1).padStart(3,'0')}.wav`);
    await synthesizeChunk({voice,text:chunks[i],outputPath:part});
    parts.push(part);
    console.log(JSON.stringify({event:'qwen-tts-part',part:i+1,total:chunks.length,characters:chunks[i].length}));
  }
  if (parts.length === 1) {
    await fs.copyFile(parts[0],outputPath);
  } else {
    const list = path.join(dir,'concat.txt');
    await fs.writeFile(list,parts.map(p=>`file '${path.resolve(p).replace(/'/g,"'\\''")}'`).join('\n')+'\n');
    execFileSync('ffmpeg',['-y','-f','concat','-safe','0','-i',list,'-c','copy',outputPath],{stdio:'inherit'});
  }
  return {outputPath,parts:parts.length,characters:text.length};
}

async function main() {
  const [command,...args] = process.argv.slice(2);
  if (command === 'enroll-and-synthesize') {
    const [referencePath,textPath,outputPath='renders/carabau-narration.wav',preferredName='carabau'] = args;
    if (!referencePath || !textPath) throw new Error('Usage: enroll-and-synthesize <reference-audio> <text-file> [output.wav] [preferred-name]');
    const text = await fs.readFile(textPath,'utf8');
    await fs.mkdir(path.dirname(outputPath),{recursive:true});
    const enrollment = await createVoice({referencePath,preferredName});
    console.log(JSON.stringify({event:'qwen-voice-enrolled',voice:enrollment.voice,targetModel:enrollment.targetModel}));
    const result = await synthesizeNarration({voice:enrollment.voice,text,outputPath});
    console.log(JSON.stringify({event:'qwen-narration-ready',...result}));
    return;
  }
  throw new Error('Supported command: enroll-and-synthesize');
}

if (import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((error)=>{console.error(error.stack || error.message);process.exitCode=1;});
}
