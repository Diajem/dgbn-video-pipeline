import React from 'react';
import {
  AbsoluteFill,
  Img,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {BrandFrame} from '../components/BrandFrame.jsx';
import {LowerThird} from '../components/LowerThird.jsx';
import {PresenterSlot} from '../components/PresenterSlot.jsx';
import {BrandedEndCard} from '../components/BrandedEndCard.jsx';

const mediaSrc = (value) => {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return staticFile(String(value).replace(/^\/+/, ''));
};

const storyWindow = (job, story, index) => {
  if (Number.isFinite(Number(story.startSec)) && Number.isFinite(Number(story.endSec))) {
    return {start: Number(story.startSec), end: Number(story.endSec)};
  }
  const defaultStorySec = Number(job.defaultStorySec || 20);
  return {start: index * defaultStorySec, end: (index + 1) * defaultStorySec};
};

const visualWindows = (job, story, storyIndex) => {
  const {start, end} = storyWindow(job, story, storyIndex);
  const assets = Array.isArray(story.visuals?.assets)
    ? story.visuals.assets
    : (story.visuals?.assetPaths || []).map((src) => ({src, kind: 'image'}));
  if (!assets.length) return [];
  const usableStart = start + Math.min(3, Math.max(0.5, (end - start) * 0.12));
  const usableEnd = Math.max(usableStart + 1, end - 1);
  const slot = Math.max(1.5, (usableEnd - usableStart) / assets.length);
  return assets.map((asset, index) => ({
    ...asset,
    startSec: Number.isFinite(Number(asset.startSec)) ? Number(asset.startSec) : usableStart + index * slot,
    endSec: Number.isFinite(Number(asset.endSec))
      ? Number(asset.endSec)
      : Math.min(usableEnd, usableStart + (index + 1) * slot),
  }));
};

const VisualOverlay = ({asset}) => {
  const src = mediaSrc(asset.src || asset.path);
  if (!src) return null;
  const isVideo = (asset.kind || '').toLowerCase() === 'video' || /\.(mp4|webm|mov)$/i.test(src);
  return (
    <AbsoluteFill style={{backgroundColor: '#050505'}}>
      {isVideo ? (
        <OffthreadVideo
          src={src}
          muted
          style={{width: '100%', height: '100%', objectFit: 'cover'}}
        />
      ) : (
        <Img
          src={src}
          style={{width: '100%', height: '100%', objectFit: 'cover'}}
        />
      )}
      {asset.credit ? (
        <div style={{
          position: 'absolute', right: 28, bottom: 26, maxWidth: 900,
          background: 'rgba(0,0,0,.62)', padding: '8px 12px', borderRadius: 8,
          fontSize: 18, color: 'rgba(255,255,255,.9)',
        }}>
          {asset.credit}
        </div>
      ) : null}
      {asset.label ? (
        <div style={{
          position: 'absolute', left: 52, top: 55,
          background: 'rgba(0,0,0,.74)', borderLeft: '5px solid #d7a62a',
          padding: '10px 16px', fontSize: 22, fontWeight: 800,
        }}>
          {asset.label}
        </div>
      ) : null}
    </AbsoluteFill>
  );
};

const PresenterFallback = ({story, presenter}) => (
  <BrandFrame>
    <PresenterSlot
      presenter={presenter}
      videoPath={story.presenterVideoPath || story.presenterVideo || undefined}
    />
    <div style={{position: 'absolute', left: 840, right: 90, top: 205}}>
      <div style={{fontSize: 28, color: '#d7a62a', fontWeight: 800, letterSpacing: 2}}>
        {story.desk?.toUpperCase()}
      </div>
      <div style={{fontSize: 58, fontWeight: 900, lineHeight: 1.05, marginTop: 18}}>
        {story.headline}
      </div>
    </div>
  </BrandFrame>
);

export const DgbnBulletin = ({job}) => {
  const frame = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const presenterMaster = mediaSrc(
    job.presenter?.masterVideoPath ||
    job.presenter?.presenterMasterPath ||
    job.presenterMasterPath
  );
  const stories = job.stories || [];
  const currentStoryIndex = Math.max(
    0,
    stories.findIndex((story, index) => {
      const {start, end} = storyWindow(job, story, index);
      const t = frame / fps;
      return t >= start && t < end;
    })
  );
  const currentStory = stories[currentStoryIndex] || stories[0];
  const outroFrames = Math.max(1, Math.round(fps * Number(job.outroHoldSec ?? 1.5)));

  return (
    <AbsoluteFill style={{backgroundColor: '#050505', color: 'white'}}>
      {presenterMaster ? (
        <AbsoluteFill>
          <OffthreadVideo
            src={presenterMaster}
            style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center'}}
          />
        </AbsoluteFill>
      ) : currentStory ? (
        <PresenterFallback story={currentStory} presenter={job.presenter?.id || 'peet'} />
      ) : null}

      {stories.flatMap((story, storyIndex) =>
        visualWindows(job, story, storyIndex).map((asset, assetIndex) => {
          const from = Math.max(0, Math.round(asset.startSec * fps));
          const duration = Math.max(1, Math.round((asset.endSec - asset.startSec) * fps));
          return (
            <Sequence
              key={`${story.storyId || storyIndex}-visual-${assetIndex}`}
              from={from}
              durationInFrames={duration}
            >
              <VisualOverlay asset={asset} />
            </Sequence>
          );
        })
      )}

      {currentStory ? (
        <LowerThird
          headline={currentStory.lowerThird || currentStory.headline}
          callout={currentStory.callout}
        />
      ) : null}

      <div style={{
        position: 'absolute', top: 38, left: 70,
        color: '#d7a62a', fontWeight: 900, fontSize: 22, letterSpacing: 2,
        textShadow: '0 2px 8px rgba(0,0,0,.8)',
      }}>
        {(job.edition || 'DGBN').toUpperCase()} BULLETIN
        {stories.length ? ` • STORY ${currentStoryIndex + 1}/${stories.length}` : ''}
      </div>

      <Sequence
        from={Math.max(0, durationInFrames - outroFrames)}
        durationInFrames={outroFrames}
      >
        <BrandedEndCard brand="DGBN" />
      </Sequence>
    </AbsoluteFill>
  );
};
