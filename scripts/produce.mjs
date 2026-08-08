import {readFile, mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';

const manifestPath = process.argv[2];
const shouldRender = process.argv.includes('--render');

if (!manifestPath) {
  console.error('Usage: node scripts/produce.mjs <manifest.json> [--render]');
  process.exit(2);
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));

if (manifest.approval?.status === 'blocked') {
  console.error(`Job ${manifest.jobId} is blocked and cannot be rendered.`);
  process.exit(1);
}

const compositionByType = {
  'bulletin': 'DGBNBulletin16x9',
  'full-report': 'DGBNBulletin16x9',
  'documentary': 'DGBNBulletin16x9',
  'podcast': 'DGBNBulletin16x9',
  'breaking-news': 'DGBNNewsFlash9x16',
  'news-flash': 'DGBNNewsFlash9x16',
  'news-card': 'DGBNNewsCard9x16'
};

const composition = compositionByType[manifest.jobType];
if (!composition) {
  console.error(`No Phase 1 composition mapping exists for jobType=${manifest.jobType}`);
  process.exit(1);
}

const sensitiveStories = (manifest.stories ?? []).filter((story) => story.verification?.sensitive);
if (sensitiveStories.length && manifest.approval?.status !== 'approved') {
  console.warn(`WARNING: ${sensitiveStories.length} sensitive story/stories remain unapproved. Render output must stay draft-only.`);
}

const extension = '.mp4';
const outputPath = path.join('renders', `${manifest.jobId}${extension}`);
const props = JSON.stringify({job: manifest, storyIndex: 0});

console.log(JSON.stringify({
  jobId: manifest.jobId,
  jobType: manifest.jobType,
  composition,
  approval: manifest.approval,
  presenterMode: manifest.presenter?.mode,
  outputPath,
  renderRequested: shouldRender
}, null, 2));

if (!shouldRender) {
  console.log('Dry run complete. Re-run with --render after dependencies are installed.');
  process.exit(0);
}

await mkdir('renders', {recursive: true});

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const args = [
  'remotion',
  'render',
  'video-studio/remotion/src/index.jsx',
  composition,
  outputPath,
  '--props',
  props
];

const child = spawn(npx, args, {stdio: 'inherit', shell: false});
child.on('exit', (code) => process.exit(code ?? 1));
child.on('error', (error) => {
  console.error(error);
  process.exit(1);
});
