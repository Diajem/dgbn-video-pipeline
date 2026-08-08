# Avatar service boundary

The video pipeline must not depend directly on one avatar model. This folder defines a stable adapter contract so MuseTalk, JoyVASA/FasterLivePortrait, SoulX-FlashHead or another commercially suitable open-source backend can be benchmarked and swapped without changing Remotion jobs.

## Planned request

```json
{
  "presenterId": "peet",
  "profile": "peet-standard-news",
  "sourceImage": "presenters/peet/master.png",
  "audioPath": "work/audio/job.wav",
  "motionStyle": "standard-news",
  "outputPath": "work/avatar/job.mp4"
}
```

## Required output qualities

- stable identity
- accurate lip sync
- natural blinking and head movement
- usable upper-body motion where supported
- no frame drift during long narration
- deterministic output dimensions and frame rate
- commercial-use licensing reviewed before production

The first benchmark will use 30-second and 60-second clips for Peet before an engine is selected.
