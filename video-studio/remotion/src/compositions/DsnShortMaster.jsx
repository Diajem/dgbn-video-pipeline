import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  useCurrentFrame,
} from 'remotion';

const RED = '#d71920';
const WHITE = '#ffffff';
const MUTED = '#b8bcc5';
const BG = '#0b0b0d';

const mediaNode = (media, qualityPolicy = 'DEMO') => {
  if (!media?.src) {
    if (qualityPolicy === 'PRODUCTION') {
      throw new Error('DSN production render blocked: required media asset is missing');
    }
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'grid',
        placeItems: 'center',
        background: 'linear-gradient(145deg,#202126,#0c0d10)',
        color: '#777d88',
        fontSize: 28,
        textAlign: 'center',
        padding: 40,
      }}>
        DEMO ONLY · media not supplied
      </div>
    );
  }
  if (media.kind === 'video' || /\.(mp4|webm|mov)$/i.test(media.src)) {
    return <OffthreadVideo src={media.src} style={{width: '100%', height: '100%', objectFit: 'cover'}} />;
  }
  return <Img src={media.src} style={{width: '100%', height: '100%', objectFit: 'cover'}} />;
};

const Presenter = ({scene, presenters, presentationMode = 'AVATAR', qualityPolicy = 'DEMO'}) => {
  const pRef = scene.presenter;
  if (presentationMode === 'VOICEOVER_BROLL') return null;
  if (presentationMode === 'PETER_REAL' && pRef?.id && pRef.id !== 'peter') return null;
  if (!pRef || pRef.mode === 'off') return null;
  const profile = presenters?.[pRef.id] || {};
  const src = pRef.src || profile.src;
  const mode = pRef.mode || 'lower-third';
  if (!src && qualityPolicy === 'PRODUCTION') {
    throw new Error('DSN production render blocked: presenter asset is missing for ' + (pRef.id || 'presenter'));
  }

  const layouts = {
    full: {left: 0, top: 0, width: 1080, height: 1920, borderRadius: 0},
    left: {left: 40, bottom: 190, width: 505, height: 1160, borderRadius: 34},
    right: {right: 40, bottom: 190, width: 505, height: 1160, borderRadius: 34},
    'lower-third': {left: 72, bottom: 210, width: 430, height: 700, borderRadius: 34},
    card: {left: 600, top: 460, width: 410, height: 780, borderRadius: 36},
  };
  const layout = layouts[mode] || layouts['lower-third'];

  return (
    <>
      <div style={{
        position: 'absolute',
        overflow: 'hidden',
        background: 'linear-gradient(160deg,#25262b,#0d0e11)',
        border: mode === 'full' ? 'none' : '1px solid rgba(255,255,255,.18)',
        boxShadow: mode === 'full' ? 'none' : '0 30px 80px rgba(0,0,0,.42)',
        zIndex: 7,
        ...layout,
      }}>
        {src ? (
          /\.(png|jpg|jpeg|webp)$/i.test(src)
            ? <Img src={src} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
            : <OffthreadVideo src={src} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
        ) : (
          <div style={{width: '100%', height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center'}}>
            <div>
              <div style={{fontSize: 48, fontWeight: 900, textTransform: 'uppercase'}}>{profile.name || pRef.id || 'Presenter'}</div>
              <div style={{fontSize: 23, color: MUTED, marginTop: 12}}>HeyGen / real presenter slot</div>
            </div>
          </div>
        )}
      </div>
      {pRef.nameplate === false ? null : (
        <div style={{
          position: 'absolute',
          left: 74,
          bottom: 390,
          minWidth: 320,
          padding: '16px 22px',
          borderLeft: '8px solid ' + RED,
          background: 'rgba(7,8,10,.88)',
          fontSize: 29,
          fontWeight: 900,
          textTransform: 'uppercase',
          zIndex: 15,
        }}>
          {profile.name || pRef.id || 'DSN Presenter'}
          <div style={{marginTop: 3, color: MUTED, fontSize: 18, letterSpacing: '.08em'}}>DSN PRESENTER</div>
        </div>
      )}
    </>
  );
};

const Headline = ({text, accent, bottom = 350}) => {
  if (!text) return null;
  const parts = accent && text.includes(accent) ? text.split(accent) : null;
  return (
    <div style={{
      position: 'absolute',
      left: 70,
      right: 70,
      bottom,
      zIndex: 12,
      fontWeight: 1000,
      fontSize: 92,
      lineHeight: .94,
      textTransform: 'uppercase',
      letterSpacing: '-.045em',
      textShadow: '0 8px 28px rgba(0,0,0,.55)',
    }}>
      {parts ? <>{parts[0]}<span style={{color: '#ff2633'}}>{accent}</span>{parts.slice(1).join(accent)}</> : text}
    </div>
  );
};

const Kicker = ({children}) => (
  <div style={{
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: 48,
    padding: '0 18px',
    borderRadius: 999,
    background: RED,
    fontWeight: 900,
    letterSpacing: '.08em',
    textTransform: 'uppercase',
    fontSize: 22,
  }}>
    {children}
  </div>
);

const Scene = ({scene, presenters, presentationMode, qualityPolicy}) => {
  const frame = useCurrentFrame();
  const intro = interpolate(frame, [0, 7], [0, 1], {extrapolateRight: 'clamp'});
  const lift = interpolate(frame, [0, 10], [34, 0], {extrapolateRight: 'clamp'});
  const common = {opacity: intro, transform: 'translateY(' + lift + 'px)'};

  if (scene.type === 'hook') {
    return (
      <AbsoluteFill style={common}>
        {scene.media ? <AbsoluteFill>{mediaNode(scene.media, qualityPolicy)}</AbsoluteFill> : null}
        <Presenter scene={scene} presenters={presenters} presentationMode={presentationMode} qualityPolicy={qualityPolicy} />
        <Headline text={scene.headline} accent={scene.accent} />
        <div style={{position: 'absolute', left: 70, right: 70, bottom: 245, zIndex: 12, fontSize: 36, lineHeight: 1.18, fontWeight: 720}}>
          {scene.subhead}
        </div>
      </AbsoluteFill>
    );
  }

  if (scene.type === 'presenter_split') {
    const copyOnRight = scene.presenter?.mode === 'left';
    return (
      <AbsoluteFill style={common}>
        {scene.media ? (
          <div style={{position: 'absolute', left: 70, right: 70, top: 180, height: 880, borderRadius: 30, overflow: 'hidden', border: '1px solid rgba(255,255,255,.14)'}}>
            {mediaNode(scene.media, qualityPolicy)}
          </div>
        ) : null}
        <Presenter scene={scene} presenters={presenters} presentationMode={presentationMode} qualityPolicy={qualityPolicy} />
        <div style={{position: 'absolute', top: 300, width: 480, zIndex: 8, ...(copyOnRight ? {right: 70} : {left: 70})}}>
          {scene.kicker ? <Kicker>{scene.kicker}</Kicker> : null}
          <div style={{fontSize: 66, lineHeight: .98, textTransform: 'uppercase', letterSpacing: '-.035em', fontWeight: 1000, marginTop: 18}}>
            {scene.headline}
          </div>
          <div style={{marginTop: 18, color: MUTED, fontSize: 30, lineHeight: 1.3, fontWeight: 650}}>{scene.body}</div>
        </div>
      </AbsoluteFill>
    );
  }

  if (scene.type === 'media') {
    return (
      <AbsoluteFill style={common}>
        <AbsoluteFill>{mediaNode(scene.media, qualityPolicy)}</AbsoluteFill>
        <Presenter scene={scene} presenters={presenters} presentationMode={presentationMode} qualityPolicy={qualityPolicy} />
        {scene.kicker ? <div style={{position: 'absolute', top: 195, left: 70, zIndex: 12, fontSize: 24, fontWeight: 850, letterSpacing: '.08em'}}>{scene.kicker}</div> : null}
        <Headline text={scene.headline} accent={scene.accent} />
      </AbsoluteFill>
    );
  }

  if (scene.type === 'stats') {
    return (
      <AbsoluteFill style={common}>
        {scene.media ? <AbsoluteFill><div style={{position:'absolute',inset:0,filter:'brightness(.42) saturate(.85)',transform:'scale(1.035)'}}>{mediaNode(scene.media, qualityPolicy)}</div></AbsoluteFill> : null}
        <div style={{position:'absolute',inset:0,background:'linear-gradient(180deg,rgba(5,7,12,.26),rgba(5,7,12,.90))'}} />
        <Presenter scene={scene} presenters={presenters} presentationMode={presentationMode} qualityPolicy={qualityPolicy} />
        <div style={{position: 'absolute', top: 195, left: 70, fontSize: 24, fontWeight: 850, letterSpacing: '.08em'}}>{scene.kicker || 'THE NUMBERS'}</div>
        <div style={{position: 'absolute', left: 70, right: 70, top: 380, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 26}}>
          {(scene.stats || []).slice(0, 4).map((s, i) => (
            <div key={i} style={{minHeight: 250, borderRadius: 28, background: 'linear-gradient(145deg,rgba(34,36,42,.94),rgba(16,17,20,.94))', border: '1px solid rgba(255,255,255,.14)', padding: 34}}>
              <div style={{fontSize: 82, lineHeight: 1, fontWeight: 1000}}>{s.value}</div>
              <div style={{marginTop: 16, color: MUTED, fontWeight: 780, fontSize: 25, textTransform: 'uppercase'}}>{s.label}</div>
              {s.source ? <div style={{marginTop: 18, color: '#858b96', fontSize: 18}}>{s.source}</div> : null}
            </div>
          ))}
        </div>
      </AbsoluteFill>
    );
  }

  if (scene.type === 'timeline') {
    return (
      <AbsoluteFill style={common}>
        <Presenter scene={scene} presenters={presenters} presentationMode={presentationMode} qualityPolicy={qualityPolicy} />
        <div style={{position: 'absolute', top: 195, left: 70, fontSize: 24, fontWeight: 850, letterSpacing: '.08em'}}>{scene.kicker || 'HOW WE GOT HERE'}</div>
        <div style={{position: 'absolute', left: 115, right: 80, top: 350}}>
          {(scene.items || []).map((item, i) => (
            <div key={i} style={{position: 'relative', padding: '0 0 54px 88px'}}>
              <div style={{position: 'absolute', left: 0, top: 9, width: 48, height: 48, borderRadius: '50%', background: RED, border: '8px solid #141519'}} />
              <div style={{fontSize: 36, lineHeight: 1.1, fontWeight: 900}}>{item.title}</div>
              <div style={{marginTop: 10, color: MUTED, fontSize: 27, lineHeight: 1.3}}>{item.detail}</div>
            </div>
          ))}
        </div>
      </AbsoluteFill>
    );
  }

  if (scene.type === 'scoreboard') {
    const home = scene.home || {name: 'BRIGHTON', score: 3};
    const away = scene.away || {name: 'ARSENAL', score: 0};
    return (
      <AbsoluteFill style={common}>
        {scene.media ? <AbsoluteFill>{mediaNode(scene.media, qualityPolicy)}</AbsoluteFill> : null}
        <div style={{position:'absolute', inset:0, background:'linear-gradient(180deg,rgba(2,10,26,.30),rgba(5,7,12,.90))'}} />
        <div style={{position:'absolute', top:185, left:70, fontSize:24, fontWeight:900, letterSpacing:'.10em'}}>PREMIER LEAGUE · FULL-TIME</div>
        <div style={{position:'absolute', top:350, left:70, right:70, padding:'42px 34px', borderRadius:34, background:'rgba(8,10,16,.88)', border:'1px solid rgba(255,255,255,.16)'}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 180px 1fr', alignItems:'center', gap:22}}>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:48,fontWeight:1000}}>{home.name}</div>
              <div style={{fontSize:20,color:MUTED,marginTop:8}}>{home.short || 'BHA'}</div>
            </div>
            <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:18}}>
              <span style={{fontSize:112,fontWeight:1000,color:'#6fd3ff'}}>{home.score}</span>
              <span style={{fontSize:50,fontWeight:900,color:MUTED}}>–</span>
              <span style={{fontSize:112,fontWeight:1000,color:'#ff4350'}}>{away.score}</span>
            </div>
            <div>
              <div style={{fontSize:48,fontWeight:1000}}>{away.name}</div>
              <div style={{fontSize:20,color:MUTED,marginTop:8}}>{away.short || 'ARS'}</div>
            </div>
          </div>
          <div style={{height:1,background:'rgba(255,255,255,.14)',margin:'34px 0 24px'}} />
          {(scene.scorers || []).map((s,i)=>(
            <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'13px 6px',fontSize:30,fontWeight:800}}>
              <span>{s.name}</span><span style={{color:'#6fd3ff'}}>{s.minute}</span>
            </div>
          ))}
        </div>
        <Headline text={scene.headline} accent={scene.accent} bottom={255} />
      </AbsoluteFill>
    );
  }

  if (scene.type === 'tactics') {
    const labels = scene.labels || ['PRESS HIGH','WIN DUELS','FORCE ERRORS','ATTACK SET PIECES'];
    return (
      <AbsoluteFill style={common}>
        <div style={{position:'absolute',top:210,left:70,right:70,fontSize:24,fontWeight:900,letterSpacing:'.10em'}}>HOW BRIGHTON BROKE THE DEFENCE</div>
        <div style={{position:'absolute',top:330,left:90,right:90,height:890,border:'6px solid rgba(255,255,255,.78)',borderRadius:24,background:'linear-gradient(180deg,#126838,#0e4e2d)',boxShadow:'0 30px 80px rgba(0,0,0,.35)'}}>
          <div style={{position:'absolute',left:'50%',top:0,bottom:0,width:4,background:'rgba(255,255,255,.65)'}} />
          <div style={{position:'absolute',left:'50%',top:'50%',width:180,height:180,transform:'translate(-50%,-50%)',border:'4px solid rgba(255,255,255,.65)',borderRadius:'50%'}} />
          <div style={{position:'absolute',left:0,right:0,top:'50%',height:4,background:'rgba(255,255,255,.65)'}} />
          {[0,1,2,3].map((i)=>(
            <div key={i} style={{
              position:'absolute',
              left: 150 + (i%2)*430,
              top: 170 + Math.floor(i/2)*420,
              width:260,
              padding:'20px 18px',
              borderRadius:18,
              background:'rgba(6,8,12,.84)',
              borderLeft:'7px solid '+(i<3?'#5be5ff':'#ff4350'),
              fontSize:27,
              fontWeight:950,
              textAlign:'center'
            }}>{labels[i]}</div>
          ))}
          {[{l:385,t:240,r:-25},{l:385,t:660,r:25},{l:620,t:455,r:0}].map((a,i)=>(
            <div key={'a'+i} style={{position:'absolute',left:a.l,top:a.t,width:210,height:14,background:'#ff4350',borderRadius:8,transform:'rotate('+a.r+'deg)',transformOrigin:'left center',boxShadow:'0 0 18px rgba(255,67,80,.55)'}}>
              <div style={{position:'absolute',right:-4,top:-13,width:0,height:0,borderTop:'20px solid transparent',borderBottom:'20px solid transparent',borderLeft:'30px solid #ff4350'}} />
            </div>
          ))}
        </div>
        <div style={{position:'absolute',left:70,right:70,bottom:240,fontSize:36,fontWeight:900,lineHeight:1.08,textAlign:'center'}}>{scene.body || ''}</div>
      </AbsoluteFill>
    );
  }

  if (scene.type === 'quote') {
    return (
      <AbsoluteFill style={common}>
        {scene.media ? <AbsoluteFill>{mediaNode(scene.media, qualityPolicy)}</AbsoluteFill> : null}
        <Presenter scene={scene} presenters={presenters} presentationMode={presentationMode} qualityPolicy={qualityPolicy} />
        <div style={{position: 'absolute', top: 195, left: 70, fontSize: 24, fontWeight: 850, letterSpacing: '.08em'}}>{scene.kicker || 'THE QUOTE'}</div>
        <div style={{position: 'absolute', left: 70, right: 70, top: 430, padding: '52px 48px', borderRadius: 34, background: 'rgba(16,17,20,.94)', borderLeft: '10px solid ' + RED}}>
          <div style={{fontSize: 54, fontWeight: 900, lineHeight: 1.08}}>“{scene.quote}”</div>
          <div style={{marginTop: 28, fontSize: 25, color: MUTED}}>{scene.attribution}</div>
        </div>
      </AbsoluteFill>
    );
  }

  return (
    <AbsoluteFill style={{...common, display: 'grid', placeItems: 'center', textAlign: 'center', padding: '170px 85px'}}>
      <Presenter scene={scene} presenters={presenters} presentationMode={presentationMode} qualityPolicy={qualityPolicy} />
      <div style={{zIndex: 10}}>
        <div style={{fontSize: 84, lineHeight: .96, textTransform: 'uppercase', fontWeight: 1000, letterSpacing: '-.04em'}}>
          {scene.headline || 'WHAT DO YOU THINK?'}
        </div>
        <div style={{marginTop: 38, fontSize: 34, lineHeight: 1.25, color: MUTED, fontWeight: 700}}>
          {scene.body || 'Follow Diajem Sports Network for the next update.'}
        </div>
        <div style={{marginTop: 58, color: '#ff2633', fontSize: 25, fontWeight: 900, letterSpacing: '.12em'}}>
          DIAJEM SPORTS NETWORK
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Caption = ({caption}) => {
  const frame = useCurrentFrame();
  const pop = interpolate(frame, [0, 5], [.92, 1], {extrapolateRight: 'clamp'});
  const emphasis = new Set((caption.emphasis || []).map((x) => String(x).toUpperCase()));
  const parts = String(caption.text || '').split(/(\s+)/);
  return (
    <div style={{
      position: 'absolute',
      left: 62,
      right: 62,
      bottom: 190,
      minHeight: 156,
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transform: 'scale(' + pop + ')',
    }}>
      <div style={{maxWidth: 930, padding: '17px 24px 19px', borderRadius: 20, background: 'rgba(6,7,9,.80)', textAlign: 'center', fontSize: 46, fontWeight: 950, lineHeight: 1.05, textTransform: 'uppercase', boxShadow:'0 14px 42px rgba(0,0,0,.40)'}}>
        {parts.map((part,i) => {
          const token = part.replace(/[^A-Za-z0-9'-]/g,'').toUpperCase();
          return <span key={i} style={emphasis.has(token) ? {color:'#ff2633'} : undefined}>{part}</span>;
        })}
      </div>
    </div>
  );
};

export const DsnShortMaster = ({config}) => {
  const fps = config.fps || 30;
  const qualityPolicy = config.qualityPolicy || 'DEMO';
  const presentationMode = config.presentationMode || 'AVATAR';

  if (qualityPolicy === 'PRODUCTION' && presentationMode === 'VOICEOVER_BROLL' && !config.audio?.voiceoverSrc) {
    throw new Error('DSN production render blocked: VOICEOVER_BROLL requires an approved voiceoverSrc');
  }
  if (qualityPolicy === 'PRODUCTION' && presentationMode === 'PETER_REAL' && !config.presenters?.peter?.src) {
    throw new Error('DSN production render blocked: PETER_REAL requires Peter real-camera footage');
  }
  return (
    <AbsoluteFill style={{background: BG, color: WHITE, fontFamily: 'Arial, Helvetica, sans-serif', overflow: 'hidden'}}>
      <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(circle at 80% 8%, rgba(215,25,32,.22), transparent 30%), linear-gradient(160deg,#15161a 0%,#08090b 58%,#111216 100%)'}} />
      <div style={{position: 'absolute', top: 110, left: 70, zIndex: 80, display: 'flex', alignItems: 'center', gap: 13, fontWeight: 900, letterSpacing: '.08em', fontSize: 24}}>
        <div style={{width: 58, height: 58, borderRadius: 16, background: RED, display: 'grid', placeItems: 'center', fontSize: 27}}>DSN</div>
        DIAJEM SPORTS NETWORK
      </div>

      {(config.scenes || []).map((scene) => (
        <Sequence
          key={scene.id}
          from={Math.round(scene.start * fps)}
          durationInFrames={Math.round(scene.duration * fps)}
        >
          <Scene
            scene={scene}
            presenters={config.presenters}
            presentationMode={presentationMode}
            qualityPolicy={qualityPolicy}
          />
        </Sequence>
      ))}

      {(config.captions || []).map((caption, i) => (
        <Sequence
          key={i}
          from={Math.round(caption.start * fps)}
          durationInFrames={Math.max(1, Math.round((caption.end - caption.start) * fps))}
        >
          <Caption caption={caption} />
        </Sequence>
      ))}

      {config.audio?.voiceoverSrc ? (
        <Audio src={config.audio.voiceoverSrc} volume={config.audio.voiceoverVolume ?? 1} />
      ) : null}
      {config.audio?.musicSrc ? (
        <Audio src={config.audio.musicSrc} volume={config.audio.musicVolume ?? 0.10} />
      ) : null}

      <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, background: 'rgba(255,255,255,.09)', zIndex: 90}}>
        <div style={{height: '100%', width: '100%', background: RED}} />
      </div>
    </AbsoluteFill>
  );
};
