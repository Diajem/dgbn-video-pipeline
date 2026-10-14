# Video Studio presenter modes

The Studio now has three production modes: Faceless, Presenter / avatar recording, and Real camera recording. Existing projects default to Faceless.

For either presenter mode, upload one continuous MP4, WebM or MOV recording with spoken audio matching the script. Review it and mark it approved before a final export. No paid avatar generation is triggered by this change.

Split the script into scenes and choose presenter, B-roll, or picture-in-picture for each scene. B-roll and picture-in-picture require a scene image or clip. Presenter-only scenes need no additional media. The video and its audio continue from the start of the recording; hiding the presenter does not restart narration. Captions and scene boundaries use estimated timing based on the script and recording duration, not transcription alignment.

Outputs remain 1080×1920, with the existing DGBN/DSN treatment and end cards. Landscape output, direct HeyGen generation, automatic transcription alignment, and the richer DSN score/tactics scene editor are subsequent stages.

Changing the script resets audio and presenter review. Split the new script again and upload or review the matching recording.

Validation: node --test studio/tests/presenter.test.mjs
