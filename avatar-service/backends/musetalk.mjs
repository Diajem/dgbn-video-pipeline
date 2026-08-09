import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const REQUIRED_MODELS = [
  'models/musetalkV15/unet.pth','models/musetalkV15/musetalk.json','models/syncnet/latentsync_syncnet.pt','models/dwpose/dw-ll_ucoco_384.pth','models/face-parse-bisent/79999_iter.pth','models/face-parse-bisent/resnet18-5c106cde.pth','models/sd-vae/config.json','models/sd-vae/diffusion_pytorch_model.bin','models/whisper/config.json','models/whisper/pytorch_model.bin','models/whisper/preprocessor_config.json'
];
const yamlQuote=(v)=>`"${String(v).replace(/\\/g,'/').replace(/"/g,'\\"')}"`;
export const getMuseTalkPaths=()=>({home:process.env.MUSE_TALK_HOME?path.resolve(process.env.MUSE_TALK_HOME):null,python:process.env.MUSE_TALK_PYTHON||'python',ffmpegDir:process.env.MUSE_TALK_FFMPEG||''});
export const museTalkPreflight=()=>{
  const {home,python,ffmpegDir}=getMuseTalkPaths(); const errors=[]; const warnings=[];
  if(!home) errors.push('MUSE_TALK_HOME is not set.');
  if(home&&!fs.existsSync(home)) errors.push(`MuseTalk home does not exist: ${home}`);
  if(home&&fs.existsSync(home)) for(const rel of REQUIRED_MODELS) if(!fs.existsSync(path.join(home,rel))) errors.push(`Missing MuseTalk model: ${rel}`);
  const py=spawnSync(python,['-c','import sys; print(sys.version.split()[0])'],{encoding:'utf8'});
  if(py.status!==0) errors.push(`MuseTalk Python failed: ${python}`); else if(!py.stdout.trim().startsWith('3.10.')) warnings.push(`MuseTalk recommends Python 3.10; detected ${py.stdout.trim()}.`);
  const torch=spawnSync(python,['-c','import torch; print(torch.__version__); print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else "NO_CUDA")'],{encoding:'utf8'});
  const lines=torch.status===0?torch.stdout.trim().split(/\r?\n/):[];
  if(torch.status!==0) warnings.push('PyTorch/CUDA check failed in the selected MuseTalk Python environment.');
  if(lines[1]==='False') errors.push('CUDA is not available in the selected MuseTalk Python environment.');
  const ffmpegExe=ffmpegDir?path.join(ffmpegDir,process.platform==='win32'?'ffmpeg.exe':'ffmpeg'):'ffmpeg';
  const ff=spawnSync(ffmpegExe,['-version'],{encoding:'utf8'}); if(ff.status!==0) errors.push(`FFmpeg is not available: ${ffmpegExe}`);
  return {ok:errors.length===0,home,python,ffmpeg:ffmpegExe,pythonVersion:py.status===0?py.stdout.trim():null,torchVersion:lines[0]||null,cudaAvailable:lines[1]==='True',cudaDevice:lines[2]||null,errors,warnings};
};
export const writeNormalInferenceConfig=({videoPath,audioPath,configPath})=>{const body=['task_0:',`  video_path: ${yamlQuote(videoPath)}`,`  audio_path: ${yamlQuote(audioPath)}`,''].join('\n');fs.mkdirSync(path.dirname(configPath),{recursive:true});fs.writeFileSync(configPath,body);return configPath;};
export const runMuseTalkV15=({videoPath,audioPath,outputDir,configPath})=>{
  const preflight=museTalkPreflight(); if(!preflight.ok){const e=new Error(`MuseTalk preflight failed:\n- ${preflight.errors.join('\n- ')}`);e.preflight=preflight;throw e;}
  const {home,python,ffmpegDir}=getMuseTalkPaths();writeNormalInferenceConfig({videoPath,audioPath,configPath});fs.mkdirSync(outputDir,{recursive:true});
  const args=['-m','scripts.inference','--inference_config',configPath,'--result_dir',outputDir,'--unet_model_path',path.join(home,'models','musetalkV15','unet.pth'),'--unet_config',path.join(home,'models','musetalkV15','musetalk.json'),'--version','v15'];
  if(ffmpegDir) args.push('--ffmpeg_path',ffmpegDir);
  const r=spawnSync(python,args,{cwd:home,stdio:'inherit'});if(r.status!==0)throw new Error(`MuseTalk inference exited with status ${r.status}`);return{outputDir,configPath};
};
