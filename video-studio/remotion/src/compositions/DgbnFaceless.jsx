import React from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {BrandedEndCard} from '../components/BrandedEndCard.jsx';

const resolveSrc = (src) => /^(https?:|data:|blob:)/i.test(src || '') ? src : staticFile(String(src || '').replace(/^\//, ''));
const GOLD = '#d7a62a';

const splitNarration = (script) => (String(script || '').match(/[^.!?]+[.!?]?/g) || []).map(s => s.trim()).filter(Boolean);

export const DgbnFaceless = ({config}) => {
  const {fps} = useVideoConfig();
  const frame = useCurrentFrame();
  const durationSec = Number(config.durationSec || 0);
  const mainFrames = Math.max(1, Math.round(durationSec * fps));
  const visuals = config.visuals || [];
  if (config.qualityPolicy === 'PRODUCTION' && (!config.audio?.voiceoverSrc || !visuals.length)) {
    throw new Error('DGBN production needs approved narration and at least one reviewed visual');
  }
  const lines = splitNarration(config.script);
  const wordTotals = lines.reduce((n, line) => n + Math.max(1, line.split(/\s+/).length), 0) || 1;
  let wordCursor = 0;
  const activeLine = lines.find((line, index) => {
    const start = wordCursor;
    wordCursor += Math.max(1, line.split(/\s+/).length);
    return frame < mainFrames * wordCursor / wordTotals || index === lines.length - 1;
  }) || '';

  return <AbsoluteFill style={{background:'#080807', color:'#fff', fontFamily:'Arial, Helvetica, sans-serif'}}>
    {config.audio?.voiceoverSrc && <Sequence from={0} durationInFrames={mainFrames}><Audio src={resolveSrc(config.audio.voiceoverSrc)} volume={1} /></Sequence>}
    {visuals.map((visual, index) => {
      const start = Math.floor(mainFrames * index / visuals.length);
      const end = Math.ceil(mainFrames * (index + 1) / visuals.length);
      return <Sequence key={visual.assetId || index} from={start} durationInFrames={Math.max(1,end-start)}>
        <AbsoluteFill>
          {visual.kind === 'video'
            ? <OffthreadVideo src={resolveSrc(visual.src)} muted loop style={{width:'100%',height:'100%',objectFit:'cover'}} />
            : <Img src={resolveSrc(visual.src)} style={{width:'100%',height:'100%',objectFit:'cover',transform:`scale(${interpolate(frame, [start,end], [1,1.07], {extrapolateLeft:'clamp',extrapolateRight:'clamp'})})`}} />}
          <AbsoluteFill style={{background:'linear-gradient(180deg,rgba(0,0,0,.35),rgba(0,0,0,.12) 40%,rgba(0,0,0,.85))'}} />
          {visual.label?.includes('AI-GENERATED') && <div style={{position:'absolute',top:155,left:64,background:'#101010df',padding:'10px 16px',fontSize:26,fontWeight:800,color:GOLD}}>AI-GENERATED ILLUSTRATION</div>}
        </AbsoluteFill>
      </Sequence>;
    })}
    <div style={{position:'absolute',top:0,left:0,right:0,height:12,background:GOLD}} />
    <div style={{position:'absolute',top:62,left:64,fontWeight:900,letterSpacing:4,fontSize:35,textShadow:'0 2px 8px #000'}}>DGBN</div>
    <div style={{position:'absolute',top:240,left:64,right:64,fontSize:55,fontWeight:900,lineHeight:1.07,textShadow:'0 3px 18px #000'}}>{config.headline}</div>
    {frame < mainFrames && <div style={{position:'absolute',bottom:185,left:64,right:64,padding:'28px 30px',borderLeft:`8px solid ${GOLD}`,background:'rgba(6,6,6,.80)',fontSize:39,fontWeight:750,lineHeight:1.22}}>{activeLine}</div>}
    <Sequence from={mainFrames + Math.round(.4*fps)} durationInFrames={Math.max(1,Math.round(1.5*fps))}>
      <BrandedEndCard brand="DGBN" />
    </Sequence>
  </AbsoluteFill>;
};
