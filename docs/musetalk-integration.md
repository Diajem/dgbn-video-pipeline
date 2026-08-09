# MuseTalk 1.5 integration

MuseTalk is the first real lip-sync baseline for DGBN. It is installed outside this public repository and called through `avatar-service/backends/musetalk.mjs`.

## Why 25 FPS
The official project recommends 25 FPS input because that matches training. The pipeline converts the curated master still into a stable 25 FPS source video before inference.

## Production-machine flow (Windows)
1. Extract the private presenter packs and set `PRESENTER_PACKS_ROOT`.
2. Run `npm run prepare:presenters`.
3. Run `scripts/setup/setup-musetalk-windows.ps1` in PowerShell.
4. Set `MUSE_TALK_HOME` and `MUSE_TALK_PYTHON`.
5. Run `npm run avatar:musetalk:source:peet`.
6. Run `npm run avatar:musetalk:preflight`.
7. Run `npm run avatar:musetalk:benchmark:peet`.
8. Inspect lip sync, glasses, beard, face stability and crop before promoting the backend.

## Benchmark policy
Start with a 12-second Peet/Peter clip. If it passes, extend to 30 seconds and then 60 seconds. This avoids spending GPU time on an unsuitable face/crop configuration.

## Pass criteria
- recognizably stable Peet identity
- accurate lip timing
- no severe mouth/teeth artifacts
- glasses remain stable
- beard/lip boundary does not shimmer excessively
- no major frame drift
- output is accepted by the Remotion presenter slot

If MuseTalk passes lip timing but lacks enough natural head or upper-body movement, retain MuseTalk for the mouth-sync layer and add JoyVASA/FasterLivePortrait as the motion layer.
