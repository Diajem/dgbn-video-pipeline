import React from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {BrandedEndCard} from '../components/BrandedEndCard.jsx';

const resolveSrc = (src) => /^(https?:|data:|blob:)/i.test(src || '') ? src : staticFile(String(src || '').replace(/^\//, ''));
const BRAND_ACCENT = {DGBN: '#d7a62a', DSN: '#ff2633'};
const SHOT_SECONDS = 5.5;   // aim for a cut roughly every five to six seconds
const FADE_FRAMES = 10;     // crossfade between shots
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'};

// Split only where a sentence ends and a space follows, so names like football.london or 2.5m stay whole.
const splitNarration = (script) => String(script || '').split(/(?<=[.!?]["”’)]?)\s+/).map(s => s.trim()).filter(Boolean);

// Camera moves for stills: [scale from, scale to, x from %, x to %, y from %, y to %]
const MOVES = [
  [1.04, 1.20, 0, 0, 0, -2],     // slow push in
  [1.22, 1.06, -3, 2, 0, 0],     // pull out while drifting right
  [1.16, 1.16, 5, -5, 0, 0],     // pan left
  [1.16, 1.16, -5, 5, -1, 1],    // pan right
  [1.10, 1.26, 3, 4, 3, 4],      // push into lower right
  [1.10, 1.26, -3, -4, -3, -2],  // push into upper left
];

// Enough shots to keep the picture moving: every visual at least once, stills revisited with a new move.
export const buildShots = (visuals, totalFrames, fps) => {
  if (!visuals.length) return [];
  const wanted = Math.max(visuals.length, Math.round(totalFrames / (SHOT_SECONDS * fps)));
  const shots = [];
  for (let i = 0; i < wanted; i++) {
    const visual = visuals[i % visuals.length];
    const round = Math.floor(i / visuals.length);
    shots.push({visual, move: MOVES[(i + round) % MOVES.length], videoOffset: round * 4});
  }
  return shots.map((shot, i) => ({
    ...shot,
    start: Math.floor(totalFrames * i / shots.length),
    end: Math.ceil(totalFrames * (i + 1) / shots.length),
  }));
};

const Shot = ({shot, fps}) => {
  const frame = useCurrentFrame();   // local to the shot's Sequence
  const length = Math.max(1, shot.end - shot.start);
  const opacity = interpolate(frame, [0, FADE_FRAMES], [shot.start === 0 ? 1 : 0, 1], clamp);
  const [s0, s1, x0, x1, y0, y1] = shot.move;
  const t = interpolate(frame, [0, length + FADE_FRAMES], [0, 1], clamp);
  const eased = t * t * (3 - 2 * t);
  const transform = `translate(${x0 + (x1 - x0) * eased}%, ${y0 + (y1 - y0) * eased}%) scale(${s0 + (s1 - s0) * eased})`;
  const {visual} = shot;
  return <AbsoluteFill style={{opacity}}>
    {visual.kind === 'video'
      ? <OffthreadVideo src={resolveSrc(visual.src)} muted startFrom={Math.round(shot.videoOffset * fps)} style={{width:'100%',height:'100%',objectFit:'cover',transform:`scale(${1.02 + .06 * eased})`}} />
      : <Img src={resolveSrc(visual.src)} style={{width:'100%',height:'100%',objectFit:'cover',transform}} />}
    <AbsoluteFill style={{background:'linear-gradient(180deg,rgba(0,0,0,.45),rgba(0,0,0,.10) 38%,rgba(0,0,0,.88))'}} />
  </AbsoluteFill>;
};

export const DgbnFaceless = ({config}) => {
  const {fps} = useVideoConfig();
  const brand = config.brand === 'DSN' ? 'DSN' : 'DGBN';
  const ACCENT = BRAND_ACCENT[brand];
  const frame = useCurrentFrame();
  const durationSec = Number(config.durationSec || 0);
  const mainFrames = Math.max(1, Math.round(durationSec * fps));
  const visuals = config.visuals || [];
  if (config.qualityPolicy === 'PRODUCTION' && (!config.audio?.voiceoverSrc || !visuals.length)) {
    throw new Error('DGBN production needs approved narration and at least one reviewed visual');
  }
  const shots = buildShots(visuals, mainFrames, fps);
  const current = shots.find(s => frame >= s.start && frame < s.end) || shots[shots.length - 1];

  // Captions follow the narration, weighted by word count.
  const lines = splitNarration(config.script);
  const words = lines.map(line => Math.max(1, line.split(/\s+/).length));
  const totalWords = words.reduce((a, b) => a + b, 0) || 1;
  let cursor = 0;
  const timed = lines.map((text, i) => {
    const start = Math.floor(mainFrames * cursor / totalWords);
    cursor += words[i];
    return {text, start, end: Math.floor(mainFrames * cursor / totalWords)};
  });
  const caption = timed.find(l => frame >= l.start && frame < l.end) || timed[timed.length - 1];
  const captionIn = caption ? interpolate(frame - caption.start, [0, 7], [0, 1], clamp) : 0;
  const headlineIn = interpolate(frame, [0, 14], [0, 1], clamp);
  const progress = Math.min(1, frame / mainFrames);

  return <AbsoluteFill style={{background:'#080807', color:'#fff', fontFamily:'Arial, Helvetica, sans-serif'}}>
    {config.audio?.voiceoverSrc && <Sequence from={0} durationInFrames={mainFrames}><Audio src={resolveSrc(config.audio.voiceoverSrc)} volume={1} /></Sequence>}
    {shots.map((shot, index) => (
      <Sequence key={index} from={shot.start} durationInFrames={Math.max(1, shot.end - shot.start + (index < shots.length - 1 ? FADE_FRAMES : 0))}>
        <Shot shot={shot} fps={fps} />
      </Sequence>
    ))}
    {current?.visual.label?.includes('AI-GENERATED') && <div style={{position:'absolute',top:155,left:64,background:'#101010df',padding:'10px 16px',fontSize:26,fontWeight:800,color:ACCENT}}>AI-GENERATED ILLUSTRATION</div>}
    {current?.visual.label === 'ILLUSTRATIVE FOOTAGE' && frame < mainFrames && <div style={{position:'absolute',top:160,right:64,background:'#101010c0',padding:'6px 12px',fontSize:20,fontWeight:700,letterSpacing:1,color:'#ddd'}}>ILLUSTRATIVE FOOTAGE</div>}
    {current?.visual.credit && frame < mainFrames && <div style={{position:'absolute',bottom:120,left:64,right:64,fontSize:20,color:'#d9d9d9',textShadow:'0 1px 4px #000'}}>{current.visual.kind === 'video' ? 'Video' : 'Photo'}: {current.visual.credit}</div>}
    <div style={{position:'absolute',top:0,left:0,right:0,height:12,background:ACCENT}} />
    <div style={{position:'absolute',top:12,left:0,height:6,width:`${progress * 100}%`,background:'rgba(255,255,255,.75)'}} />
    <div style={{position:'absolute',top:62,left:64,fontWeight:900,letterSpacing:4,fontSize:35,textShadow:'0 2px 8px #000'}}>{brand}</div>
    <div style={{position:'absolute',top:240,left:64,right:64,fontSize:55,fontWeight:900,lineHeight:1.07,textShadow:'0 3px 18px #000',
      opacity:headlineIn,transform:`translateY(${(1 - headlineIn) * 40}px)`}}>{config.headline}</div>
    {frame < mainFrames && caption && <div style={{position:'absolute',bottom:185,left:64,right:64,padding:'28px 30px',borderLeft:`8px solid ${ACCENT}`,
      background:'rgba(6,6,6,.82)',fontSize:39,fontWeight:750,lineHeight:1.22,opacity:captionIn,transform:`translateY(${(1 - captionIn) * 18}px)`}}>{caption.text}</div>}
    <Sequence from={mainFrames + Math.round(.4*fps)} durationInFrames={Math.max(1,Math.round(1.5*fps))}>
      <BrandedEndCard brand={brand} />
    </Sequence>
  </AbsoluteFill>;
};
