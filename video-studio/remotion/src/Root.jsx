import React from 'react';
import {Composition} from 'remotion';
import sampleJob from '../../../jobs/samples/dgbn-2026-08-05-evening.json';
import {DgbnBulletin} from './compositions/DgbnBulletin.jsx';
import {DgbnNewsFlash} from './compositions/DgbnNewsFlash.jsx';
import {DgbnNewsCard} from './compositions/DgbnNewsCard.jsx';
import {DsnShortMaster} from './compositions/DsnShortMaster.jsx';
import {CinematicStoryMaster} from './compositions/CinematicStoryMaster.jsx';
import dsnShortConfig from '../../../jobs/samples/dsn-short-master-v1.json';
import cinematicConfig from '../../../jobs/samples/cinematic-story-master-v1.json';

const FPS = 30;

export const DgbnRoot = () => (
  <>
    <Composition
      id="DGBNBulletin16x9"
      component={DgbnBulletin}
      width={1920}
      height={1080}
      fps={FPS}
      durationInFrames={FPS * 150}
      defaultProps={{job: sampleJob}}
    />
    <Composition
      id="DGBNNewsFlash9x16"
      component={DgbnNewsFlash}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={FPS * 45}
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
    />
    <Composition
      id="CinematicStoryMaster9x16"
      component={CinematicStoryMaster}
      width={1080}
      height={1920}
      fps={30}
      durationInFrames={30 * Math.ceil(cinematicConfig.targetDurationSec || 30)}
      defaultProps={{config: cinematicConfig}}
    />
    <Composition
      id="CinematicStoryMaster16x9"
      component={CinematicStoryMaster}
      width={1920}
      height={1080}
      fps={30}
      durationInFrames={30 * Math.ceil(cinematicConfig.targetDurationSec || 30)}
      defaultProps={{config: {...cinematicConfig, aspectRatio: '16:9'}}}
    />
    <Composition
      id="DGBNNewsCard9x16"
      component={DgbnNewsCard}
      width={1080}
      height={1920}
      fps={FPS}
      durationInFrames={FPS * 12}
      defaultProps={{job: sampleJob, storyIndex: 0}}
    />
  </>
);
