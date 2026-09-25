import fs from 'node:fs';

const file = process.argv[2] || 'jobs/samples/dgbn-faceless-v1.json';
const job = JSON.parse(fs.readFileSync(file, 'utf8'));
const fail = message => { throw new Error('DGBN faceless validation failed: ' + message); };
if (job.version !== 'DGBN_FACELESS_V1' || job.brand !== 'DGBN') fail('wrong job version or brand');
if (job.qualityPolicy !== 'PRODUCTION') fail('only production jobs may be rendered by this workflow');
if (!job.storyId || !job.sourceScriptArtifactId || !job.narrationArtifactId) fail('approved source lineage is missing');
if (!job.script || !job.headline || !job.audio?.voiceoverSrc || job.audio.voiceoverStatus !== 'APPROVED') fail('approved script and narration are required');
if (!Array.isArray(job.visuals) || !job.visuals.length || job.visuals.length > 12) fail('one to twelve reviewed visuals are required');
if (job.presenterSpine || job.heygenJob) fail('a faceless job cannot contain a presenter or HeyGen job');
for (const visual of job.visuals) {
  if (!visual.assetId || !visual.src || !['image','video'].includes(visual.kind)) fail('visual is missing its reviewed asset and type');
  if (!['AI-GENERATED ILLUSTRATION','ILLUSTRATIVE FOOTAGE','EDITORIAL IMAGE'].includes(visual.label)) fail('visual disclosure is missing');
}
if (job.staged && !(Number(job.durationSec) > 3 && Number(job.durationSec) < 600)) fail('staged narration duration is invalid');
console.log('DGBN_FACELESS_V1 validation passed:', file);
