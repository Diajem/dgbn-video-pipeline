import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {runMuseTalkV15} from '../avatar-service/backends/musetalk.mjs';

const root=process.cwd();
const presenterId=process.argv[2]||'peet';
const seconds=process.argv[3]||process.env.MUSE_TALK_BENCHMARK_SECONDS||'12';
const prep=spawnSync(process.execPath,[path.join(root,'scripts','prepare-musetalk-source.mjs'),presenterId,String(seconds)],{cwd:root,stdio:'inherit'});if(prep.status!==0)process.exit(prep.status||1);
const workDir=path.join(root,'avatar-service','work',presenterId);
const input=JSON.parse(fs.readFileSync(path.join(workDir,'musetalk-benchmark-input.json'),'utf8'));
const source=path.join(root,input.sourceVideo),audio=path.join(root,input.benchmarkAudio),config=path.join(workDir,'musetalk-v15.yaml'),results=path.join(workDir,'musetalk-results');
try{runMuseTalkV15({videoPath:source,audioPath:audio,outputDir:results,configPath:config});console.log(`MuseTalk completed under ${path.relative(root,results)}`);}catch(e){console.error(e.message);if(e.preflight)console.error(JSON.stringify(e.preflight,null,2));process.exit(2);}
