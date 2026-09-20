import React from 'react';
import {
  AbsoluteFill,
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

const mediaNode = (media) => {
  if (!media?.src) {
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
        Rights-cleared media slot
      </div>
    );
  }
  if (media.kind === 'video' || /\.(mp4|webm|mov)$/i.test(media.src)) {
    return <OffthreadVideo src={media.src} style={{width: '100%', height: '100%', objectFit: 'cover'}} />;
  }
  return <Img src={media.src} style={{width: '100%', height: '100%', objectFit: 'cover'}} />;
};

const Presenter = ({scene, presenters}) => {
  const pRef = scene.presenter;
  if (!pRef || pRef.mode === 'off') return null;
  const profile = presenters?.[pRef.id] || {};
  const src = pRef.src || profile.src;
  const mode = pRef.mode || 'lower-third';

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

const Scene = ({scene, presenters}) => {
  const frame = useCurrentFrame();
  const intro = interpolate(frame, [0, 7], [0, 1], {extrapolateRight: 'clamp'});
  const lift = interpolate(frame, [0, 10], [34, 0], {extrapolateRight: 'clamp'});
  const common = {opacity: intro, transform: 'translateY(' + lift + 'px)'};

  if (scene.type === 'hook') {
    return (
      <AbsoluteFill style={common}>
        {scene.media ? <AbsoluteFill>{mediaNode(scene.media)}</AbsoluteFill> : null}
        <Presenter scene={scene} presenters={presenters} />
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
            {mediaNode(scene.media)}
          </div>
        ) : null}
        <Presenter scene={scene} presenters={presenters} />
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
        <AbsoluteFill>{mediaNode(scene.media)}</AbsoluteFill>
        <Presenter scene={scene} presenters={presenters} />
        {scene.kicker ? <div style={{position: 'absolute', top: 195, left: 70, zIndex: 12, fontSize: 24, fontWeight: 850, letterSpacing: '.08em'}}>{scene.kicker}</div> : null}
        <Headline text={scene.headline} accent={scene.accent} />
      </AbsoluteFill>
    );
  }

  if (scene.type === 'stats') {
    return (
      <AbsoluteFill style={common}>
        <Presenter scene={scene} presenters={presenters} />
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
        <Presenter scene={scene} presenters={presenters} />
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

  if (scene.type === 'quote') {
    return (
      <AbsoluteFill style={common}>
        {scene.media ? <AbsoluteFill>{mediaNode(scene.media)}</AbsoluteFill> : null}
        <Presenter scene={scene} presenters={presenters} />
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
      <Presenter scene={scene} presenters={presenters} />
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
      <div style={{maxWidth: 930, padding: '17px 24px 19px', borderRadius: 20, background: 'rgba(6,7,9,.80)', textAlign: 'center', fontSize: 46, fontWeight: 950, lineHeight: 1.05, textTransform: 'uppercase'}}>
        {caption.text}
      </div>
    </div>
  );
};

export const DsnShortMaster = ({config}) => {
  const fps = config.fps || 30;
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
          <Scene scene={scene} presenters={config.presenters} />
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

      <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: 10, background: 'rgba(255,255,255,.09)', zIndex: 90}}>
        <div style={{height: '100%', width: '100%', background: RED}} />
      </div>
    </AbsoluteFill>
  );
};
