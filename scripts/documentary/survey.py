"""Step 2: search Commons for images and footage, and make contact sheets to pick from."""
import os
import commons, graphics, media, plan
from workdir import load_json, save_json


def _index(wd, name): return wd.path("survey", name), load_json(wd.path("survey", name), {})


def _searches(wd, chapters, extra):
    """(key, query) pairs: every 'commons' visual in the brief, plus key=query extras from the command line."""
    for ch in chapters:
        for si, sc in enumerate(ch["scenes"]):
            for vi, v in enumerate(sc.get("visuals", [])):
                if v["t"] == "commons": yield plan.survey_key(ch["n"], si, vi), v["q"], False
    for arg in extra:
        key, _, q = arg.partition("=")
        if not q: raise SystemExit(f"extra searches are key=query, got {arg!r}")
        yield key.strip(), q.strip(), True


def images(wd, chapters, extra=(), redo=False):
    wd.dir("survey")
    path, index = _index(wd, "images.json")
    empty = []
    for key, q, forced in _searches(wd, chapters, extra):
        if not (forced or redo) and index.get(key, {}).get("results"): continue
        try: res = commons.search_images(q)
        except RuntimeError as e: print(key, "SEARCH FAILED", e, flush=True); continue
        index[key] = {"q": q, "results": res}
        save_json(path, index)  # saved after every search so an interrupted survey resumes where it stopped
        if res: graphics.image_sheet(key, q, res, wd.path("survey", key + ".jpg"))
        else: empty.append(key)
        print(f"{key}: {len(res)} results for {q!r}", flush=True)
    if empty: print("No results for:", ", ".join(empty), "- retry with simpler words, e.g. doc.py survey", f"{empty[0]}=\"<simpler query>\"")


def sheets(wd, prefix="", rebuild_all=False):
    """Rebuild contact sheets that came out blank because thumbnails were rate-limited."""
    for name, kind in (("images.json", "img"), ("videos.json", "vid")):
        _, index = _index(wd, name)
        for key, v in index.items():
            if not key.startswith(prefix) or not v["results"]: continue
            out = wd.path("survey", (key if kind == "img" else "v_" + key) + ".jpg")
            if not rebuild_all and not graphics.is_blank(out): continue
            (graphics.image_sheet if kind == "img" else graphics.video_sheet)(key, v["q"], v["results"], out)
            print("rebuilt", os.path.basename(out), flush=True)


def videos(wd, extra):
    wd.dir("survey")
    path, index = _index(wd, "videos.json")
    for key, q, _ in _searches(wd, [], extra):
        res = commons.search_videos(q)
        index[key] = {"q": q, "results": res}
        save_json(path, index)
        if res: graphics.video_sheet(key, q, res, wd.path("survey", "v_" + key + ".jpg"))
        print(f"{key}: {len(res)} videos for {q!r}", flush=True)


def footage(wd, key, idx):
    """Download one Commons video (720p WebM transcode) into footage/ and return its path."""
    index = load_json(wd.path("survey", "videos.json"), {})
    if key not in index or idx >= len(index[key]["results"]): raise SystemExit(f"No video {key}:{idx} in survey/videos.json; run vsurvey first")
    r = index[key]["results"][idx]
    return commons.download(r["src"], os.path.join(wd.dir("footage"), f"{key}_{idx}.webm"))


def fetch(wd, refs):
    """Download videos and make a timestamped frame sheet of each, to choose clip start times."""
    for ref in refs:
        key, _, idx = ref.rpartition(":")
        f = footage(wd, key, int(idx))
        out = wd.path("survey", f"vf_{key}_{idx}.jpg")
        media.frame_sheet(f, out, count=20)
        print(f"{ref}: {os.path.getsize(f) // 1_000_000} MB, {media.duration(f):.1f}s, frames in {out}", flush=True)


def clips(wd, force=False):
    """Cut every Commons clip in plan.json from its downloaded footage."""
    p = load_json(wd.path("plan.json"), {})
    for name, spec in p.get("clips", {}).items():
        if "from" not in spec: continue
        out = plan.clip_file(wd, name, spec)
        if os.path.exists(out) and not force: continue
        key, _, idx = spec["from"].rpartition(":")
        media.cut(footage(wd, key, int(idx)), out, spec["start"], spec["duration"], width=int(spec.get("width", 1920)))
        print(f"clip {name}: {spec['duration']}s from {spec['from']} at {spec['start']}s", flush=True)
