"""DGBN documentary workflow. See docs/documentary-workflow.md for the full how-to.

  python scripts/documentary/doc.py --dir <folder> <command> ...

  init <chapters.json>          start a working folder from a chapters file (writes a first plan.json)
  survey [n ...] [key=query ...] Commons image search for each 'commons' visual (+ extra searches), contact sheets
  sheets [prefix] [--all]       rebuild contact sheets that came out blank
  vsurvey key=query ...         Commons video search, poster-frame sheets
  vfetch key:idx ...            download Commons videos, timestamped frame sheets for choosing clip start times
  clips [--force]               cut the clips defined in plan.json
  plan [--force]                check plan.json and list what is still to pick (writes a first draft if missing)
  build [n ...] [--voice draft|google|pocket|none] [--rebuild]
  check [n ...] [--final]       Studio checks (blockers and warnings)
  draft [n ...]                 draft renders, 720p previews and frame sheets
  approve [n ...]               mark narration APPROVED after listening (not possible for the draft voice)
  final [n ...]                 final renders, previews and frame sheets
  film [--draft] [--rerender]   render all chapters (reusing finished ones), join them; final also writes YouTube chapter times
  description                   YouTube description text: chapters, sources, credits, labelling note
  sources-card                  optional on-screen SOURCES card on the last scene of the film
  status                        what has been built and rendered
"""
import argparse, os, shutil, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build, finish, plan, studio, survey
from workdir import Workdir, load_json, save_json


def numbers(args): return [a for a in args if a.isdigit()]


def cmd_init(dirpath, rest):
    if not rest: raise SystemExit("usage: doc.py --dir <folder> init <chapters.json>")
    os.makedirs(dirpath, exist_ok=True)
    dest = os.path.join(dirpath, "chapters.json")
    if os.path.exists(dest) and os.path.abspath(rest[0]) != os.path.abspath(dest): raise SystemExit(f"{dest} already exists")
    if os.path.abspath(rest[0]) != os.path.abspath(dest): shutil.copyfile(rest[0], dest)
    wd = Workdir(dirpath)
    for ch in wd.chapters:
        for si, sc in enumerate(ch["scenes"]):
            if "\n\n" in sc["text"].strip(): raise SystemExit(f"chapter {ch['n']} scene {si + 1}: scene text must not contain blank lines")
    if not os.path.exists(wd.path("plan.json")): save_json(wd.path("plan.json"), plan.draft(wd.chapters))
    print(f"{wd.title}: {len(wd.chapters)} chapters, {sum(len(c['scenes']) for c in wd.chapters)} scenes. Next: doc.py --dir {dirpath} survey")


def cmd_plan(wd, force):
    path = wd.path("plan.json")
    if force or not os.path.exists(path):
        save_json(path, plan.draft(wd.chapters)); print("wrote a first plan.json from the brief")
    errors, todo = plan.problems(wd, load_json(path), load_json(wd.path("survey", "images.json"), {}), load_json(wd.path("survey", "videos.json"), {}))
    for e in errors: print("ERROR", e)
    for t in todo: print("TODO ", t)
    print(f"{len(errors)} errors, {len(todo)} still to do" if errors or todo else "plan.json is complete")
    return not errors


def cmd_status(wd):
    print(wd.title)
    for ch in wd.chapters:
        st = wd.state["chapters"].get(str(ch["n"]))
        r = {m: wd.state["renders"].get(m, {}).get(str(ch["n"])) for m in ("draft", "final")}
        line = f"  {ch['n']}. {ch['title']}: " + (f"project {st['pid']}, {len(st['done'])} pictures, voice {st.get('voice', 'none')}" if st else "not built")
        line += "".join(f", {m} {v['seconds']}s" for m, v in r.items() if v)
        print(line)


def main(argv=None):
    ap = argparse.ArgumentParser(description="DGBN documentary workflow", usage=__doc__)
    ap.add_argument("--dir", default=os.environ.get("DOC_DIR", "."), help="working folder for this film (or set DOC_DIR)")
    ap.add_argument("command")
    ap.add_argument("rest", nargs="*")
    ap.add_argument("--voice", choices=build.VOICES, default="draft")
    ap.add_argument("--rebuild", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--redo", action="store_true")
    ap.add_argument("--final", action="store_true")
    ap.add_argument("--rerender", action="store_true")
    ap.add_argument("--draft", action="store_true")
    a = ap.parse_args(argv)
    if a.command == "init": return cmd_init(a.dir, a.rest)
    wd = Workdir(a.dir)
    chapters = wd.pick(numbers(a.rest))
    c = a.command
    if c == "survey": survey.images(wd, chapters, [x for x in a.rest if "=" in x], redo=a.redo)
    elif c == "sheets": survey.sheets(wd, a.rest[0] if a.rest else "", rebuild_all=a.all)
    elif c == "vsurvey": survey.videos(wd, a.rest)
    elif c == "vfetch": survey.fetch(wd, a.rest)
    elif c == "clips": survey.clips(wd, force=a.force)
    elif c == "plan": return 0 if cmd_plan(wd, a.force) else 1
    elif c == "build":
        for ch in chapters: build.build(wd, ch, voice_kind=a.voice, rebuild=a.rebuild)
    elif c == "check": return 0 if finish.check(wd, chapters, draft=not a.final) else 1
    elif c in ("draft", "final"):
        for ch in chapters: finish.render(wd, ch, c)
    elif c == "approve": finish.approve(wd, chapters)
    elif c == "film": finish.film(wd, rerender=a.rerender, mode="draft" if a.draft else "final")
    elif c == "description": finish.description(wd)
    elif c == "sources-card": finish.sources_card(wd)
    elif c == "status": cmd_status(wd)
    else: raise SystemExit(f"unknown command {c!r}\n{__doc__}")
    return 0


if __name__ == "__main__":
    try: sys.exit(main())
    except studio.StudioError as e: sys.exit(f"Studio said no: {e}")
