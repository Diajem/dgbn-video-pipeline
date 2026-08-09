import {readFile} from 'node:fs/promises';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/validate-manifest.mjs <manifest.json>');
  process.exit(2);
}

const manifest = JSON.parse(await readFile(file, 'utf8'));
const errors = [];

for (const key of ['jobId', 'brand', 'jobType', 'createdAt', 'approval', 'presenter', 'stories']) {
  if (manifest[key] === undefined || manifest[key] === null) errors.push(`Missing required field: ${key}`);
}
if (!['DGBN', 'DSN'].includes(manifest.brand)) errors.push('brand must be DGBN or DSN');
if (!Array.isArray(manifest.stories) || manifest.stories.length === 0) errors.push('stories must contain at least one story');

for (const [index, story] of (manifest.stories ?? []).entries()) {
  for (const key of ['storyId', 'headline', 'verification', 'narration', 'lowerThird', 'visuals']) {
    if (story[key] === undefined || story[key] === null) errors.push(`stories[${index}] missing ${key}`);
  }
  if (!Array.isArray(story.verification?.sources) || story.verification.sources.length === 0) {
    errors.push(`stories[${index}] must include at least one source`);
  }
}

if (errors.length) {
  console.error('Manifest validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const sensitive = manifest.stories.filter((s) => s.verification?.sensitive).length;
const verified = manifest.stories.filter((s) => s.verification?.status === 'verified').length;
console.log(`OK ${manifest.jobId}: ${manifest.stories.length} stories, ${verified} verified, ${sensitive} sensitive.`);
