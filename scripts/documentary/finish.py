"""Steps 5 and 6: draft/final renders with previews and frame sheets, the stitched film, and the YouTube description."""
import os, shutil
import graphics, media, studio
from workdir import short_title, timestamps


def check(wd, chapters, draft):
    ok = True
    for ch in chapters:
        r = studio.call("POST", f"/api/projects/{wd.pid(ch['n'])}/check", {"draft": draft})
        print(f"chapter {ch['n']}: {len(r['blockers'])} blockers, {len(r['warnings'])} warnings")
        for b in r["blockers"]: print("  BLOCKER", b)
        for w in r["warnings"]: print("  warning", w)
        ok = ok and not r["blockers"]
    return ok


def approve(wd, chapters):
    """Mark narration APPROVED (Peter's sign-off after listening). The Studio refuses this for the draft Windows voice."""
    for ch in chapters:
        studio.call("PUT", f"/api/projects/{wd.pid(ch['n'])}/audio", {"status": "APPROVED"})
        print(f"chapter {ch['n']}: narration approved")


def render(wd, ch, mode, keep=False):
    """Render one chapter; write a 720p preview and a frame sheet. With keep=True an existing render is reused."""
    n, pid = str(ch["n"]), wd.pid(ch["n"])
    done = wd.state["renders"].setdefault(mode, {})
    if keep and n in done and done[n].get("pid") == pid:
        return studio.render_file(done[n]["output"], wd.path("out", "renders"))
    if wd.part_of(ch["n"]) == "last": sync_credits(wd)
    print(f"chapter {n}: {mode} render started", flush=True)
    s = studio.render(pid, draft=mode == "draft")
    if s["status"] == "blocked": raise SystemExit(f"chapter {n} is blocked:\n  " + "\n  ".join(s["blockers"]))
    if s["status"] == "failed": raise SystemExit(f"chapter {n} render failed:\n{s['log'][-800:]}")
    src = studio.render_file(s["output"], wd.path("out", "renders"))
    dur = media.duration(src)
    done[n] = {"pid": pid, "output": s["output"], "seconds": round(dur, 2)}; wd.save_state()
    media.preview(src, wd.path("out", "previews", f"{wd.film_slug}-ch{n}-{mode}-720p.mp4"))
    media.frame_sheet(src, wd.path("out", "frames", f"ch{n}-{mode}.jpg"))
    print(f"chapter {n}: {mode} done, {dur:.1f}s -> out/previews, frames in out/frames/ch{n}-{mode}.jpg", flush=True)
    return src


def film(wd, rerender=False, mode="final"):
    """Render every chapter (reusing finished renders of this mode unless rerender) and join them into one film.
    mode="draft" gives a stitched draft for reviewing the whole film; only the final film writes the YouTube chapter times."""
    files = [render(wd, ch, mode, keep=not rerender) for ch in wd.chapters]
    name = f"{wd.film_slug}-full-film" + ("-DRAFT" if mode == "draft" else "")
    out = wd.path("out", name + ".mp4")
    if len(files) == 1: shutil.copyfile(files[0], out)
    else: media.concat(files, out, wd.path("out", "film-list.txt"))
    media.preview(out, wd.path("out", "previews", name + "-720p.mp4"))
    stamps = timestamps([short_title(c) for c in wd.chapters], [media.duration(f) for f in files])
    if mode == "final":
        with open(wd.path("out", "youtube-chapters.txt"), "w", encoding="utf-8") as f: f.write("\n".join(stamps) + "\n")
    print(f"film: {out} ({media.duration(out):.1f}s)")
    print("\n".join(stamps))
    return out


def credits(wd):
    """Every credit line used in the film, in order of first use, plus meta.extraCredits."""
    seen = []
    for ch in wd.chapters:
        for s in studio.project(wd.pid(ch["n"]))["scenes"]:
            for a in s["assets"]:
                c = (a.get("credit") or "").strip()
                if c and c not in seen: seen.append(c)
    return seen + [c for c in wd.meta.get("extraCredits", []) if c not in seen]


def sync_credits(wd):
    """The Studio rolls credits on the last chapter from its own pictures plus extraCredits,
    so give the last chapter every credit used anywhere in the film."""
    last = wd.chapters[-1]["n"]
    others = [ch for ch in wd.chapters if ch["n"] != last and str(ch["n"]) in wd.state["chapters"]]
    seen = []
    for ch in others:
        for s in studio.project(wd.pid(ch["n"]))["scenes"]:
            for a in s["assets"]:
                c = (a.get("credit") or "").strip()
                if c and c not in seen: seen.append(c)
    extra = seen + [c for c in wd.meta.get("extraCredits", []) if c not in seen]
    studio.call("PUT", f"/api/projects/{wd.pid(last)}", {"extraCredits": extra})
    total = len(credits(wd))
    if total > 80: print(f"  WARNING {total} credits; the end roll shows at most 80, the description lists them all")
    return extra


def description(wd):
    """Text for the YouTube description: chapters, sources, credits and how pictures are labelled."""
    lines = [wd.title, ""]
    if wd.meta.get("summary"): lines += [wd.meta["summary"], ""]
    chap = wd.path("out", "youtube-chapters.txt")
    if os.path.exists(chap):
        with open(chap, encoding="utf-8") as f: lines += ["Chapters", *f.read().splitlines(), ""]
    else: print("No youtube-chapters.txt yet (run: doc.py film); leaving chapters out.")
    if wd.meta.get("sources"): lines += ["Sources", *[f"- {s}" for s in wd.meta["sources"]], ""]
    cr = credits(wd)
    if cr: lines += ["Images and footage", *[f"- {c}" for c in cr], ""]
    lines += ["Pictures marked ILLUSTRATIVE IMAGE or ILLUSTRATIVE FOOTAGE stand in for the place or subject described. "
              "Pictures marked AI-GENERATED ILLUSTRATION are AI-made and used only for history, culture or statistics.",
              wd.meta.get("aiNote", "This is an AI-assisted documentary from DGBN.")]
    out = wd.path("out", "youtube-description.txt")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f: f.write("\n".join(lines) + "\n")
    print(f"description: {out} ({len(cr)} credits, {len(wd.meta.get('sources', []))} sources)")
    return out


def sources_card(wd):
    """Optional on-screen SOURCES card from meta.sources, added to the last scene of the last chapter."""
    src = wd.meta.get("sources")
    if not src: raise SystemExit("Add meta.sources to chapters.json first")
    f = os.path.join(wd.dir("cards"), "sources.png")
    graphics.list_card("SOURCES", src, f, footer=f"DGBN Documentary  |  {wd.title}", cols=1 if len(src) <= 13 else 2, size=40 if len(src) <= 13 else 30)
    pid = wd.pid(wd.chapters[-1]["n"])
    sid = studio.project(pid)["scenes"][-1]["id"]
    aid = studio.upload(pid, sid, f, "sources.png", "own")
    studio.set_asset(pid, sid, aid, label="GRAPHIC", rightsNote="Made in-house by DGBN. Sources list for the film.", fit="fit")
    print("sources card added to the last scene of chapter", wd.chapters[-1]["n"])
