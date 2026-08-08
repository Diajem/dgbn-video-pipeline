import React from 'react';
import {interpolate, useCurrentFrame} from 'remotion';
import {BrandFrame} from '../components/BrandFrame.jsx';

export const DgbnNewsCard = ({job, storyIndex = 0}) => {
  const frame = useCurrentFrame();
  const story = job.stories[storyIndex];
  const scale = interpolate(frame, [0, 20], [.93, 1], {extrapolateRight: 'clamp'});
  return (
    <BrandFrame vertical>
      <div style={{position: 'absolute', inset: 100, top: 280, transform: `scale(${scale})`, transformOrigin: 'center'}}>
        <div style={{fontSize: 30, color: '#d7a62a', fontWeight: 900, letterSpacing: 3}}>DGBN • {story.desk?.toUpperCase()}</div>
        <div style={{fontSize: 82, lineHeight: 1.01, fontWeight: 900, marginTop: 32}}>{story.headline}</div>
        <div style={{height: 620, marginTop: 60, borderRadius: 32, background: 'linear-gradient(145deg,#272727,#0b0b0b)', border: '2px solid rgba(215,166,42,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, textAlign: 'center', fontSize: 30, opacity: .65}}>Visual / image / map / motion-graphic slot</div>
        <div style={{fontSize: 36, fontWeight: 700, lineHeight: 1.35, marginTop: 54}}>{story.callout}</div>
      </div>
    </BrandFrame>
  );
};
