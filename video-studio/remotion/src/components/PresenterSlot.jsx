import React from 'react';

export const PresenterSlot = ({presenter = 'peet'}) => (
  <div style={{position: 'absolute', left: 80, top: 155, width: 690, height: 760, border: '2px solid rgba(215,166,42,.7)', borderRadius: 28, background: 'linear-gradient(160deg,#252525,#090909)', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
    <div>
      <div style={{fontSize: 52, fontWeight: 900, textTransform: 'uppercase'}}>{presenter}</div>
      <div style={{fontSize: 24, opacity: .7, marginTop: 12}}>Avatar output slot</div>
      <div style={{fontSize: 18, opacity: .45, marginTop: 8}}>Lip-sync / body-motion MP4 will replace this panel</div>
    </div>
  </div>
);
