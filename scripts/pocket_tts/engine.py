"""Offline, sentence-by-sentence narration shared by videos and story chapters."""
import argparse
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import sys
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[2]
REGISTRY = ROOT / "config/narration-voices.json"


def registry():
    return json.loads(REGISTRY.read_text(encoding="utf-8"))


def asset_root():
    return Path(os.environ.get("POCKET_TTS_ASSETS", ROOT / "runtime-assets/pocket-tts")).resolve()


def voice_profile(voice):
    for profile in registry()["voices"]:
        if profile["id"] == voice:
            return profile
    raise ValueError("Unknown narrator. Choose Carabau, Charles or Jane.")


def style_profile(style):
    for profile in registry()["styles"]:
        if profile["id"] == style:
            return profile
    raise ValueError("Unknown narration style. Choose natural or news.")


def finish_audio(source, output, style):
    """Apply only the explicitly selected, approved news treatment."""
    profile = style_profile(style)
    if style == "natural":
        shutil.copyfile(source, output)
        return {}
    executable = shutil.which("ffmpeg")
    if not executable:
        raise ValueError("FFmpeg is needed for the news clarity style. Install FFmpeg or select natural.")

    def run(args):
        try:
            return subprocess.run([executable, "-hide_banner", "-nostats", *args],
                                  capture_output=True, text=True, check=True, timeout=180)
        except (subprocess.SubprocessError, OSError) as exc:
            raise ValueError("News clarity processing failed; the previous narration was kept.") from exc

    def measure(file):
        result = run(["-i", str(file), "-af", "loudnorm=I=-18:TP=-1.5:LRA=11:print_format=json", "-f", "null", "-"])
        matches = re.findall(r'\{[^{}]*"input_i"[^{}]*\}', result.stderr, re.S)
        if not matches:
            raise ValueError("Could not measure narration loudness.")
        info = json.loads(matches[-1])
        loudness = float(info["input_i"])
        if not math.isfinite(loudness):
            raise ValueError("Narration has no measurable speech.")
        return loudness

    import tempfile
    with tempfile.TemporaryDirectory(prefix="pocket-news-") as folder:
        equalized = Path(folder) / "equalized.wav"
        run(["-v", "error", "-y", "-i", str(source), "-af", profile["ffmpegFilter"], "-c:a", "pcm_f32le", str(equalized)])
        gain = measure(source) - measure(equalized)
        treatment = (f'volume={gain:.3f}dB,alimiter=limit={profile["peakLimit"]}'
                     ':level=false:attack=5:release=50:latency=true')
        run(["-v", "error", "-y", "-i", str(equalized), "-af", treatment, "-c:a", "pcm_s16le", str(output)])
    return {"clarityGainDb": round(gain, 3)}


def sentences(text):
    """Preserve sentences, splitting very long ones at a clause/word boundary."""
    text = str(text).strip()
    if not text or len(text) > 20000:
        raise ValueError("Narration needs between 1 and 20,000 characters.")
    result = []
    for paragraph in re.split(r"\n+", text):
        for sentence in re.split(r"(?<=[.!?])\s+(?=[\w\"'“])", paragraph.strip()):
            words = sentence.split()
            while len(words) > 40:
                split = next((i for i in range(35, 14, -1) if words[i-1].endswith((",", ";", ":"))), 35)
                result.append(" ".join(words[:split]))
                words = words[split:]
            if words:
                result.append(" ".join(words))
    return result


def spoken_text(text):
    for word, pronunciation in registry()["pronunciations"].items():
        text = re.sub(r"\b" + re.escape(word) + r"\b", pronunciation, text, flags=re.IGNORECASE)
    return text


def status():
    config = registry()
    assets = asset_root()
    runtime = all(importlib.util.find_spec(name) is not None for name in ("pocket_tts", "torch", "numpy", "yaml", "scipy"))
    common = [name for name in ("model.safetensors", "tokenizer.json") if not (assets / name).is_file()]
    voices = []
    for voice in config["voices"]:
        missing = common + ([] if (assets / voice["asset"]).is_file() else [voice["asset"]])
        voices.append({"id": voice["id"], "label": voice["label"], "gender": voice["gender"],
                       "ready": runtime and not missing, "missingAssets": missing})
    return {"runtimeReady": runtime, "defaultVoice": config["defaultVoice"],
            "standardVersion": config["standardVersion"], "voices": voices,
            "styles": [{"id": p["id"], "label": p["label"], "version": p["version"],
                        "ready": p["id"] == "natural" or shutil.which("ffmpeg") is not None}
                       for p in config["styles"]]}


