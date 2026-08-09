import base64
import glob
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

import runpod
from huggingface_hub import hf_hub_download

MUSE_ROOT = Path(os.environ.get("MUSE_TALK_HOME", "/opt/MuseTalk"))
CACHE_ROOT = Path("/runpod-volume/huggingface-cache/hub/models--TMElyralab--MuseTalk/snapshots")


def _decode(payload: str, target: Path):
    target.write_bytes(base64.b64decode(payload))


def _encode(source: Path) -> str:
    return base64.b64encode(source.read_bytes()).decode("ascii")


def _latest_mp4(root: Path):
    files = [Path(p) for p in glob.glob(str(root / "**" / "*.mp4"), recursive=True)]
    if not files:
        return None
    return max(files, key=lambda p: p.stat().st_mtime)


def _ensure_main_weights():
    target = MUSE_ROOT / "models" / "musetalkV15"
    unet = target / "unet.pth"
    config = target / "musetalk.json"
    if unet.is_file() and config.is_file():
        return {"source": "local", "path": str(target)}

    target.mkdir(parents=True, exist_ok=True)

    # Preferred: RunPod cached model mounted under /runpod-volume.
    if CACHE_ROOT.exists():
        snapshots = sorted(
            [p for p in CACHE_ROOT.iterdir() if p.is_dir()],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        for snapshot in snapshots:
            cached_unet = snapshot / "musetalkV15" / "unet.pth"
            cached_config = snapshot / "musetalkV15" / "musetalk.json"
            if cached_unet.is_file() and cached_config.is_file():
                for source, dest in ((cached_unet, unet), (cached_config, config)):
                    if dest.exists() or dest.is_symlink():
                        dest.unlink()
                    try:
                        dest.symlink_to(source)
                    except OSError:
                        shutil.copy2(source, dest)
                return {"source": "runpod-cache", "path": str(snapshot)}

    # Fallback for the first test if model caching was not configured yet.
    hf_hub_download(
        repo_id="TMElyralab/MuseTalk",
        filename="musetalkV15/unet.pth",
        local_dir=str(MUSE_ROOT / "models"),
    )
    hf_hub_download(
        repo_id="TMElyralab/MuseTalk",
        filename="musetalkV15/musetalk.json",
        local_dir=str(MUSE_ROOT / "models"),
    )
    return {"source": "huggingface-fallback", "path": str(target)}


def _runtime_info():
    check = subprocess.run(
        ["python", "-c", "import torch; print(torch.__version__); print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NO_CUDA')"],
        text=True,
        capture_output=True,
    )
    lines = check.stdout.strip().splitlines() if check.returncode == 0 else []
    return {
        "python_ok": check.returncode == 0,
        "torch": lines[0] if len(lines) > 0 else None,
        "cuda": lines[1] if len(lines) > 1 else None,
        "gpu": lines[2] if len(lines) > 2 else None,
    }


def handler(job):
    data = job.get("input", {})

    if data.get("healthcheck"):
        return {"ok": True, "service": "dgbn-musetalk", "runtime": _runtime_info()}

    video_b64 = data.get("video_b64")
    audio_b64 = data.get("audio_b64")
    task_id = data.get("task_id", "dgbn-avatar")
    bbox_shift = data.get("bbox_shift")

    if not video_b64 or not audio_b64:
        return {"error": "video_b64 and audio_b64 are required"}

    weight_info = _ensure_main_weights()

    with tempfile.TemporaryDirectory(prefix="dgbn-musetalk-") as tmp:
        tmp = Path(tmp)
        video = tmp / "source.mp4"
        audio = tmp / "audio.wav"
        config = tmp / "inference.yaml"
        results = tmp / "results"
        results.mkdir(parents=True, exist_ok=True)

        _decode(video_b64, video)
        _decode(audio_b64, audio)

        lines = [
            "task_0:",
            f'  video_path: "{video.as_posix()}"',
            f'  audio_path: "{audio.as_posix()}"',
        ]
        if bbox_shift is not None:
            lines.append(f"  bbox_shift: {int(bbox_shift)}")
        config.write_text("\n".join(lines) + "\n", encoding="utf-8")

        command = [
            "python",
            "-m",
            "scripts.inference",
            "--inference_config",
            str(config),
            "--result_dir",
            str(results),
            "--unet_model_path",
            str(MUSE_ROOT / "models" / "musetalkV15" / "unet.pth"),
            "--unet_config",
            str(MUSE_ROOT / "models" / "musetalkV15" / "musetalk.json"),
            "--version",
            "v15",
        ]

        process = subprocess.run(command, cwd=MUSE_ROOT, text=True, capture_output=True)

        if process.returncode != 0:
            return {
                "error": "MuseTalk inference failed",
                "exit_code": process.returncode,
                "weights": weight_info,
                "stderr": process.stderr[-6000:],
                "stdout": process.stdout[-3000:],
            }

        output = _latest_mp4(results)
        if output is None:
            return {
                "error": "MuseTalk finished but no MP4 was found",
                "weights": weight_info,
                "stdout": process.stdout[-3000:],
            }

        return {
            "task_id": task_id,
            "filename": f"{task_id}.mp4",
            "video_b64": _encode(output),
            "bytes": output.stat().st_size,
            "weights": weight_info,
            "stdout_tail": process.stdout[-1500:],
        }


runpod.serverless.start({"handler": handler})
