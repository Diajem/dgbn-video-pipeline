"""The plan file: what goes on screen in each scene, in order.

plan.json
{
  "clips": {
    "oval_pair": {"from": "trumprama:1", "start": 12, "duration": 6, "label": "FILE FOOTAGE"},
    "wan_map":   {"file": "clips/wan_map.mp4", "ai": true},
    "own_clip":  {"file": "clips/own.mp4", "label": "FILE FOOTAGE", "credit": "...", "rightsNote": "..."}
  },
  "chapters": {
    "1": [ ["clip:oval_pair"], ["photo:q_union:0", "card:1"], ["photo:c1s2v0:?"] ]
  }
}

Items, one list per scene:
  card:<n>                    the n-th visual of that scene in chapters.json (must be a card)
  photo:<survey key>:<index>  a Commons image from survey/images.json; add "|ILLUSTRATIVE IMAGE" for a stand-in
  photo:<survey key>:?        not picked yet: build skips it and warns
  clip:<name>                 a clip defined under "clips"
"""
import os

LABELS = ["EDITORIAL IMAGE", "ILLUSTRATIVE IMAGE", "ILLUSTRATIVE FOOTAGE", "FILE FOOTAGE", "ARCHIVE", "AI-GENERATED ILLUSTRATION", "GRAPHIC"]
FOOTAGE_LABELS = ["FILE FOOTAGE", "ILLUSTRATIVE FOOTAGE", "ARCHIVE"]


def survey_key(n, si, vi): return f"c{n}s{si}v{vi}"


def parse(item):
    """Normalise a plan item to {'kind', 'ref', 'label'}; ref is an int for cards, (key, index or None) for photos."""
    if isinstance(item, dict):
        kind = next((k for k in ("card", "photo", "clip") if k in item), None)
        if not kind: raise ValueError(f"plan item needs card, photo or clip: {item}")
        text, label = f"{kind}:{item[kind]}", item.get("label")
    else:
        text, _, label = str(item).partition("|")
        label = label.strip() or None
    kind, _, ref = text.strip().partition(":")
    if label and label not in LABELS: raise ValueError(f"unknown label {label!r} in {item}")
    if kind == "card": return {"kind": "card", "ref": int(ref), "label": label}
    if kind == "photo":
        key, _, idx = ref.rpartition(":")
        if not key: raise ValueError(f"photo needs <survey key>:<index>: {item}")
        return {"kind": "photo", "ref": (key, None if idx == "?" else int(idx)), "label": label}
    if kind == "clip": return {"kind": "clip", "ref": ref, "label": label}
    raise ValueError(f"unknown plan item {item!r}")


def draft(chapters):
    """Starting plan straight from the brief: every card, and every Commons search left unpicked."""
    out = {"clips": {}, "chapters": {}}
    for ch in chapters:
        scenes = []
        for si, sc in enumerate(ch["scenes"]):
            items = []
            for vi, v in enumerate(sc.get("visuals", [])):
                if v["t"] == "card": items.append(f"card:{vi}")
                elif v["t"] == "commons": items.append(f"photo:{survey_key(ch['n'], si, vi)}:?")
            scenes.append(items)
        out["chapters"][str(ch["n"])] = scenes
    return out


def clip_file(wd, name, spec):
    return wd.path(spec["file"]) if "file" in spec else wd.path("clips", name + ".mp4")


def problems(wd, plan, images, videos, chapters=None):
    """Everything that would stop or weaken a build. Unpicked photos are reported but do not block."""
    errors, todo = [], []
    clips = plan.get("clips", {})
    for name, spec in clips.items():
        if "from" in spec:
            key, _, idx = str(spec["from"]).rpartition(":")
            if key not in videos or not idx.isdigit() or int(idx) >= len(videos[key]["results"]): errors.append(f"clip {name}: no video {spec['from']} in survey/videos.json")
            if spec.get("label") not in FOOTAGE_LABELS: errors.append(f"clip {name}: say what the footage is with label FILE FOOTAGE, ILLUSTRATIVE FOOTAGE or ARCHIVE")
            if "start" not in spec or "duration" not in spec: errors.append(f"clip {name}: needs start and duration (seconds)")
        elif "file" in spec:
            if not spec.get("ai") and (not spec.get("label") or not spec.get("credit") or not spec.get("rightsNote")):
                errors.append(f"clip {name}: own files need label, credit and rightsNote (or \"ai\": true for a labelled AI clip)")
        else: errors.append(f"clip {name}: needs \"from\" (Commons video) or \"file\"")
    for ch in chapters or wd.chapters:
        scenes = plan.get("chapters", {}).get(str(ch["n"]))
        if scenes is None: errors.append(f"chapter {ch['n']}: not in plan.json"); continue
        if len(scenes) != len(ch["scenes"]): errors.append(f"chapter {ch['n']}: plan has {len(scenes)} scenes, chapters.json has {len(ch['scenes'])}")
        for si, items in enumerate(scenes[:len(ch["scenes"])]):
            where = f"chapter {ch['n']} scene {si + 1}"
            if not items: todo.append(f"{where}: no picture (the previous one stays on screen)")
            for item in items:
                try: it = parse(item)
                except ValueError as e: errors.append(f"{where}: {e}"); continue
                if it["kind"] == "card":
                    vis = ch["scenes"][si].get("visuals", [])
                    if it["ref"] >= len(vis) or vis[it["ref"]]["t"] != "card": errors.append(f"{where}: {item} is not a card in chapters.json")
                elif it["kind"] == "photo":
                    key, idx = it["ref"]
                    if idx is None: todo.append(f"{where}: pick a photo for {key} (see survey/{key}.jpg)")
                    elif key not in images or idx >= len(images[key]["results"]): errors.append(f"{where}: {item} is not in survey/images.json")
                elif it["ref"] not in clips: errors.append(f"{where}: clip {it['ref']} is not defined under \"clips\"")
                else:
                    spec = clips[it["ref"]]
                    if not os.path.exists(clip_file(wd, it["ref"], spec)): todo.append(f"{where}: clip {it['ref']} not cut yet (run: doc.py clips)")
    return errors, todo
