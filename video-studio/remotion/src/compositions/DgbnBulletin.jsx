import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {BrandFrame} from '../components/BrandFrame.jsx';
import {LowerThird} from '../components/LowerThird.jsx';
import {PresenterSlot} from '../components/PresenterSlot.jsx';

const StoryPanel = ({story, presenter}) => (
  <BrandFrame>
    <PresenterSlot presenter={presenter} />
    <div style={{position: 'absolute', left: 840, right: 90, top: 205}}>
      <div style={{fontSize: 28, color: '#d7a62a', fontWeight: 800, letterSpacing: 2}}>{story.desk?.toUpperCase()}</div>
      <div style={{fontSize: 58, fontWeight: 900, lineHeight: 1.05, marginTop: 18}}>{story.headline}</div>
      <div style={{fontSize: 26, opacity: .72, marginTop: 30, lineHeight: 1.45}}>{story.narration}</div>
      <div style={{marginTop: 32, fontSize: 20, opacity: .45}}>B-roll queue: {story.visuals?.brollQueries?.slice(0, 2).join(' • ')}</div>
    </div>
    <LowerThird headline={story.lowerThird} callout={story.callout} />
  </BrandFrame>
);

export const DgbnBulletin = ({job}) => {
  const frame = useCurrentFrame();
  const storyFrames = 600;
  const index = Math.min(Math.floor(frame / storyFrames), job.stories.length - 1);
  return (
    <AbsoluteFill>
      {job.stories.map((story, i) => (
        <Sequence key={story.storyId} from={i * storyFrames} durationInFrames={storyFrames}>
          <StoryPanel story={story} presenter={job.presenter.id} />
        </Sequence>
      ))}
      <div style={{position: 'absolute', top: 38, left: 70, color: '#d7a62a', fontWeight: 900, fontSize: 22, letterSpacing: 2}}>
        EVENING BULLETIN • STORY {index + 1}/{job.stories.length}
      </div>
    </AbsoluteFill>
  );
};
