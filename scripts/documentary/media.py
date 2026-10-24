"""ffmpeg helpers: durations, 720p previews, frame sheets with timestamps, clip cutting and joining chapters."""
import os, subprocess, tempfile
from PIL import Image
import graphics


def run(*args): subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True)


def duration(f):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], capture_output=True, text=True, check=True).stdout
    return float(out.strip())


def stamp(t): return f"{int(t // 60)}:{t % 60:04.1f}"


def preview(src, out):
    os.makedirs(os.path.dirname(out), exist_ok=True)
    run("-i", src, "-vf", "scale=-2:720", "-c:v", "libx264", "-crf", "26", "-preset", "fast", "-c:a", "aac", "-b:a", "128k", out)


def frame_sheet(src, out, count=16, start=0.0, end=None):
    """Sheet of evenly spaced frames, each captioned with its timestamp, for checking a render or picking clip start times."""
    end = end or duration(src)
    step = max((end - start) / count, 0.5)
    frames = []
    with tempfile.TemporaryDirectory() as tmp:
        for i in range(count):
            t = start + i * step + step / 2
            if t >= end: break
            f = os.path.join(tmp, f"{i}.jpg")
            run("-ss", f"{t:.2f}", "-i", src, "-frames:v", "1", "-vf", "scale=480:-2", f)
            if os.path.exists(f): frames.append((Image.open(f).convert("RGB"), stamp(t)))
        os.makedirs(os.path.dirname(out), exist_ok=True)
        graphics.frame_grid(frames, out)


def cut(src, out, start, length, width=1920):
    """Cut a silent H.264 clip (narration carries the sound) scaled to the film width."""
    os.makedirs(os.path.dirname(out), exist_ok=True)
    run("-ss", str(start), "-t", str(length), "-i", src, "-an", "-vf", f"scale={width}:-2,fps=30", "-c:v", "libx264", "-crf", "20",
        "-preset", "medium", "-pix_fmt", "yuv420p", "-movflags", "+faststart", out)


def concat(files, out, list_file):
    """Join same-format chapter renders without re-encoding."""
    with open(list_file, "w", encoding="utf-8") as f:
        f.write("".join(f"file '{os.path.abspath(p).replace(os.sep, '/')}'\n" for p in files))
    run("-f", "concat", "-safe", "0", "-i", list_file, "-c", "copy", "-movflags", "+faststart", out)
