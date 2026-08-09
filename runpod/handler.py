import base64
import glob
import os
import subprocess
import tempfile
from pathlib import Path

import runpod

MUSE_ROOT = Path(os.environ.get("MUSE_TALK_HOME", "/opt/MuseTalk"))


def _decode(payload: str, target: Path):
    target.write_bytes(base64.b64decode(payload))


def _encode(source: Path) -> str:
    return base64.b64encode(source.read_bytes()).decode("ascii")


def _latest_mp4(root: Path):
    files = [Path(p) for p in glob.glob(str(root / "**" / "*.mp4"), recursive=True)]
    if not files:
        return None
    return max(files, key=lambda p: p.stat().st_mtime)


def handler(job):
    data = job.get("input", {})
    video_b64 = data.get("video_b64")
    audio_b64 = data.get("audio_b64")
    task_id = data.get("task_id", "dgbn-avatar")
    bbox_shift = data.get("bbox_shift")

    if not video_b64 or not audio_b64:
        return {"error": "video_b64 and audio_b64 are required"}

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

        process = subprocess.run(
            command,
            cwd=MUSE_ROOT,
            text=True,
            capture_output=True,
        )

        if process.returncode != 0:
            return {
                "error": "MuseTalk inference failed",
                "exit_code": process.returncode,
                "stderr": process.stderr[-6000:],
                "stdout": process.stdout[-3000:],
            }

        output = _latest_mp4(results)
        if output is None:
            return {
                "error": "MuseTalk finished but no MP4 was found",
                "stdout": process.stdout[-3000:],
            }

        return {
            "task_id": task_id,
            "filename": f"{task_id}.mp4",
            "video_b64": _encode(output),
            "bytes": output.stat().st_size,
            "stdout_tail": process.stdout[-1500:],
        }


runpod.serverless.start({"handler": handler})
