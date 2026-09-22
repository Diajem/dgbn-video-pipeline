import React from 'react';
import {Composition, Still} from 'remotion';
import sampleJob from '../../../jobs/samples/dgbn-2026-08-05-evening.json';
import {DgbnBulletin} from './compositions/DgbnBulletin.jsx';
import {DgbnNewsFlash} from './compositions/DgbnNewsFlash.jsx';
import {DgbnNewsCard} from './compositions/DgbnNewsCard.jsx';
import {DsnShortMaster} from './compositions/DsnShortMaster.jsx';
import {CinematicStoryMaster} from './compositions/CinematicStoryMaster.jsx';
import {DsnThumbnailMaster} from './compositions/DsnThumbnailMaster.jsx';
import dsnShortConfig from '../../../jobs/samples/dsn-short-master-v1.json';
import cinematicConfig from '../../../jobs/samples/cinematic-story-master-v1.json';
import dsnThumbnailConfig from '../../../jobs/samples/dsn-thumbnail-master-v1.json';

const FPS = 30;

export const DgbnRoot = () => (
  <>
    <Composition
      id="DGBNBulletin16x9"
      component={DgbnBulletin}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={FPS * 151.5}
      defaultProps={{job: sampleJob}}
    />
    <Composition
      id="DGBNNewsFlash9x16"
      component={DgbnNewsFlash}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={FPS * 46.5}
      defaultProps={{job: sampleJob, storyIndex: 0}}
    />
    <Composition
      id="DSNShortMaster9x16"
      component={DsnShortMaster}
      width={1080}
      height={1920}
      fps={dsnShortConfig.fps || FPS}
      durationInFrames={(dsnShortConfig.fps || FPS) * dsnShortConfig.durationSec}
      defaultProps={{config: dsnShortConfig}}
      calculateMetadata={({props}) => {
        const fps = props?.config?.fps || FPS;
        const durationSec = props?.config?.durationSec || dsnShortConfig.durationSec;
        const narrationTailSec = props?.config?.narrationTailSec ?? 0.4;
        const outroHoldSec = props?.config?.outroHoldSec ?? 1.5;
        return {durationInFrames: Math.max(1, Math.round(fps * (durationSec + narrationTailSec + outroHoldSec))), fps};
      }}
    />
    <Composition
      id="CinematicStoryMaster9x16"
      component={CinematicStoryMaster}
      width={1080}
      height={1920}
      fps={cinematicConfig.fps || FPS}
      durationInFrames={(cinematicConfig.fps || FPS) * Math.ceil((cinematicConfig.targetDurationSec || 30) + (cinematicConfig.outroHoldSec ?? 1.5))}
      defaultProps={{config: cinematicConfig}}
      calculateMetadata={({props}) => {
        const fps = props?.config?.fps || FPS;
        const durationSec = props?.config?.targetDurationSec || cinematicConfig.targetDurationSec || 30;
        const outroHoldSec = props?.config?.outroHoldSec ?? 1.5;
        return {durationInFrames: Math.max(1, Math.round(fps * (durationSec + outroHoldSec))), fps};
      }}
    />
    <Composition
      id="CinematicStoryMaster16x9"
      component={CinematicStoryMaster}
      width={1920}
      height={1080}
      fps={cinematicConfig.fps || FPS}
      durationInFrames={(cinematicConfig.fps || FPS) * Math.ceil((cinematicConfig.targetDurationSec || 30) + (cinematicConfig.outroHoldSec ?? 1.5))}
      defaultProps={{config: {...cinematicConfig, aspectRatio: '16:9'}}}
      calculateMetadata={({props}) => {
        const fps = props?.config?.fps || FPS;
        const durationSec = props?.config?.targetDurationSec || cinematicConfig.targetDurationSec || 30;
        const outroHoldSec = props?.config?.outroHoldSec ?? 1.5;
        return {durationInFrames: Math.max(1, Math.round(fps * (durationSec + outroHoldSec))), fps};
      }}
    />
    <Still
      id="DSNThumbnail9x16"
      component={DsnThumbnailMaster}
      width={1080}
      height={1920}
      defaultProps={{config: {...dsnThumbnailConfig, aspectRatio:'9:16'}}}
    />
    <Still
      id="DSNThumbnail16x9"
      component={DsnThumbnailMaster}
      width={1280}
      height={720}
      defaultProps={{config: {...dsnThumbnailConfig, aspectRatio:'16:9'}}}
    />
    <Composition
      id="DGBNNewsCard9x16"
      component={DgbnNewsCard}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={FPS * 13.5}
      defaultProps={{job: sampleJob, storyIndex: 0}}
    />
  </>
);
