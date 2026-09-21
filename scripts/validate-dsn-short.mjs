import fs from 'node:fs';

const file = process.argv[2] || 'jobs/samples/dsn-short-master-v1.json';
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
const officialDsnLogo = 'video-studio/remotion/public/brand/dsn-logo-official.jpg';
const fail = (msg) => { throw new Error('DSN short validation failed: ' + msg); };

if (cfg.version !== 'DSN_SHORT_MASTER_V1') fail('wrong or missing version');
if (!['AVATAR','VOICEOVER_BROLL','PETER_REAL'].includes(cfg.presentationMode)) {
  fail('presentationMode must be AVATAR, VOICEOVER_BROLL or PETER_REAL');
}
if (!Array.isArray(cfg.scenes) || cfg.scenes.length < 3) fail('at least three scenes are required');
if (cfg.outroHoldSec !== undefined && cfg.outroHoldSec < 0.75) {
  fail('outroHoldSec must be at least 0.75 seconds to protect the final spoken words');
}

const production = cfg.qualityPolicy === 'PRODUCTION';
if (production && !fs.existsSync(officialDsnLogo)) {
  fail('official DSN logo asset is missing: ' + officialDsnLogo);
}
if (production && cfg.presentationMode === 'AVATAR' && cfg.presenterSpine?.required && !cfg.presenterSpine?.src) {
  fail('AVATAR requires presenterSpine.src when presenter spine is required');
}
if (production && cfg.presentationMode === 'AVATAR' && cfg.presenterSpine?.required && cfg.presenterSpine?.continuousAudio !== true) {
  fail('AVATAR presenter spine must keep continuousAudio=true');
}
if (production && cfg.presentationMode === 'VOICEOVER_BROLL' && !cfg.audio?.voiceoverSrc) {
  fail('VOICEOVER_BROLL requires approved audio.voiceoverSrc');
}
if (production && cfg.presentationMode === 'PETER_REAL' && !cfg.presenters?.peter?.src) {
  fail('PETER_REAL requires presenters.peter.src with real-camera media');
}

for (const scene of cfg.scenes) {
  const presenter = scene.presenter || {};
  if (cfg.presentationMode === 'AVATAR' && cfg.presenterSpine?.continuousAudio && presenter.src && presenter.src !== cfg.presenterSpine.src) {
    fail('AVATAR scene ' + scene.id + ' must use the continuous presenter spine rather than a separate presenter clip');
  }
  if (cfg.presentationMode === 'VOICEOVER_BROLL' && presenter.mode && presenter.mode !== 'off') {
    fail('VOICEOVER_BROLL cannot show presenter in scene ' + scene.id);
  }
  if (cfg.presentationMode === 'PETER_REAL' && presenter.mode && presenter.mode !== 'off' && presenter.id !== 'peter') {
    fail('PETER_REAL may only show Peter in scene ' + scene.id);
  }
  if (production && scene.type === 'media' && !scene.media?.src) {
    fail('production media scene ' + scene.id + ' is missing media.src');
  }
  if (production && scene.type === 'presenter_split' && !scene.media?.src) {
    fail('production presenter_split scene ' + scene.id + ' is missing media.src');
  }
}

if (production && cfg.audio?.voiceoverStatus && cfg.audio.voiceoverStatus !== 'APPROVED') {
  fail('voiceoverStatus must be APPROVED for production');
}

console.log('DSN_SHORT_MASTER_V1 validation passed:', file);