def render(text, voice, output, style="natural"):
    config = registry()
    profile = voice_profile(voice)
    treatment = style_profile(style)
    if style == "news" and not shutil.which("ffmpeg"):
        raise ValueError("Install FFmpeg to use the news clarity style.")
    pieces = sentences(text)
    ready = next(v for v in status()["voices"] if v["id"] == voice)
    if not ready["ready"]:
        raise ValueError("Narrator is not installed. Run the Pocket TTS setup for this computer.")
    # Generation is entirely local. Downloads are a separate explicit setup step.
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
    import numpy as np
    import pocket_tts
    from pocket_tts import TTSModel
    import scipy.io.wavfile
    import torch
    import yaml

    assets = asset_root()
    model_config = yaml.safe_load((Path(pocket_tts.__file__).parent / "config/english_2026-10.yaml").read_text())
    model_config["weights_path"] = str(assets / "model.safetensors")
    model_config["weights_path_without_voice_cloning"] = None
    model_config["flow_lm"]["lookup_table"]["tokenizer_path"] = str(assets / "tokenizer.json")
    # Do not write a shared mutable config while another process is starting.
    import tempfile
    with tempfile.TemporaryDirectory(prefix="pocket-narration-") as temp:
        local_config = Path(temp) / "config.yaml"
        local_config.write_text(yaml.safe_dump(model_config), encoding="utf-8")
        model = TTSModel.load_model(config=str(local_config), temp=config["temperature"])
    state = model.get_state_for_audio_prompt(assets / profile["asset"])
    rate = model.sample_rate
    parts, timings = [], []
    cursor = 0
    gap = np.zeros(round(config["sentencePauseSeconds"] * rate), dtype=np.float32)
    for index, original in enumerate(pieces):
        torch.manual_seed(config["seed"] + index)
        speech = spoken_text(original)
        audio = model.generate_audio(state, speech, max_tokens=100, copy_state=True).detach().cpu().numpy()
        if not np.isfinite(audio).all() or not np.any(audio):
            raise ValueError(f"Sentence {index + 1} produced invalid audio. Regenerate it before review.")
        threshold = max(0.0003, float(np.abs(audio).max()) * 0.008)
        active = np.flatnonzero(np.abs(audio) > threshold)
        if not len(active):
            raise ValueError(f"Sentence {index + 1} produced no speech.")
        lo = max(0, int(active[0]) - int(rate * 0.06))
        hi = min(len(audio), int(active[-1]) + int(rate * 0.12))
        audio = audio[lo:hi]
        # Flag runaway synthesis rather than automatically stretching or trimming speech.
        if len(audio) / rate > max(12, len(original.split()) * 1.25):
            raise ValueError(f"Sentence {index + 1} is unusually long. Review the text and regenerate.")
        peak = float(np.abs(audio).max())
        if peak > 0.95:
            audio = audio * (0.95 / peak)
        timings.append({"text": original, "spokenText": speech, "start": round(cursor / rate, 3),
                        "end": round((cursor + len(audio)) / rate, 3)})
        parts.append(audio)
        cursor += len(audio)
        if index < len(pieces) - 1:
            parts.append(gap)
            cursor += len(gap)
    audio = np.concatenate(parts)
    gain = min(10 ** (profile["gainDb"] / 20), 0.95 / float(np.abs(audio).max()))
    pcm = np.clip(audio * gain * 32767, -32767, 32767).astype(np.int16)
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Atomic publication: a failed generation cannot replace an earlier narration.
    temp_output = output.with_suffix(".part.wav")
    with tempfile.TemporaryDirectory(prefix="pocket-finish-") as folder:
        raw = Path(folder) / "raw.wav"
        scipy.io.wavfile.write(raw, rate, pcm)
        try:
            finishing = finish_audio(raw, temp_output, style)
            temp_output.replace(output)
        finally:
            temp_output.unlink(missing_ok=True)
    return {"seconds": len(pcm) / rate, "voiceId": voice, "standardVersion": config["standardVersion"],
            "styleId": style, "styleVersion": treatment["version"], **finishing,
            "scriptSha256": hashlib.sha256(text.encode()).hexdigest(), "sentences": timings,
            "gainDb": round(20 * math.log10(gain), 4)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--status", action="store_true")
    parser.add_argument("--output")
    args = parser.parse_args()
    if args.status:
        print(json.dumps(status()))
    else:
        request = json.load(sys.stdin)
        if not args.output:
            raise ValueError("An output WAV path is required.")
        print(json.dumps(render(request.get("text", ""), request.get("voice", "carabau"), args.output, request.get("style", "natural"))))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError) as exc:
        print(json.dumps({"error": str(exc)}), file=sys.stderr)
        sys.exit(1)
