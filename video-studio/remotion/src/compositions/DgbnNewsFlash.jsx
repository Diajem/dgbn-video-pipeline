import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {BrandFrame} from '../components/BrandFrame.jsx';

export const DgbnNewsFlash = ({job, storyIndex = 0}) => {
  const frame = useCurrentFrame();
  const story = job.stories[storyIndex];
  const y = interpolate(frame, [0, 18], [90, 0], {extrapolateRight: 'clamp'});
  return (
    <BrandFrame vertical>
      <div style={{marginTop: 230, transform: `translateY(${y}px)`}}>
        <div style={{display: 'inline-block', background: '#d7a62a', color: '#050505', fontSize: 34, fontWeight: 900, padding: '12px 20px'}}>NEWS FLASH</div>
        <div style={{fontSize: 70, lineHeight: 1.02, fontWeight: 900, marginTop: 38}}>{story.headline}</div>
        <div style={{fontSize: 35, lineHeight: 1.4, opacity: .84, marginTop: 42}}>{story.callout}</div>
        <div style={{height: 620, marginTop: 55, borderRadius: 30, border: '2px solid rgba(215,166,42,.55)', background: 'rgba(255,255,255,.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, opacity: .6, textAlign: 'center', padding: 60}}>
          Presenter/B-roll vertical composition area
        </div>
      </div>
      <div style={{position: 'absolute', bottom: 70, left: 64, right: 64, fontSize: 27, fontWeight: 800, borderTop: '2px solid rgba(215,166,42,.5)', paddingTop: 22}}>Our People. Our Story. Our Own Way.</div>
    </BrandFrame>
  );
};
