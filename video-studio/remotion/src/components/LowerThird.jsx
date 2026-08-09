import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';

export const LowerThird = ({headline, callout}) => {
  const frame = useCurrentFrame();
  const x = interpolate(frame, [0, 12], [-110, 0], {extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 52, transform: `translateX(${x}px)`}}>
      <div style={{display: 'inline-block', background: '#d7a62a', color: '#050505', fontWeight: 900, fontSize: 28, padding: '12px 22px'}}>DIAJEM GLOBAL BLACK NEWS</div>
      <div style={{background: 'rgba(0,0,0,.86)', borderLeft: '8px solid #d7a62a', maxWidth: 1560, padding: '20px 28px'}}>
        <div style={{fontWeight: 900, fontSize: 44, lineHeight: 1.08}}>{headline}</div>
        {callout ? <div style={{marginTop: 10, fontSize: 25, opacity: .84}}>{callout}</div> : null}
      </div>
    </div>
  );
};
