"""Step 4: build each chapter as a Studio project from chapters.json + plan.json. Resumable: finished steps are kept in state.json."""
import os
import commons, graphics, plan, studio
from workdir import load_json

VOICES = ("draft", "google", "none")


def card_note(wd, v):
    small = v.get("small", "")
    src = small.split("Source:", 1)[1].strip() if "Source:" in small else ""
    return "Made in-house by DGBN." + (f" Source: {src}" if src else " " + wd.meta.get("cardNote", "Figures as stated in the narration script."))


def create(wd, ch):
    meta = wd.meta
    p = studio.call("POST", "/api/projects", {"title": ch["title"], "brand": meta.get("brand", "DGBN"), "format": meta.get("format", "long"), "storyType": ch.get("storyType", "present")})
    pid = p["id"]
    script = "\n\n".join(s["text"].strip() for s in ch["scenes"])
    studio.call("PUT", f"/api/projects/{pid}", {"orientation": meta.get("orientation", "LANDSCAPE"), "format": meta.get("format", "long"),
                                                "storyType": ch.get("storyType", "present"), "script": script, "headline": ch["headline"]})
    p = studio.call("POST", f"/api/projects/{pid}/split", {})
    if len(p["scenes"]) != len(ch["scenes"]):
        raise SystemExit(f"Chapter {ch['n']}: the Studio split the script into {len(p['scenes'])} scenes, expected {len(ch['scenes'])}. "
                         "Each scene's text must be one paragraph without blank lines.")
    return pid


def set_part(wd, ch, pid):
    """Mark the chapter's place in the film so only the first gets the intro and only the last the outro and credits."""
    body = {"part": wd.part_of(ch["n"])}
    if body["part"] in ("only", "last"): body["extraCredits"] = list(wd.meta.get("extraCredits", []))
    studio.call("PUT", f"/api/projects/{pid}", body)


def clear(pid):
    """Remove every picture from a project (used by --rebuild after the plan changed)."""
    for s in studio.project(pid)["scenes"]:
        for a in s["assets"]: studio.call("DELETE", f"/api/projects/{pid}/scenes/{s['id']}/assets/{a['id']}")


def add_card(wd, pid, sid, ch, si, it):
    v = ch["scenes"][si]["visuals"][it["ref"]]
    name = f"c{ch['n']}s{si}v{it['ref']}"
    f = os.path.join(wd.dir("cards"), name + ".png")
    graphics.card(v, f, (1080, 1920) if wd.meta.get("orientation") == "PORTRAIT" else (1920, 1080))
    aid = studio.upload(pid, sid, f, name + "-card.png", "own")
    studio.set_asset(pid, sid, aid, label="GRAPHIC", rightsNote=card_note(wd, v), fit="fit", rights="cleared")
    return "card " + v.get("big", "")


def add_photo(wd, pid, sid, it, images):
    key, idx = it["ref"]
    r = images[key]["results"][idx]
    url = r["thumbUrl"] if "/thumb/" in r["thumbUrl"].split("?")[0] else commons.thumb(r["thumbUrl"], 1280)
    pr = studio.call("POST", f"/api/projects/{pid}/scenes/{sid}/assets", {"type": "commons", "url": url, "pageUrl": r["pageUrl"],
                     "credit": r["credit"], "licence": r["licence"], "title": r["title"]}, timeout=180)
    a = next(s for s in pr["scenes"] if s["id"] == sid)["assets"][-1]
    fields = {"label": it["label"]} if it["label"] else {}
    if a["rights"] != "cleared":
        if commons.licence_ok(r["licence"]): fields.update(rightsNote=f"Wikimedia Commons licence: {r['licence']} ({r['pageUrl']}).", rights="cleared")
        else: print(f"  NOTE: {r['title']} has licence {r['licence']!r}; left as needs permission. Pick another image if unsure.")
    if fields: studio.set_asset(pid, sid, a["id"], **fields)
    return f"photo {r['title'][:60]} ({r['licence']})"


