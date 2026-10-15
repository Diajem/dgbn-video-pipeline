# Video Studio presenter modes

The Studio now has three production modes: Faceless, Presenter / avatar recording, and Real camera recording. Existing projects default to Faceless.

For either presenter mode, upload one continuous MP4, WebM or MOV recording with spoken audio matching the script. Review it and mark it approved before a final export. No paid avatar generation is triggered by this change.

Split the script into scenes and choose presenter, B-roll, or picture-in-picture for each scene. B-roll and picture-in-picture require a scene image or clip. Presenter-only scenes need no additional media. The video and its audio continue from the start of the recording; hiding the presenter does not restart narration. Captions and scene boundaries use estimated timing based on the script and recording duration, not transcription alignment.

Outputs remain 1080×1920, with the existing DGBN/DSN treatment and end cards. Landscape output, direct HeyGen generation, automatic transcription alignment, and the richer DSN score/tactics scene editor are subsequent stages.

Changing the script resets audio and presenter review. Split the new script again and upload or review the matching recording.

## Unscripted real-camera recording

Select **Real camera recording**, then **Use recording without script**. Studio makes one continuous presenter scene. Upload a camera video with an audio track, review it, mark it approved and render. The finished video retains the camera audio and brand overlays, without generated captions. For scene changes, captions or B-roll timed to the spoken words, provide a matching script and split it into scenes. Choosing the script-free option clears the previous script and storyboard and resets recording approval.

Validation: node --test studio/tests/presenter.test.mjs
