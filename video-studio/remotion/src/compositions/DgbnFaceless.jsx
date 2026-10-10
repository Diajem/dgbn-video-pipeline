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

// Word-by-word timing: each word is weighted by its length, with extra time after commas and full stops.
export const buildWordChunks = (script, totalFrames) => {
  const tokens = String(script || '').split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const weight = w => Math.max(2, w.replace(/[^\p{L}\p{N}]/gu, '').length) + (/[.!?]["”’)]?$/.test(w) ? 6 : /[,;:–—-]$/.test(w) ? 3 : 0);
  const weights = tokens.map(weight);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  const words = tokens.map((text, i) => {
    const start = Math.round(totalFrames * acc / total);
    acc += weights[i];
    return {text, start, end: Math.max(start + 1, Math.round(totalFrames * acc / total))};
  });
  // Chunks of up to four short words; always break after punctuation.
  const chunks = [];
  let cur = [];
  const flush = () => { if (cur.length) { chunks.push({words: cur, start: cur[0].start, end: cur[cur.length - 1].end}); cur = []; } };
  for (const w of words) {
    cur.push(w);
    const letters = cur.reduce((n, x) => n + x.text.length, 0);
    const hard = /[.!?]["”’)]?$/.test(w.text), soft = /[,;:–—]["”’)]?$/.test(w.text);
    if (cur.length >= 4 || letters > 24 || hard || (soft && cur.length >= 2)) flush();
  }
  flush();
  return chunks;
};

// How a picture sits in the 9:16 frame. Photos fill and move (Ken Burns); landscape clips sit on a blurred copy of themselves.
export const fitMode = visual => {
  if (visual.fit === 'fit' || visual.fit === 'fill') return visual.fit;
  const ratio = visual.width && visual.height ? visual.width / visual.height : null;
  return visual.kind === 'video' && ratio && ratio > 0.9 ? 'fit' : 'fill';
};

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
  // Studio jobs give each visual its own time window (scene-aligned).
  if (visuals.every(v => Number.isFinite(Number(v.startSec)))) {
    return visuals.map((visual, i) => {
      const start = Math.max(0, Math.round(Number(visual.startSec) * fps));
      const end = Math.min(totalFrames, Math.max(start + 1, Math.round(Number(visual.endSec) * fps)));
      return {visual, move: MOVES[i % MOVES.length], videoOffset: 0, start, end};
    });
  }
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

// Player card: a framed photo with the name, role and a status chip (OUT / DOUBT / AVAILABLE / PREDICTED) and one line of data.
const STATUS_COLOURS = {OUT: '#e5252f', DOUBT: '#f5a300', AVAILABLE: '#22b455', PREDICTED: '#3a7bd5'};
const PlayerCard = ({visual, src, eased, accent}) => {
  const c = visual.card;
  const status = String(c.status || '').toUpperCase();
  const colour = STATUS_COLOURS[status] || accent;
  const nameSize = String(c.name).length > 22 ? 52 : String(c.name).length > 16 ? 62 : 74;
  return <AbsoluteFill>
    <Img src={src} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',transform:'scale(1.3)',filter:'blur(42px) brightness(.38)'}} />
    <div style={{position:'absolute',top:292,left:90,width:900,height:1090,borderRadius:28,overflow:'hidden',background:'#0e0e0e',border:`5px solid ${colour}`,boxShadow:'0 24px 70px rgba(0,0,0,.7)'}}>
      <div style={{position:'relative',height:742,overflow:'hidden'}}>
        <Img src={src} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'50% 18%',transform:`scale(${1.02 + .06 * eased})`}} />
        {status && <div style={{position:'absolute',top:24,left:24,background:colour,color:status === 'DOUBT' ? '#111' : '#fff',padding:'10px 24px',borderRadius:10,fontSize:44,fontWeight:900,letterSpacing:3}}>{status === 'PREDICTED' ? 'PREDICTED XI' : status}</div>}
      </div>
      <div style={{padding:'22px 36px 0'}}>
        <div style={{fontSize:nameSize,fontWeight:900,lineHeight:1.05,textTransform:'uppercase',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{c.name}</div>
        {c.role && <div style={{marginTop:6,fontSize:34,fontWeight:700,color:colour === accent ? '#ddd' : colour,letterSpacing:1}}>{c.role}</div>}
        {c.line && <div style={{marginTop:10,fontSize:36,fontWeight:600,lineHeight:1.2,color:'#f2f2f2'}}>{String(c.line).slice(0, 80)}</div>}
      </div>
    </div>
  </AbsoluteFill>;
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
  const mode = fitMode(visual);
  const src = resolveSrc(visual.src);
  const startFrom = Math.round(shot.videoOffset * fps);
  if (visual.card?.name && visual.kind !== 'video') return <AbsoluteFill style={{opacity}}><PlayerCard visual={visual} src={src} eased={eased} accent={shot.accent} /></AbsoluteFill>;
  const media = (style) => visual.kind === 'video'
    ? <OffthreadVideo src={src} muted startFrom={startFrom} style={style} />
    : <Img src={src} style={style} />;
  return <AbsoluteFill style={{opacity}}>
    {mode === 'fit' ? <>
      {media({width:'100%',height:'100%',objectFit:'cover',transform:'scale(1.25)',filter:'blur(38px) brightness(.55)'})}
      <AbsoluteFill style={{justifyContent:'center'}}>
        {media({width:'100%',height:'auto',maxHeight:'100%',objectFit:'contain',transform:`scale(${1 + .04 * eased})`})}
      </AbsoluteFill>
    </> : media(visual.kind === 'video'
      ? {width:'100%',height:'100%',objectFit:'cover',transform:`scale(${1.02 + .06 * eased})`}
      : {width:'100%',height:'100%',objectFit:'cover',transform})}
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
  const presenter = config.presenter;
  const layout = presenter?.scenes?.find(s => frame >= Math.round(s.startSec * fps) && frame < Math.round(s.endSec * fps))?.layout || 'presenter';
  if (config.qualityPolicy === 'PRODUCTION' && (!config.audio?.voiceoverSrc || (!visuals.length && !presenter?.src))) {
    throw new Error('DGBN production needs approved narration and at least one reviewed visual');
  }
  const shots = buildShots(visuals, mainFrames, fps);
  const current = shots.find(s => frame >= s.start && frame < s.end) || shots[shots.length - 1];

  // Word-by-word captions: three or four words at a time, the spoken word highlighted.
  const chunks = buildWordChunks(config.script, mainFrames);
  const chunk = chunks.find(c => frame >= c.start && frame < c.end);
  const activeWord = chunk?.words.find(w => frame >= w.start && frame < w.end) || chunk?.words[chunk.words.length - 1];
  const pop = chunk ? interpolate(frame - chunk.start, [0, 4], [0, 1], clamp) : 1;
  const format = config.format || 'website';
  const creditsFrom = mainFrames - Math.round(4 * fps);
  const headlineIn = interpolate(frame, [0, 14], [0, 1], clamp);
  const progress = Math.min(1, frame / mainFrames);

  return <AbsoluteFill style={{background:'#080807', color:'#fff', fontFamily:'Arial, Helvetica, sans-serif'}}>
    {config.audio?.voiceoverSrc && <Sequence from={0} durationInFrames={mainFrames}><Audio src={resolveSrc(config.audio.voiceoverSrc)} volume={1} /></Sequence>}
    {presenter?.src && frame < mainFrames && <OffthreadVideo src={resolveSrc(presenter.src)} muted style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover'}} />}
    {(!presenter || layout !== 'presenter') && shots.map((shot, index) => (
      <Sequence key={index} from={shot.start} durationInFrames={Math.max(1, shot.end - shot.start + (index < shots.length - 1 ? FADE_FRAMES : 0))}>
        <Shot shot={{...shot, accent: ACCENT}} fps={fps} />
      </Sequence>
    ))}
    {presenter?.src && layout === 'pip' && frame < mainFrames && <OffthreadVideo src={resolveSrc(presenter.src)} muted style={{position:'absolute',right:48,bottom:580,width:340,height:490,objectFit:'cover',borderRadius:20,border:'4px solid '+ACCENT}} />}
    {(!presenter || layout !== 'presenter') && current?.visual.label?.includes('AI-GENERATED') && <div style={{position:'absolute',top:56,right:64,background:'#101010df',padding:'10px 16px',fontSize:26,fontWeight:800,color:ACCENT}}>AI-GENERATED ILLUSTRATION</div>}
    {(!presenter || layout !== 'presenter') && ['ILLUSTRATIVE IMAGE', 'ILLUSTRATIVE FOOTAGE', 'FILE FOOTAGE', 'ARCHIVE'].includes(current?.visual.label) && frame < mainFrames && <div style={{position:'absolute',top:60,right:64,background:'#101010c0',padding:'6px 12px',fontSize:20,fontWeight:700,letterSpacing:1,color:'#ddd'}}>{current.visual.label}</div>}
    {(!presenter || layout !== 'presenter') && current?.visual.credit?.trim() && frame < mainFrames && <div style={{position:'absolute',bottom:262,left:48,right:200,fontSize:23,fontWeight:600,color:'rgba(255,255,255,.82)',textShadow:'0 1px 5px #000, 0 0 10px #000',
      whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{current.visual.kind === 'video' ? 'Video' : 'Photo'}: {current.visual.credit.trim().slice(0, 90)}</div>}
    {config.draft && <div style={{position:'absolute',bottom:60,left:64,right:64,textAlign:'center',background:'#b00020e6',padding:'10px',fontSize:26,fontWeight:900,letterSpacing:2}}>DRAFT - NOT FOR PUBLICATION</div>}
    <div style={{position:'absolute',top:0,left:0,right:0,height:12,background:ACCENT}} />
    <div style={{position:'absolute',top:12,left:0,height:6,width:`${progress * 100}%`,background:'rgba(255,255,255,.75)'}} />
    <div style={{position:'absolute',top:62,left:64,fontWeight:900,letterSpacing:4,fontSize:35,textShadow:'0 2px 8px #000'}}>{brand}</div>
    <div style={{position:'absolute',top:150,left:48,right:48,background:ACCENT,color:'#0b0b0b',borderRadius:10,padding:'18px 26px',fontWeight:900,lineHeight:1.08,textTransform:'uppercase',
      fontSize:String(config.headline || '').length > 80 ? 38 : String(config.headline || '').length > 48 ? 46 : 56,boxShadow:'0 8px 28px rgba(0,0,0,.5)',
      opacity:headlineIn,transform:`translateY(${(1 - headlineIn) * -30}px)`}}>{config.headline}</div>
    {frame < mainFrames && chunk && <div style={{position:'absolute',bottom:330,left:48,right:48,textAlign:'center',fontSize:76,fontWeight:900,lineHeight:1.12,
      transform:`scale(${.9 + .1 * pop})`,opacity:.25 + .75 * pop,WebkitTextStroke:'10px #000',paintOrder:'stroke fill',textShadow:'0 6px 22px rgba(0,0,0,.85)'}}>
      {chunk.words.map((w, i) => <span key={i} style={{color: w === activeWord ? ACCENT : '#fff'}}>{w.text}{i < chunk.words.length - 1 ? ' ' : ''}</span>)}
    </div>}
    {format === 'long' && config.credits?.length > 0 && frame >= creditsFrom && frame < mainFrames && <div style={{position:'absolute',bottom:150,left:64,right:64,fontSize:24,lineHeight:1.35,color:'#e6e6e6',textShadow:'0 1px 6px #000',
      opacity:interpolate(frame, [creditsFrom, creditsFrom + 12], [0, 1], clamp)}}>
      <div style={{fontWeight:900,letterSpacing:2,marginBottom:4}}>CREDITS</div>{config.credits.map((c, i) => <div key={i}>{c}</div>)}</div>}
    <Sequence from={mainFrames + Math.round(.4*fps)} durationInFrames={Math.max(1,Math.round(1.5*fps))}>
      <BrandedEndCard brand={brand} />
    </Sequence>
  </AbsoluteFill>;
};
