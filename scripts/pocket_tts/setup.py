"""Install private/local assets; optional official public preset download."""
import argparse
from pathlib import Path
import shutil
import wave
from engine import asset_root, registry, status

VOICE_REVISION = "a7056f505a4a8ca72d8b5fb1440071d6f1a35739"
TOKENIZER_REVISION = "00eac05ed3d16bdc3f6b5d598874019c34a89214"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path)
    parser.add_argument("--tokenizer", type=Path)
    parser.add_argument("--carabau", type=Path)
    parser.add_argument("--charles", type=Path)
    parser.add_argument("--jane", type=Path)
    parser.add_argument("--pack", type=Path, help="Import the private narration voice pack")
    parser.add_argument("--download-presets", action="store_true", help="Download official public presets and tokenizer using the normal Hugging Face client")
    args = parser.parse_args()
    target = asset_root()
    (target / "voices").mkdir(parents=True, exist_ok=True)
    if args.pack:
        import zipfile
        allowed = {"tokenizer.json", "voice-provenance.json", "voices/carabau.wav", "voices/charles.wav", "voices/jane.wav",
                   "voices/charles.safetensors", "voices/jane.safetensors"}
        with zipfile.ZipFile(args.pack) as archive:
            total = 0
            for info in archive.infolist():
                if info.filename not in allowed:
                    continue
                total += info.file_size
                if info.file_size > 20 * 1024 * 1024 or total > 50 * 1024 * 1024:
                    raise SystemExit("Voice pack exceeds the supported asset size.")
                (target / info.filename).write_bytes(archive.read(info))
    # Reuse the already-downloaded model on Windows without another account flow.
    model = args.model or Path.home() / "Downloads/model.safetensors"
    for source, name in [(model, "model.safetensors"), (args.tokenizer, "tokenizer.json"),
                         (args.charles, "voices/charles.safetensors"), (args.jane, "voices/jane.safetensors")]:
        if source and source.is_file() and source.resolve() != (target / name).resolve():
            shutil.copyfile(source, target / name)
        elif source and not source.is_file() and source != model:
            raise SystemExit(f"Asset file not found: {source}")
    if args.carabau:
        with wave.open(str(args.carabau), "rb") as src:
            if (src.getnchannels(), src.getsampwidth(), src.getframerate()) != (1, 2, 24000):
                raise SystemExit("Use the original mono, 16-bit, 24 kHz Carabau reference.")
            if src.getnframes() < 12.5 * 24000:
                raise SystemExit("The Carabau reference needs at least 12.5 seconds.")
            params = src.getparams()
            frames = src.readframes(300000)
        with wave.open(str(target / "voices/carabau.wav"), "wb") as out:
            out.setparams(params)
            out.writeframes(frames)
    if args.download_presets:
        from huggingface_hub import hf_hub_download
        for voice in registry()["voices"]:
            if voice["kind"] == "preset":
                source = hf_hub_download("kyutai/pocket-tts-without-voice-cloning",
                    f"languages/english_2026-10/embeddings/{voice['id']}.safetensors", revision=VOICE_REVISION)
                shutil.copyfile(source, target / voice["asset"])
        if not (target / "tokenizer.json").is_file():
            source = hf_hub_download("kyutai/pocket-tts-without-voice-cloning",
                "languages/english/tokenizer.json", revision=TOKENIZER_REVISION)
            shutil.copyfile(source, target / "tokenizer.json")
    import json
    result = status()
    print(json.dumps(result, indent=2))
    if not all(voice["ready"] for voice in result["voices"]):
        raise SystemExit(2)


if __name__ == "__main__":
    main()
