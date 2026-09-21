import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';
import {BrandedEndCard} from '../components/BrandedEndCard.jsx';

const RED = '#d71920';
const WHITE = '#ffffff';
const MUTED = '#b8bcc5';
const BG = '#0b0b0d';

const resolveAssetSrc = (src) => {
  if (!src) return src;
  if (/^(https?:|data:|blob:)/i.test(src)) return src;
  return staticFile(String(src).replace(/^\//, ''));
};

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
    return <OffthreadVideo src={resolveAssetSrc(media.src)} volume={media.volume ?? 0} style={{width: '100%', height: '100%', objectFit: 'cover'}} />;
  }
  return <Img src={resolveAssetSrc(media.src)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />;
};

const Presenter = ({scene, presenters, presenterSpine, fps = 30, presentationMode = 'AVATAR', qualityPolicy = 'DEMO'}) => {
  const pRef = scene.presenter;
  if (presentationMode === 'VOICEOVER_BROLL') return null;
  if (presentationMode === 'PETER_REAL' && pRef?.id && pRef.id !== 'peter') return null;
  if (!pRef || pRef.mode === 'off') return null;
  const profile = presenters?.[pRef.id] || {};
  const spineSrc = presenterSpine?.src || null;
  const src = spineSrc || pRef.src || profile.src;
  const mode = pRef.mode || 'lower-third';
  const sourceStart = spineSrc ? Math.max(0, Math.round((pRef.sourceStart ?? scene.start ?? 0) * fps)) : 0;
  const mutePresenterVisual = Boolean(presenterSpine?.continuousAudio);
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
            ? <Img src={resolveAssetSrc(src)} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
            : <OffthreadVideo src={resolveAssetSrc(src)} startFrom={sourceStart} volume={mutePresenterVisual ? 0 : 1} style={{width: '100%', height: '100%', objectFit: 'cover'}} />
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

const Scene = ({scene, presenters, presenterSpine, fps, presentationMode, qualityPolicy}) => {
  const frame = useCurrentFrame();
  const intro = interpolate(frame, [0, 7], [0, 1], {extrapolateRight: 'clamp'});
  const lift = interpolate(frame, [0, 10], [34, 0], {extrapolateRight: 'clamp'});
  const common = {opacity: intro, transform: 'translateY(' + lift + 'px)'};

  if (scene.type === 'hook') {
    return (
      <AbsoluteFill style={common}>
        {scene.media ? <AbsoluteFill>{mediaNode(scene.media, qualityPolicy)}</AbsoluteFill> : null}
        <Presenter scene={scene} presenters={presenters} presenterSpine={presenterSpine} fps={fps} presentationMode={presentationMode} qualityPolicy={qualityPolicy} />
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
        <Presenter scene={scene} presenters={presenters} presenterSpine={presenterSpine} fps={fps} presentationMode={presentationMode} qualityPolicy={qualityPolicy} />
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

  if (scene.type === 'broll_overlay') {
    return (
      <AbsoluteFill style={common}>
        <Presenter
          scene={{...scene, presenter: {...(scene.presenter || {}), mode: scene.presenter?.mode || 'full'}}}
          presenters={presenters}
          presenterSpine={presenterSpine}
          fps={fps}
          presentationMode={presentationMode}
          qualityPolicy={qualityPolicy}
        />
        {scene.kicker ? (
          <div style={{
            position:'absolute', top:170, left:70, zIndex:20,
            padding:'10px 16px', borderRadius:999,
            background:'rgba(7,8,10,.82)', border:'1px solid rgba(255,255,255,.15)',
            fontSize:21, fontWeight:900, letterSpacing:'.08em'
          }}>{scene.kicker}</div>
        ) : null}
        <div style={{
          position:'absolute',
          left:52,right:52,bottom:285,
          height:610,
          borderRadius:32,
          overflow:'hidden',
          zIndex:18,
          border:'2px solid rgba(255,255,255,.22)',
          boxShadow:'0 28px 90px rgba(0,0,0,.55)',
          background:'#0b0b0d'
        }}>
          {mediaNode(scene.media, qualityPolicy)}
          <div style={{position:'absolute',inset:0,background:'linear-gradient(180deg,transparent 50%,rgba(5,6,9,.74) 100%)'}} />
          {scene.overlayText ? (
            <div style={{position:'absolute',left:28,right:28,bottom:26,fontSize:34,fontWeight:950,lineHeight:1.05,textTransform:'uppercase'}}>
              {scene.overlayText}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    );
  }

  if (scene.type === 'media') {
    return (
      <AbsoluteFill style={common}>
        <AbsoluteFill>{mediaNode(scene.media, qualityPolicy)}</AbsoluteFill>
        <Presenter scene={scene} presenters={presenters} presenterSpine={presenterSpine} fps={fps} presentationMode={presentationMode} qualityPolicy={qualityPolicy} />
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
        <Presenter scene={scene} presenters={presenters} presenterSpine={presenterSpine} fps={fps} presentationMode={presentationMode} qualityPolicy={qualityPolicy} />
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
        <Presenter scene={scene} presenters={presenters} presenterSpine={presenterSpine} fps={fps} presentationMode={presentationMode} qualityPolicy={qualityPolicy} />
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
        <div style={{position:'absolute',top:190,left:70,right:70,fontSize:24,fontWeight:900,letterSpacing:'.10em'}}>HOW BRIGHTON BROKE THE DEFENCE</div>
        <div style={{
          position:'absolute',
          top:300,
          left:165,
          width:750,
          height:1110,
          border:'6px solid rgba(255,255,255,.86)',
          borderRadius:26,
          background:'linear-gradient(180deg,#177a43,#105d35)',
          boxShadow:'0 30px 80px rgba(0,0,0,.38)',
          overflow:'hidden'
        }}>
          {/* halfway line */}
          <div style={{position:'absolute',left:0,right:0,top:'50%',height:5,background:'rgba(255,255,255,.78)'}} />
          {/* centre circle */}
          <div style={{position:'absolute',left:'50%',top:'50%',width:190,height:190,transform:'translate(-50%,-50%)',border:'5px solid rgba(255,255,255,.78)',borderRadius:'50%'}} />
          <div style={{position:'absolute',left:'50%',top:'50%',width:12,height:12,transform:'translate(-50%,-50%)',background:'rgba(255,255,255,.88)',borderRadius:'50%'}} />
          {/* top penalty area + six-yard box + goal */}
          <div style={{position:'absolute',left:'50%',top:0,width:430,height:185,transform:'translateX(-50%)',border:'5px solid rgba(255,255,255,.78)',borderTop:'none'}} />
          <div style={{position:'absolute',left:'50%',top:0,width:220,height:82,transform:'translateX(-50%)',border:'5px solid rgba(255,255,255,.78)',borderTop:'none'}} />
          <div style={{position:'absolute',left:'50%',top:-17,width:150,height:22,transform:'translateX(-50%)',border:'5px solid rgba(255,255,255,.88)',background:'rgba(255,255,255,.06)'}} />
          {/* bottom penalty area + six-yard box + goal */}
          <div style={{position:'absolute',left:'50%',bottom:0,width:430,height:185,transform:'translateX(-50%)',border:'5px solid rgba(255,255,255,.78)',borderBottom:'none'}} />
          <div style={{position:'absolute',left:'50%',bottom:0,width:220,height:82,transform:'translateX(-50%)',border:'5px solid rgba(255,255,255,.78)',borderBottom:'none'}} />
          <div style={{position:'absolute',left:'50%',bottom:-17,width:150,height:22,transform:'translateX(-50%)',border:'5px solid rgba(255,255,255,.88)',background:'rgba(255,255,255,.06)'}} />

          {/* attacking lanes / pressing arrows */}
          {[
            {l:145,t:790,w:220,r:-68},
            {l:360,t:805,w:220,r:-90},
            {l:575,t:790,w:220,r:-112},
          ].map((a,i)=>(
            <div key={'a'+i} style={{
              position:'absolute',left:a.l,top:a.t,width:a.w,height:13,
              background:'#ff4350',borderRadius:8,
              transform:'rotate('+a.r+'deg)',transformOrigin:'left center',
              boxShadow:'0 0 18px rgba(255,67,80,.5)'
            }}>
              <div style={{position:'absolute',right:-3,top:-12,width:0,height:0,borderTop:'18px solid transparent',borderBottom:'18px solid transparent',borderLeft:'28px solid #ff4350'}} />
            </div>
          ))}

          {labels.map((label,i)=> {
            const positions=[
              {left:40,top:700},{right:40,top:700},{left:40,top:420},{right:40,top:420}
            ];
            return <div key={label} style={{
              position:'absolute',
              ...positions[i],
              width:245,
              padding:'17px 14px',
              borderRadius:16,
              background:'rgba(6,8,12,.86)',
              borderLeft:'7px solid '+(i<3?'#5be5ff':'#ff4350'),
              fontSize:24,
              fontWeight:950,
              textAlign:'center'
            }}>{label}</div>;
          })}
        </div>
        <div style={{position:'absolute',left:90,right:90,bottom:165,fontSize:32,fontWeight:900,lineHeight:1.12,textAlign:'center'}}>{scene.body || ''}</div>
      </AbsoluteFill>
    );
  }

  if (scene.type === 'quote') {
    return (
      <AbsoluteFill style={common}>
        {scene.media ? <AbsoluteFill>{mediaNode(scene.media, qualityPolicy)}</AbsoluteFill> : null}
        <Presenter scene={scene} presenters={presenters} presenterSpine={presenterSpine} fps={fps} presentationMode={presentationMode} qualityPolicy={qualityPolicy} />
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
      <Presenter scene={scene} presenters={presenters} presenterSpine={presenterSpine} fps={fps} presentationMode={presentationMode} qualityPolicy={qualityPolicy} />
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

const VisualCue = ({cue, qualityPolicy}) => {
  const src = cue.asset_url || cue.assetUrl;
  if (!src) return null;
  const kind = /\.(mp4|webm|mov)(?:\?|$)/i.test(src) ? 'video' : 'image';
  const node = mediaNode({kind, src, volume: 0}, qualityPolicy);
  const lowerOverlay = cue.layout === 'LOWER_OVERLAY' || cue.visual_type === 'BROLL_OVERLAY';

  if (lowerOverlay) {
    return (
      <div style={{
        position:'absolute',
        left:52,
        right:52,
        bottom:300,
        height:610,
        zIndex:22,
        borderRadius:32,
        overflow:'hidden',
        border:'2px solid rgba(255,255,255,.22)',
        boxShadow:'0 28px 90px rgba(0,0,0,.58)',
        background:'#0b0b0d'
      }}>
        {node}
        <div style={{position:'absolute',inset:0,background:'linear-gradient(180deg,transparent 58%,rgba(5,6,9,.62) 100%)'}} />
      </div>
    );
  }

  return (
    <AbsoluteFill style={{zIndex:4}}>
      {node}
      <AbsoluteFill style={{background:'linear-gradient(180deg,rgba(4,6,10,.05),rgba(4,6,10,.18) 60%,rgba(4,6,10,.45))'}} />
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
  const outroHoldSec = config.outroHoldSec ?? 1.5;
  const storyDurationSec = config.durationSec || 0;
  const presentationMode = config.presentationMode || 'AVATAR';

  if (qualityPolicy === 'PRODUCTION' && presentationMode === 'AVATAR' && config.presenterSpine?.required && !config.presenterSpine?.src) {
    throw new Error('DSN production render blocked: AVATAR presenter spine is required but missing');
  }
  if (qualityPolicy === 'PRODUCTION' && presentationMode === 'VOICEOVER_BROLL' && !config.audio?.voiceoverSrc) {
    throw new Error('DSN production render blocked: VOICEOVER_BROLL requires an approved voiceoverSrc');
  }
  if (qualityPolicy === 'PRODUCTION' && presentationMode === 'PETER_REAL' && !config.presenterSpine?.src) {
    throw new Error('DSN production render blocked: PETER_REAL requires Peter real-camera presenterSpine.src');
  }
  if (qualityPolicy === 'PRODUCTION' && presentationMode === 'PETER_REAL' && config.presenterSpine?.provider !== 'REAL_CAMERA') {
    throw new Error('DSN production render blocked: PETER_REAL presenter spine must use REAL_CAMERA');
  }
  return (
    <AbsoluteFill style={{background: BG, color: WHITE, fontFamily: 'Arial, Helvetica, sans-serif', overflow: 'hidden'}}>
      <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(circle at 80% 8%, rgba(215,25,32,.22), transparent 30%), linear-gradient(160deg,#15161a 0%,#08090b 58%,#111216 100%)'}} />

      {['AVATAR','PETER_REAL'].includes(presentationMode) && config.presenterSpine?.continuousVisual && config.presenterSpine?.src ? (
        <OffthreadVideo
          src={resolveAssetSrc(config.presenterSpine.src)}
          volume={0}
          style={{
            position:'absolute',
            inset:0,
            width:'100%',
            height:'100%',
            objectFit:'cover',
            zIndex:1
          }}
        />
      ) : null}
      <div style={{
        position:'absolute',
        top:58,
        left:46,
        zIndex:80,
        width:150,
        height:158,
        filter:'drop-shadow(0 10px 24px rgba(0,0,0,.48))'
      }}>
        <Img
          src={staticFile('brand/dsn-logo-official.jpg')}
          style={{width:'100%',height:'100%',objectFit:'contain'}}
        />
      </div>

      {(config.visualCueSheet?.visual_cues || [])
        .filter((cue) => (cue.asset_url || cue.assetUrl) && ['BROLL','BROLL_OVERLAY','QUOTE'].includes(cue.visual_type))
        .map((cue, i) => (
          <Sequence
            key={'visual-cue-' + i}
            from={Math.max(0, Math.round((cue.start || 0) * fps))}
            durationInFrames={Math.max(1, Math.round(((cue.end || 0) - (cue.start || 0)) * fps))}
          >
            <VisualCue cue={cue} qualityPolicy={qualityPolicy} />
          </Sequence>
        ))}

      {(config.scenes || []).map((scene) => (
        <Sequence
          key={scene.id}
          from={Math.round(scene.start * fps)}
          durationInFrames={Math.round(scene.duration * fps)}
        >
          <Scene
            scene={scene}
            presenters={config.presenters}
            presenterSpine={config.presenterSpine}
            fps={fps}
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

      {config.presenterSpine?.continuousAudio && config.presenterSpine?.src ? (
        <Audio
          src={resolveAssetSrc(config.presenterSpine.audioSrc || config.presenterSpine.src)}
          volume={config.presenterSpine.volume ?? 1}
        />
      ) : null}
      {config.audio?.voiceoverSrc ? (
        <Audio src={resolveAssetSrc(config.audio.voiceoverSrc)} volume={config.audio.voiceoverVolume ?? 1} />
      ) : null}
      {config.audio?.musicSrc ? (
        <Audio src={resolveAssetSrc(config.audio.musicSrc)} volume={config.audio.musicVolume ?? 0.10} />
      ) : null}

      {outroHoldSec > 0 ? (
        <Sequence from={Math.max(0, Math.round(storyDurationSec * fps))} durationInFrames={Math.max(1, Math.round(outroHoldSec * fps))}>
          <BrandedEndCard brand="DSN" />
        </Sequence>
      ) : null}

      <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, background: 'rgba(255,255,255,.09)', zIndex: 90}}>
        <div style={{height: '100%', width: '100%', background: RED}} />
      </div>
    </AbsoluteFill>
  );
};
