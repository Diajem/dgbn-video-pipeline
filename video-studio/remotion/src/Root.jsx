import React from 'react';
import {Composition} from 'remotion';
import sampleJob from '../../../jobs/samples/dgbn-2026-08-05-evening.json';
import {DgbnBulletin} from './compositions/DgbnBulletin.jsx';
import {DgbnNewsFlash} from './compositions/DgbnNewsFlash.jsx';
import {DgbnNewsCard} from './compositions/DgbnNewsCard.jsx';

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
