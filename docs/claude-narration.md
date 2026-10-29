# Use the same voices from Claude and other production tools

## Where it runs

This is a local CPU voice engine on the Windows production PC. Video Studio's existing local server supplies its browser interface. A separate always-on voice server, paid host or GPU is not required. The PC must be on to generate new speech; previously generated WAV/MP3 files remain ordinary audio files usable by any editor or avatar tool that accepts supplied audio.

The samples generated in ChatGPT were made in ChatGPT's temporary working environment. They do not mean the voice engine is already installed on the user's PC. The source update must be checked out and the one-time installer completed there. No YouTube uploads or existing edits are changed by installation.

## One installation

1. Open the updated `Diajem/dgbn-video-pipeline` folder on the PC. The source changes are tracked in PR #27 (`codex/pocket-tts-three-voices`); until merged, use that branch. Preserve local work when updating; do not reset or clean an existing working copy.
2. Keep the authorised `model.safetensors` and private `diajem-narration-voices.zip` in Downloads. Run **Install Narration Voices.bat** from that folder. Reuse these exact assets; no Hugging Face login or model download is needed for generation.
3. With FFmpeg installed for the video pipeline, run `npm run voice -- --status`. All three voices and both styles should report ready. Restart an existing Studio only after its current renders finish.

The normal narration service is local to the PC. Do not enable remote access or expose the Studio port to the internet just to connect another agent on the same computer.

## Claude Code / local production agents

Open this repository in Claude Code. The root `CLAUDE.md` points to these instructions. Claude can then call the shared command without a running Studio:

```powershell
# Original story sound, using the saved Jane voice
npm run --silent voice -- --script "C:\Stories\Episode01\script.txt" --output "C:\Stories\Episode01\narration-jane-take1.wav" --voice jane --style natural

# Approved clearer news sound, using Charles
npm run --silent voice -- --script "C:\News\bulletin-body.txt" --output "C:\News\charles-take1.wav" --voice charles --style news
```

Paths above are examples: use the actual production folders. Choose a new output name for a new take. The command never overwrites an existing WAV or its JSON sidecar. It returns JSON containing the audio path, narrator, style, duration and DRAFT status. The sidecar contains the original script, hash, sentence timing, engine standard and style version. Feed the WAV into the existing video edit, caption/timing workflow or supported avatar lip-sync input. Check the audio before approving a finished video.

From a different production repository, call the installed command with the pipeline's actual absolute path:

```powershell
node "C:\Actual\dgbn-video-pipeline\scripts\pocket_tts\narrate.mjs" --script "C:\Stories\Episode01\script.txt" --output "C:\Stories\Episode01\take2.wav" --voice carabau --style natural
```

The script locates its own engine and private asset folder, independent of the caller's working directory. It uses this repository's `.venv-voice` automatically. Optional `POCKET_TTS_PYTHON` and `POCKET_TTS_ASSETS` point to an already installed shared environment or private asset folder. Run one synthesis job at a time on the CPU.

For an episode with persistent voice/style selection, use:

```powershell
npm run storyhouse:voice -- --project "C:\Stories\Episode01" --voice jane --style natural
```

The episode folder contains `script.txt`; output and selections are recorded in `episode.json` and its `audio` folder. Subsequent unchanged runs reuse the take. Style, voice or script changes generate a new take. Prior takes are retained. For longer productions, split into chapter scripts and use the existing chapter workflow.

## Studio / chapter pipeline

In Video Studio's Narration panel, choose Carabau, Charles or Jane, then **Story / natural** or **News / approved clarity**, and generate. The same command powers both styles. A style, voice or script change requires generating and listening to the new take before approval. Chapter briefs can set `meta.narrationStyle` or per-chapter `narrationStyle`, alongside `narrator`, when using `build --voice pocket`.

With avatar intro/outro clips, the bulletin script is only the body. The saved clips provide their own opening/closing audio. Use the selected prepared voice for new avatar audio when that tool supports it; this integration does not generate talking-avatar video itself.

## Claude in a browser / on another machine

A normal cloud conversation cannot call a private PC just because the user is signed into Claude. Either run the production work through a local agent with file/command access to this installation, or generate the WAV on the PC and attach it to the cloud production task. No Claude account, API key, MCP connection or remote hosting has been created by this change.
