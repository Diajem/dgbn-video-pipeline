# Diajem Storyhouse narration

Storyhouse shares the local voice engine and private pack with Video Studio. The narrators are **Carabau** (default), **Charles** (male) and **Jane** (female). The production profile is `config/storyhouse-narration.json`; this is a Storyhouse audio entry point, independent of newsroom article dispatch or news branding.

After the [one-time voice setup](narration-voices.md), put an episode script in its own folder as `script.txt`, then generate:

```sh
npm run storyhouse:voice -- --project stories/my-episode --voice jane
```

The default sound is `natural`. Optional `--style news` selects the approved lighter news treatment, and the choice is saved per episode. Claude Code and other local production tools can use this command or the standalone [shared voice command](claude-narration.md); they do not need separate voice clones or subscriptions.

The command writes a new WAV in that episode's `audio/` folder and saves the chosen narrator and original script in `episode.json`. Use that WAV as the narration source in the existing Storyhouse edit or upload it into a Studio project. The audio is marked DRAFT for listening review.

To switch the same episode to the male preset:

```sh
npm run storyhouse:voice -- --project stories/my-episode --voice charles
```

Subsequent runs without `--voice` reuse that episode's saved choice. An unchanged script/voice reuses its existing recording; `--regenerate` explicitly requests a new take. New takes have unique filenames, and older recordings are retained. Failed generation preserves the existing episode manifest and audio.

For a script stored elsewhere, add `--script path/to/script.txt`. `--list-voices` shows installation readiness. The original spellings remain in scripts and captions; only spoken input uses the approved Bee-nin/Urba pronunciation guidance.

For chapter-based Storyhouse productions, the shared builder also accepts `meta.narrator` and per-chapter `narrator` overrides with `build --voice pocket`, as described in [Narration voices](narration-voices.md). This change prepares the local narration workflow; it does not claim to install anything on the user's PC or update a separate ChatGPT Project automatically.
