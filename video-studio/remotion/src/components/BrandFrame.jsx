import React from 'react';
import {AbsoluteFill} from 'remotion';

export const BrandFrame = ({children, vertical = false}) => (
  <AbsoluteFill
    style={{
      background: 'linear-gradient(135deg, #050505 0%, #161616 58%, #291b00 100%)',
      color: '#fff',
      fontFamily: 'Arial, Helvetica, sans-serif',
      padding: vertical ? 64 : 72,
      overflow: 'hidden',
    }}
  >
    <div style={{position: 'absolute', top: 0, left: 0, right: 0, height: 12, background: '#d7a62a'}} />
    <div style={{position: 'absolute', top: vertical ? 54 : 42, right: vertical ? 54 : 72, fontWeight: 900, letterSpacing: 3, fontSize: vertical ? 34 : 30}}>
      DGBN
    </div>
    {children}
  </AbsoluteFill>
);
