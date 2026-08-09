# Avatar service boundary

The video pipeline does not depend directly on one avatar model. This layer provides a stable adapter contract so MuseTalk, JoyVASA/FasterLivePortrait, SoulX-FlashHead or another commercially suitable backend can be benchmarked and swapped without changing Remotion jobs.

## First production backend

MuseTalk 1.5 is the first real lip-sync baseline. The adapter lives at `avatar-service/backends/musetalk.mjs`.

The pipeline converts a curated presenter master still into a stable 25 FPS source video, clips a short benchmark audio segment, writes the MuseTalk inference YAML, performs a CUDA/model preflight and then invokes MuseTalk v1.5.

## First benchmark

Peet/Peter is the first presenter. Start with a 12-second test; only after face identity, glasses, beard and lip timing pass should the test be extended to 30-60 seconds.

```bash
npm run avatar:musetalk:source:peet
npm run avatar:musetalk:preflight
npm run avatar:musetalk:benchmark:peet
```

## Required output qualities

- stable identity
- accurate lip sync
- stable glasses and beard boundaries
- natural enough facial motion for newsroom use
- no severe mouth/teeth artifacts
- no major frame drift during longer narration
- deterministic output dimensions and frame rate
- commercial-use licensing reviewed before production

MuseTalk provides the lip-sync baseline. If it passes timing but lacks natural head/upper-body motion, the next enhancement layer is JoyVASA/FasterLivePortrait plus MuseTalk rather than replacing the entire pipeline.
