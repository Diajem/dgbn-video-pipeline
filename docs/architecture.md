# Architecture v0.1

## Intake lanes

1. Scheduled newsroom cycles (3 per day)
2. Breaking-news jobs outside scheduled cycles
3. Human-presenter uploads for cleanup/B-roll/text/graphics
4. Paste-script / paste-URL quick production
5. Documentary and evergreen history production

All lanes normalize to the same production manifest.

## Rendering path

```text
verified production manifest
        |
        +--> narration / human audio
        |
        +--> avatar-service (when presenter.mode=avatar)
        |
        +--> Hyperframes motion-graphic clips
        |
        '--> Remotion master composition
                 |
                 '--> FFmpeg delivery variants
                        16:9 / 9:16 / 1:1
```

## Breaking news

Breaking news is not bound to the three daily newsroom times. It enters through an event/condition watcher, passes verification and duplication checks, then creates a `breaking-news` manifest. Sensitive topics require human approval before publishing.

## Human presenter

A recorded human-presenter video bypasses avatar generation. The transcript still drives B-roll search, lower thirds, captions, data callouts, scene changes and long-to-short extraction.

## Phase 1 definition of done

- manifest validator passes
- Remotion Studio opens
- sample bulletin renders 16:9
- first story renders 9:16 as news flash
- first story renders 9:16 as news card
- avatar output path can replace PresenterSlot
- Hyperframes environment passes `doctor`
