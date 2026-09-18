import React from 'react';
import {AbsoluteFill, Img, Sequence, interpolate, useCurrentFrame} from 'remotion';
import {Audio} from '@remotion/media';

const GOLD = '#d7a62a';
const IVORY = '#f6f0e4';

const Scene = ({scene, sceneNumber, totalScenes}) => {
  const frame = useCurrentFrame();
  const fadeIn = interpolate(frame, [0, 14], [0, 1], {extrapolateRight: 'clamp'});
  const rise = interpolate(frame, [0, 22], [42, 0], {extrapolateRight: 'clamp'});
  const zoom = interpolate(frame, [0, 660], [1.02, 1.08], {extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{background: '#050505', color: 'white', fontFamily: 'Arial, Helvetica, sans-serif'}}>
      {scene.audioUrl ? <Audio src={scene.audioUrl} /> : null}
      {scene.imageUrl ? (
        <AbsoluteFill>
          <Img
            src={scene.imageUrl}
            style={{width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${zoom})`}}
          />
          <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(0,0,0,.93) 0%, rgba(0,0,0,.72) 48%, rgba(0,0,0,.20) 100%)'}} />
        </AbsoluteFill>
      ) : (
        <AbsoluteFill style={{background: 'radial-gradient(circle at 78% 30%, #553900 0%, #17120a 28%, #050505 68%)'}}>
          <div style={{position:'absolute', right:120, top:180, width:520, height:520, borderRadius:'50%', border:`4px solid ${GOLD}`, opacity:.16}} />
          <div style={{position:'absolute', right:250, top:310, width:260, height:260, borderRadius:'50%', background:GOLD, opacity:.08}} />
        </AbsoluteFill>
      )}

      <div style={{position:'absolute', top:0, left:0, right:0, height:12, background:GOLD}} />
      <div style={{position:'absolute', top:48, left:70, fontWeight:900, fontSize:26, letterSpacing:4}}>DGBN • AFRICA</div>
      <div style={{position:'absolute', top:52, right:70, fontSize:18, opacity:.65}}>FEATURE REPORT • {sceneNumber}/{totalScenes}</div>

      <div style={{position:'absolute', left:92, top:210, width:1060, opacity:fadeIn, transform:`translateY(${rise}px)`}}>
        <div style={{color:GOLD, fontSize:30, fontWeight:900, letterSpacing:5}}>{scene.eyebrow}</div>
        <div style={{fontSize:78, lineHeight:1.01, fontWeight:950, marginTop:22, textShadow:'0 8px 30px rgba(0,0,0,.55)'}}>{scene.title}</div>
        {scene.metric ? <div style={{fontSize:92, color:GOLD, fontWeight:950, marginTop:34}}>{scene.metric}</div> : null}
        <div style={{fontSize:34, lineHeight:1.34, fontWeight:650, marginTop:34, maxWidth:980, color:IVORY}}>{scene.body}</div>
      </div>

      <div style={{position:'absolute', left:92, right:92, bottom:66, display:'flex', alignItems:'center', gap:26}}>
        <div style={{width:160, height:4, background:GOLD}} />
        <div style={{fontSize:21, letterSpacing:2, fontWeight:800}}>OUR PEOPLE. OUR STORY. OUR OWN WAY.</div>
      </div>
    </AbsoluteFill>
  );
};

export const DgbnFeatureReport = ({job}) => {
  const story = job.stories?.[0];
  const scenes = story?.productionScenes ?? [];
  let cursor = 0;

  return (
    <AbsoluteFill style={{background:'#050505'}}>
      {scenes.map((scene, index) => {
        const duration = Math.max(1, Math.round((scene.seconds ?? 10) * 30));
        const from = cursor;
        cursor += duration;
        return (
          <Sequence key={`${story.storyId}-scene-${index}`} from={from} durationInFrames={duration}>
            <Scene scene={scene} sceneNumber={index + 1} totalScenes={scenes.length} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
