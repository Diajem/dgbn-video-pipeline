import React from 'react';
import {AbsoluteFill, OffthreadVideo} from 'remotion';

export const PresenterSlot = ({presenter = 'peet', videoPath = null}) => (
  <div style={{position: 'absolute', left: 80, top: 155, width: 690, height: 760, border: '2px solid rgba(215,166,42,.7)', borderRadius: 28, background: 'linear-gradient(160deg,#252525,#090909)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
    {videoPath ? (
      <AbsoluteFill>
        <OffthreadVideo src={videoPath} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center'}} />
      </AbsoluteFill>
    ) : (
      <div>
        <div style={{fontSize: 52, fontWeight: 900, textTransform: 'uppercase'}}>{presenter}</div>
        <div style={{fontSize: 24, opacity: .7, marginTop: 12}}>Avatar output slot</div>
      </div>
    )}
  </div>
);
