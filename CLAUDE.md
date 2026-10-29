# Shared narration for Diajem productions

Read `docs/claude-narration.md` before producing narration. The same local Pocket TTS engine serves Video Studio, Diajem Storyhouse, Claude Code and other local production agents. Use its installed Carabau, Charles and Jane assets; do not substitute a provider or recreate a voice from an audition MP3.

Use `npm run voice -- --status` to check installation. Use `npm run voice -- --script <absolute-text-path> --output <absolute-new-WAV-path> --voice <carabau|charles|jane> --style <natural|news>`. Storyhouse episodes also use `npm run storyhouse:voice`. Natural preserves the approved story sound; news applies the approved Charles clarity treatment. Generated audio is a draft until listened to.

If avatar clips provide the opening and closing, the main narration script contains only the bulletin body. DGBN and DSN use separate scripts and presenter assignments. DSN means Diajem Sports Networks and covers general sports worldwide, not only football or African/Black sports. Its opening is “Welcome to Diajem Sports Networks. My name is [presenter].” Presenter examples are Peter, Dave and Aisha. DGBN assignments: usually Peet for Africa, Alisha for the Caribbean, and Peter/Alisha/Denise for Diaspora; Denise may become the regular Diaspora presenter. Voice IDs and presenter identities are separate choices; retain each project's explicit selection.

Keep canonical `Diajem` spelling: Charles's original DGBN pronunciation was approved. Keep scripts/captions correctly spelled while the engine handles the approved spoken Benin/Oba dictionary. Keep private model, reference and preset files out of Git. Do not replace this pack with different canonical preset embeddings: they would change the approved sound.
