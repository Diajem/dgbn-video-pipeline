import fs from 'node:fs';

const file = process.argv[2] || 'jobs/samples/dgbn-faceless-v1.json';
const job = JSON.parse(fs.readFileSync(file, 'utf8'));
const fail = message => { throw new Error('DGBN faceless validation failed: ' + message); };

const LABELS = ['AI-GENERATED ILLUSTRATION', 'ILLUSTRATIVE FOOTAGE', 'EDITORIAL IMAGE', 'ILLUSTRATIVE IMAGE', 'FILE FOOTAGE', 'ARCHIVE', 'GRAPHIC'];
const AI_LABEL = 'AI-GENERATED ILLUSTRATION';
// Drafts are only accepted when the local Studio explicitly allows them. CI never sets this.
// Studio shorts and long videos may carry unresolved rights (recorded in the sources text); website-format and CI jobs may not.
const relaxedRights = ['short', 'long'].includes(job.studio?.format);
const draftAllowed = process.env.ALLOW_DRAFT === '1' && job.draft === true && job.qualityPolicy === 'DRAFT';

if (job.version !== 'DGBN_FACELESS_V1' || !['DGBN', 'DSN'].includes(job.brand)) fail('wrong job version or brand');
if (job.qualityPolicy !== 'PRODUCTION' && !draftAllowed) fail('only production jobs may be rendered by this workflow');
if (!job.storyId || !job.sourceScriptArtifactId || !job.narrationArtifactId) fail('approved source lineage is missing');
if (!job.script || !job.headline || !job.audio?.voiceoverSrc) fail('script and narration are required');
if (job.audio.voiceoverStatus !== 'APPROVED' && !draftAllowed) fail('approved narration is required');
if (!Array.isArray(job.visuals) || !job.visuals.length || job.visuals.length > 40) fail('one to forty reviewed visuals are required');
if (job.presenterSpine || job.heygenJob) fail('a faceless job cannot contain a presenter or HeyGen job');
for (const visual of job.visuals) {
  if (!visual.assetId || !visual.src || !['image', 'video'].includes(visual.kind)) fail('visual is missing its reviewed asset and type');
  if (!LABELS.includes(visual.label)) fail('visual disclosure is missing');
  if (job.studio) {
    const ai = visual.label === AI_LABEL;
    if (ai && visual.rights !== 'ai_labelled') fail('AI-generated visual ' + visual.assetId + ' must have rights status ai_labelled');
    if (!ai && visual.rights === 'ai_labelled') fail('visual ' + visual.assetId + ' is marked ai_labelled but is not labelled as AI-generated');
    if (!draftAllowed && !relaxedRights && !['cleared', 'ai_labelled'].includes(visual.rights)) fail('visual ' + visual.assetId + ' has unresolved rights (' + visual.rights + ')');
    if (visual.rights === 'cleared' && !String(visual.rightsNote || '').trim()) fail('cleared visual ' + visual.assetId + ' has no rights note');
  }
}
if (job.visuals.some(v => v.startSec !== undefined)) {
  let last = 0;
  for (const v of job.visuals) {
    if (!Number.isFinite(v.startSec) || !Number.isFinite(v.endSec) || v.endSec <= v.startSec || v.startSec < last - 0.01) fail('visual timing is invalid');
    last = v.endSec;
  }
}
if (job.staged && !(Number(job.durationSec) > 3 && Number(job.durationSec) < 600)) fail('staged narration duration is invalid');
console.log('DGBN_FACELESS_V1 validation passed:', file);