def add_clip(wd, pid, sid, it, clips, videos):
    name, spec = it["ref"], clips[it["ref"]]
    f = plan.clip_file(wd, name, spec)
    if not os.path.exists(f): raise SystemExit(f"Clip {name} is missing ({f}). Run: doc.py clips")
    if spec.get("ai"):
        studio.upload(pid, sid, f, name + ".mp4", "ai")  # the Studio labels it AI-GENERATED ILLUSTRATION
        return f"clip {name} (AI-generated, labelled)"
    aid = studio.upload(pid, sid, f, name + os.path.splitext(f)[1], "other")
    if "from" in spec:
        key, _, idx = spec["from"].rpartition(":")
        r = videos[key]["results"][int(idx)]
        credit, note = spec.get("credit", r["credit"]), spec.get("rightsNote", f"Wikimedia Commons licence: {r['licence']}. {r['pageUrl']}")
        if not commons.licence_ok(r["licence"]) and "rightsNote" not in spec:
            print(f"  NOTE: {r['title']} has licence {r['licence']!r}; left as needs permission.")
            studio.set_asset(pid, sid, aid, label=it["label"] or spec["label"], credit=credit)
            return f"clip {name} (rights to check)"
    else: credit, note = spec["credit"], spec["rightsNote"]
    studio.set_asset(pid, sid, aid, label=it["label"] or spec["label"], credit=credit, rightsNote=note, rights="cleared")
    return f"clip {name}"


def voice(wd, ch, pid, kind):
    st = wd.state["chapters"][str(ch["n"])]
    if kind == "none" or st.get("voice") == kind: return
    if kind == "google":
        v = wd.meta.get("voice")
        if not v: raise SystemExit("Set meta.voice in chapters.json (a Google voice id, e.g. en-GB-Chirp3-HD-Charon) to use --voice google")
        studio.call("POST", f"/api/projects/{pid}/audio/google-voice", {"voice": v}, timeout=900)
    else: studio.call("POST", f"/api/projects/{pid}/audio/draft-voice", {}, timeout=300)
    st["voice"] = kind; wd.save_state()
    print(f"  narration: {kind} voice", flush=True)


def build(wd, ch, voice_kind="draft", rebuild=False):
    p = load_json(wd.path("plan.json"))
    if p is None: raise SystemExit("No plan.json yet. Run: doc.py plan")
    images = load_json(wd.path("survey", "images.json"), {})
    videos = load_json(wd.path("survey", "videos.json"), {})
    errors, todo = plan.problems(wd, p, images, videos, [ch])
    if errors: raise SystemExit("Fix plan.json first:\n  " + "\n  ".join(errors))
    for t in todo: print("  TODO", t)

    n = str(ch["n"])
    st = wd.state["chapters"].get(n)
    if not st:
        st = wd.state["chapters"][n] = {"pid": create(wd, ch), "done": {}}
        wd.save_state()
    pid = st["pid"]
    print(f"chapter {n}: project {pid}", flush=True)
    set_part(wd, ch, pid)
    if rebuild:
        clear(pid); st["done"] = {}; wd.save_state()
        print("  cleared all pictures for a rebuild", flush=True)

    project = studio.project(pid)
    if project["script"].split() != "\n\n".join(s["text"].strip() for s in ch["scenes"]).split():
        print(f"  WARNING the narration in chapters.json differs from the Studio project; edit it in the Studio (then split) or build a fresh project")
    scenes = project["scenes"]
    for si, (scene, items) in enumerate(zip(scenes, p["chapters"][n])):
        for j, item in enumerate(items):
            step, it = f"s{si}i{j}", plan.parse(item)
            if step in st["done"]:
                if st["done"][step] != str(item): print(f"  WARNING scene {si + 1} item {j + 1} changed in plan.json ({st['done'][step]} -> {item}); run build {n} --rebuild to apply")
                continue
            if it["kind"] == "photo" and it["ref"][1] is None: continue
            if any(k.startswith(f"s{si}i") and int(k.split("i")[1]) > j for k in st["done"]):
                print(f"  WARNING scene {si + 1}: item {j + 1} is added after later items; run build {n} --rebuild to put pictures in plan order")
            if it["kind"] == "card": desc = add_card(wd, pid, scene["id"], ch, si, it)
            elif it["kind"] == "photo": desc = add_photo(wd, pid, scene["id"], it, images)
            else: desc = add_clip(wd, pid, scene["id"], it, p.get("clips", {}), videos)
            st["done"][step] = str(item); wd.save_state()
            print(f"  scene {si + 1}: {desc}", flush=True)
    voice(wd, ch, pid, voice_kind)
    return pid
