# Narration voices for videos and stories

The Video Studio now offers three saved narrator choices: **Carabau**, **Charles** (male preset), and **Jane** (female preset). Choose a narrator in the Narration panel, generate, listen, then approve the audio. Selecting a different voice makes an existing Pocket TTS narration a draft; it does not silently replace it or approve a new take.

The same narration endpoint feeds ordinary video projects and the chapter-based story/documentary workflow. Every generated WAV follows the existing approved-audio export path into Remotion. It does not require a GPU, a paid voice API, or a separate hosted service.

## Approved Carabau settings

The standard is recorded in `config/narration-voices.json`: original reference trimmed to the first 12.5 seconds, temperature 0.3, independent sentence takes with seed `320 + sentence index`, 220 ms pauses, and fixed +5 dB gain (reduced only if necessary to prevent clipping). There is no time stretching, reverb, denoising, or dynamic normalisation. Only spoken input substitutes `Benin` with `Bee-nin` and `Oba` with `Urba`; the project script and captions keep their correct spelling.

Charles and Jane use local voice states prepared from synthetic samples of Kyutai's public Charles/Jane presets, with the same sentence handling. They are stock voices; no additional personal voice recording is required. The pack's `voice-provenance.json` records their source and preparation. Their initial gain is 0 dB. They are available for listening/review once their assets are installed; the software does not treat an untested preset as an approved production take.

## One-time local setup

For Claude Code and any other local production tool, see [the shared narration command](claude-narration.md). The Studio, Storyhouse and standalone `npm run voice` command use the same engine and assets. Choose `natural` for the original story sound or `news` for the approved lighter Charles news treatment. The latter applies the audition's light bass/presence EQ, static loudness match and transient peak protection with FFmpeg, without changing speed. Style/version metadata travels with generated audio; switching styles invalidates Studio approval.

On the Windows PC, keep the existing authorised `model.safetensors` in Downloads, download the private `diajem-narration-voices.zip` alongside it, and run **Install Narration Voices.bat** from the updated repository. The installer creates a local Python environment, imports all three voices, and uses the model already downloaded. Then restart the Studio. Its normal launcher detects that Python environment automatically.

For manual setup, use Python 3.10–3.14 and the CPU build of PyTorch:

```powershell
python -m venv .venv-voice
.venv-voice\Scripts\python -m pip install -r scripts\pocket_tts\requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu
```

The assets stay in the ignored `runtime-assets/pocket-tts/` directory:

```text
model.safetensors
tokenizer.json
voices/carabau.wav
voices/charles.safetensors
voices/jane.safetensors
```

Reuse the authorised model already downloaded to the PC and the original Carabau reference. The supplied voice pack includes the tokenizer, trimmed Carabau recording, and Charles/Jane synthetic references and voice states. Manual pack import needs no Hugging Face connection:

```powershell
.venv-voice\Scripts\python scripts\pocket_tts\setup.py --pack "$env:USERPROFILE\Downloads\diajem-narration-voices.zip"
```

Alternatively, on a computer where Hugging Face downloads are allowed, install the official original Charles/Jane preset embeddings (audition these separately, since their reference differs from the supplied pack):

```powershell
.venv-voice\Scripts\python scripts\pocket_tts\setup.py --model "$env:USERPROFILE\Downloads\model.safetensors" --carabau "C:\DGBN\presenter-packs\peter\voice\reference.wav" --download-presets
$env:POCKET_TTS_PYTHON = "$PWD\.venv-voice\Scripts\python.exe"
npm run studio
```

The example Carabau path must point to the existing private recording on that computer. `--download-presets` downloads only the official public Charles/Jane embeddings and tokenizer through the normal Hugging Face client. It never creates an account, accepts terms, prints credentials, changes network settings, or downloads the restricted model automatically. Where network policy prevents downloads, provide authorised local files with `--tokenizer`, `--charles`, and `--jane` instead.

Set `POCKET_TTS_ASSETS` to use an existing private asset folder, and `POCKET_TTS_PYTHON` to the Python executable with the dependencies. The status endpoint reports each voice separately. A missing voice fails explicitly; it never switches to another speaker or a paid provider.

Keep model files, recordings, and preset embeddings out of Git. Record the voice/model licensing attribution required by Kyutai and each preset's source in production credits; source references are Kyutai's [Pocket TTS](https://github.com/kyutai-labs/pocket-tts) and [voice repository](https://huggingface.co/kyutai/tts-voices).

## Story and documentary chapters

In a chapter brief, set a shared narrator or override it for individual chapters:

```json
{
  "meta": {"title": "Storyhouse episode", "narrator": "carabau"},
  "chapters": [
    {"n": 1, "narrator": "jane", "title": "The arrival", "scenes": []},
    {"n": 2, "narrator": "charles", "title": "The letter", "scenes": []}
  ]
}
```

Use `npm run doc -- --dir <story-folder> build --voice pocket`. The existing workflow still supplies the visual plan and chapter fields. The builder remembers each chapter's chosen narrator and regenerates when that choice changes. Listening approval remains required before a final render.

## Checks

```sh
python -m unittest discover -s scripts/pocket_tts -p 'test_*.py'
npm run test:documentary
node --test studio/tests/*.test.mjs
```

`python scripts/pocket_tts/engine.py --status` performs a local readiness check without model downloads or synthesis. Generation is serialized by the Studio because Pocket TTS is not thread-safe.
