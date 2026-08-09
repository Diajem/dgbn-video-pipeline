import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packsRoot = process.env.PRESENTER_PACKS_ROOT || path.resolve(root, '..', 'presenter-packs');
const selections = JSON.parse(fs.readFileSync(path.join(root,'config','presenter-selections.json'),'utf8'));
const runtimeDir = path.join(root,'runtime-assets','presenters');
const profilesDir = path.join(root,'presenters','profiles');
fs.mkdirSync(runtimeDir,{recursive:true});
fs.mkdirSync(profilesDir,{recursive:true});

for (const [id,cfg] of Object.entries(selections)) {
  const sourceRoot = path.join(packsRoot, cfg.sourceFolder);
  const outDir = path.join(runtimeDir,id);
  fs.mkdirSync(outDir,{recursive:true});
  for (const rel of [cfg.master,...(cfg.supports||[])]) {
    const src=path.join(sourceRoot,rel);
    if(!fs.existsSync(src)) throw new Error(`Missing presenter asset: ${src}`);
    fs.copyFileSync(src,path.join(outDir,path.basename(rel)));
  }
  const voiceSrc=path.join(sourceRoot,cfg.voice);
  if(!fs.existsSync(voiceSrc)) throw new Error(`Missing voice reference: ${voiceSrc}`);
  fs.copyFileSync(voiceSrc,path.join(outDir,'reference.wav'));
  const profile={
    id,displayName:cfg.displayName,legalName:cfg.legalName,role:cfg.role,channel:cfg.channel,motionStyle:cfg.motionStyle,
    avatarBackend:{preferred:'musetalk-v1.5',benchmarkOrder:['MuseTalk 1.5','JoyVASA+MuseTalk','SoulX-FlashHead']},
    assets:{master:path.relative(root,path.join(outDir,path.basename(cfg.master))),supports:(cfg.supports||[]).map(rel=>path.relative(root,path.join(outDir,path.basename(rel)))),voiceReference:path.relative(root,path.join(outDir,'reference.wav')},
    curation:{rejected:cfg.rejected||[],notes:cfg.notes},
    status:{imagesCurated:true,voiceReady:true,avatarBenchmarked:false,remotionSlotTested:false}
  };
  fs.writeFileSync(path.join(outDir,'profile.json'),JSON.stringify(profile,null,2)+'\n');
  fs.writeFileSync(path.join(profilesDir,`${id}.json`),JSON.stringify(profile,null,2)+'\n');
}
console.log(`Prepared ${Object.keys(selections).length} presenter profiles from ${packsRoot}.`);
