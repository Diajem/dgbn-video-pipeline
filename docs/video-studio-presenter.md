# Video Studio presenter modes

The Studio has three production modes: Faceless, Presenter / avatar recording, and Real camera recording. Existing projects default to Faceless.

For either presenter mode, upload one continuous MP4, WebM or MOV recording with spoken audio. Review it and mark it approved before a final export. No paid avatar generation is triggered.

## Output shape
Choose Vertical 9:16 (1080×1920) or Landscape 16:9 (1920×1080) per project. In landscape, a portrait recording sits whole on a blurred copy of itself; wide pictures fill the frame. Statistic and graphic cards are uploaded pictures, so make a 16:9 card for landscape projects.

## Script is optional
Press **Transcribe recording**. Speech-to-text (Whisper, running locally on this PC; installed on first use, a few hundred MB) produces the words with timings.
- With no script, the transcript becomes the script, split into scenes you can then assign to presenter, B-roll or picture-in-picture.
- With a script, its words are aligned onto the real speech.

Captions follow the actual spoken words, and scene changes land in the pauses between words. B-roll and picture-in-picture scenes still need a picture or clip you provide; presenter-only scenes need nothing extra. Hiding the presenter does not restart narration.

## Unscripted real-camera recording

Select **Real camera recording**, then **Use recording without script**. Studio makes one continuous presenter scene. Upload a camera video with an audio track, review it, mark it approved and render. The finished video retains the camera audio and brand overlays, without generated captions. For captions or B-roll timed to the spoken words, press **Transcribe recording** (or provide a matching script) and split into scenes. Choosing the script-free option clears the previous script and storyboard and resets recording approval.

## Rendering
Long camera files are slow to seek, so the first render makes a faster copy of the recording (one-off, several minutes). Later renders reuse it.

Changing the script resets audio and presenter review.

## Not yet
Direct HeyGen generation and the richer DSN score/tactics scene editor.

Validation: `node --test studio/tests/presenter.test.mjs studio/tests/transcript.test.mjs`
