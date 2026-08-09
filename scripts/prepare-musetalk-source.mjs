import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=process.cwd();
const presenterId=process.argv[2]||'peet';
const requestedSeconds=Number(process.argv[3]||process.env.MUSE_TALK_BENCHMARK_SECONDS||12);
const profile=JSON.parse(fs.readFileSync(path.join(root,'presenters','profiles',`${presenterId}.json`),'utf8'));
const image=path.join(root,profile.assets.master);
const referenceAudio=path.join(root,profile.assets.voiceReference);
const workDir=path.join(root,'avatar-service','work',presenterId);fs.mkdirSync(workDir,{recursive:true});
const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',referenceAudio],{encoding:'utf8'});if(probe.status!==0)throw new Error('ffprobe failed');
const sourceDuration=Number(probe.stdout.trim());const duration=Math.max(2,Math.min(sourceDuration,requestedSeconds));
const benchmarkAudio=path.join(workDir,`${presenterId}-benchmark-${duration}s.wav`);
let r=spawnSync('ffmpeg',['-y','-i',referenceAudio,'-t',String(duration),'-ac','1','-ar','24000','-c:a','pcm_s16le',benchmarkAudio],{encoding:'utf8'});if(r.status!==0){console.error(r.stderr);process.exit(r.status||1);}
const output=path.join(workDir,`${presenterId}-source-25fps-${duration}s.mp4`);
r=spawnSync('ffmpeg',['-y','-loop','1','-framerate','25','-i',image,'-t',String(duration+0.12),'-vf','scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,format=yuv420p','-an','-r','25','-c:v','libx264','-preset','ultrafast','-tune','stillimage','-crf','20',output],{encoding:'utf8'});if(r.status!==0){console.error(r.stderr);process.exit(r.status||1);}
const manifest={presenterId,masterImage:profile.assets.master,originalVoiceReference:profile.assets.voiceReference,sourceDuration,benchmarkDuration:duration,benchmarkAudio:path.relative(root,benchmarkAudio),sourceVideo:path.relative(root,output),fps:25,dimensions:'1280x720'};
fs.writeFileSync(path.join(workDir,'musetalk-benchmark-input.json'),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify(manifest,null,2));
