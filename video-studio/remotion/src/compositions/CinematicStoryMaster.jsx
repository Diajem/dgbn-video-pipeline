import React from 'react';
import {AbsoluteFill, Audio, Img, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {BrandedEndCard} from '../components/BrandedEndCard.jsx';

const FONT = 'Arial, Helvetica, sans-serif';

const resolveMediaSrc = (src) => {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  const marker = 'video-studio/remotion/public/';
  const relative = src.includes(marker) ? src.split(marker)[1] : src.replace(/^public\//, '');
  return staticFile(relative.replace(/^\//, ''));
};

const Shot = ({shot, disclosure}) => {
  const frame = useCurrentFrame();
  const disclosureLabel = shot.disclosureLabel ?? (shot.aiGenerated ? disclosure?.reconstructionLabel : null);
  const fade = interpolate(frame, [0, 6], [0, 1], {extrapolateRight:'clamp'});
  const src = resolveMediaSrc(shot.renderSrc || shot.outputPath);
  const rawSrc = String(shot.renderSrc || shot.outputPath || '');
  const imageExt = /\.(png|jpe?g|webp|avif)(\?.*)?$/i.test(rawSrc);
  const isImage = shot.kind === 'image' || imageExt;
  const durationFrames = Math.max(1, Math.round((shot.durationSec || 5) * (shot.fps || 30)));
  const imageScale = interpolate(frame, [0, durationFrames], [1.02, 1.09], {extrapolateRight:'clamp'});
  const imageX = interpolate(frame, [0, durationFrames], [0, shot.panX ?? -1.8], {extrapolateRight:'clamp'});
  const imageY = interpolate(frame, [0, durationFrames], [0, shot.panY ?? -0.8], {extrapolateRight:'clamp'});
  return (
    <AbsoluteFill style={{backgroundColor:'#08090b',opacity:fade}}>
      {src ? (
        isImage ? (
          <Img
            src={src}
            style={{
              width:'100%',
              height:'100%',
              objectFit:'cover',
              transform:`translate(${imageX}%, ${imageY}%) scale(${imageScale})`,
              transformOrigin:shot.transformOrigin || 'center center'
            }}
          />
        ) : (
          <OffthreadVideo src={src} volume={shot.naturalSoundVolume ?? 0} style={{width:'100%',height:'100%',objectFit:'cover'}} />
        )
      ) : (
        <AbsoluteFill style={{display:'grid',placeItems:'center',padding:80,color:'#c9ccd3',fontFamily:FONT,textAlign:'center'}}>
          <div><div style={{fontSize:24,letterSpacing:2,textTransform:'uppercase'}}>Cinematic shot pending</div><div style={{fontSize:36,fontWeight:800,marginTop:20}}>{shot.shotId}</div></div>
        </AbsoluteFill>
      )}
      {disclosureLabel ? (
        <div style={{position:'absolute',top:60,left:60,padding:'10px 14px',background:'rgba(0,0,0,.62)',borderRadius:10,color:'#fff',fontFamily:FONT,fontSize:19,fontWeight:800,letterSpacing:1,textTransform:'uppercase'}}>
          {disclosureLabel}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const Caption = ({caption}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(frame,[0,4],[.88,1],{extrapolateRight:'clamp'});
  const words = String(caption.text || '').split(/\s+/);
  const emphasis = new Set((caption.emphasis || []).map((x) => String(x).toUpperCase()));
  return (
    <div style={{position:'absolute',left:70,right:70,bottom:190,zIndex:60,textAlign:'center',fontFamily:FONT,transform:`scale(${scale})`}}>
      <div style={{display:'inline',fontSize:54,fontWeight:1000,lineHeight:1.04,textTransform:'uppercase',padding:'10px 16px',background:'rgba(0,0,0,.45)',textShadow:'0 4px 14px rgba(0,0,0,.8)'}}>
        {words.map((word,i)=><React.Fragment key={i}><span style={{color:emphasis.has(word.replace(/[^A-Za-z0-9]/g,'').toUpperCase())?'#ffd21f':'#fff'}}>{word}</span>{i<words.length-1?' ':''}</React.Fragment>)}
      </div>
    </div>
  );
};

export const CinematicStoryMaster = ({config}) => {
  const fps = config.fps || 30;
  const storyDurationSec = config.targetDurationSec || 30;
  const outroHoldSec = config.outroHoldSec ?? 1.5;
  let cursor = 0;
  const shots = (config.shots || []).map((shot) => {
    const start = Number.isFinite(shot.start) ? shot.start : cursor;
    cursor = Math.max(cursor,start+(shot.durationSec || 5));
    return {...shot,start};
  });

  return (
    <AbsoluteFill style={{backgroundColor:'#08090b',overflow:'hidden'}}>
      {shots.map((shot)=>(
        <Sequence key={shot.shotId} from={Math.round(shot.start*fps)} durationInFrames={Math.max(1,Math.round((shot.durationSec||5)*fps))}>
          <Shot shot={shot} disclosure={config.disclosure} />
        </Sequence>
      ))}
      {(config.captions || []).map((caption,i)=>(
        <Sequence key={i} from={Math.round(caption.start*fps)} durationInFrames={Math.max(1,Math.round((caption.end-caption.start)*fps))}>
          <Caption caption={caption} />
        </Sequence>
      ))}
      {config.audio?.narrationSrc ? <Audio src={resolveMediaSrc(config.audio.narrationSrc)} volume={config.audio.narrationVolume ?? 1} /> : null}
      {config.audio?.musicSrc ? <Audio src={resolveMediaSrc(config.audio.musicSrc)} volume={config.audio.musicVolume ?? .14} /> : null}
      {outroHoldSec > 0 ? (
        <Sequence from={Math.round(storyDurationSec*fps)} durationInFrames={Math.max(1,Math.round(outroHoldSec*fps))}>
          <BrandedEndCard brand={config.brand === 'DSN' ? 'DSN' : 'DGBN'} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
