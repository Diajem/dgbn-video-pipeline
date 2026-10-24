"""Paths, settings and saved progress for one documentary working folder.

A working folder holds everything for one film (it is not committed):
  chapters.json   the narration and visual brief (input)
  plan.json       which card / photo / clip goes in each scene, in order
  state.json      Studio project ids, finished steps and renders (written by the tools)
  survey/         Commons search results and contact sheets
  cards/ footage/ clips/   generated cards, downloaded Commons video, cut clips
  out/            previews, frame sheets, the stitched film and description text
"""
import json, os, re

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
STUDIO = os.environ.get("STUDIO_URL", "http://127.0.0.1:4177").rstrip("/")
RENDERS = os.environ.get("STUDIO_RENDERS", os.path.join(REPO, "renders"))
UA = {"User-Agent": f"DGBN-Documentary/0.1 (local newsroom tool; {os.environ.get('STUDIO_CONTACT', 'contact not set')})"}


def load_json(path, default=None):
    if not os.path.exists(path): return default
    with open(path, encoding="utf-8") as f: return json.load(f)


def save_json(path, data):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f: json.dump(data, f, indent=1, ensure_ascii=False)
    os.replace(tmp, path)


def slug(text):
    return re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-") or "documentary"


class Workdir:
    def __init__(self, root):
        self.root = os.path.abspath(root)
        if not os.path.exists(self.path("chapters.json")):
            raise SystemExit(f"No chapters.json in {self.root}. Put the chapters file there first (see docs/documentary-workflow.md).")
        self.data = load_json(self.path("chapters.json"))
        self.meta = self.data.get("meta", {})
        self.chapters = sorted(self.data["chapters"], key=lambda c: c["n"])
        self.state = load_json(self.path("state.json"), {"chapters": {}, "renders": {"draft": {}, "final": {}}})

    def path(self, *parts):
        return os.path.join(self.root, *parts)

    def dir(self, *parts):
        d = self.path(*parts); os.makedirs(d, exist_ok=True); return d

    def chapter(self, n):
        for c in self.chapters:
            if c["n"] == int(n): return c
        raise SystemExit(f"Chapter {n} is not in chapters.json")

    def pick(self, numbers):
        """Chapters named on the command line, or all of them."""
        return [self.chapter(n) for n in numbers] if numbers else self.chapters

    def save_state(self):
        save_json(self.path("state.json"), self.state)

    def pid(self, n):
        st = self.state["chapters"].get(str(n))
        if not st: raise SystemExit(f"Chapter {n} has not been built yet. Run: doc.py build {n}")
        return st["pid"]

    @property
    def title(self):
        return self.meta.get("title") or self.meta.get("series") or "Documentary"

    @property
    def film_slug(self):
        return self.meta.get("slug") or slug(self.title)

    def part_of(self, n):
        """Position of a chapter in the film: 'only' for a one-chapter film, else first/middle/last."""
        ns = [c["n"] for c in self.chapters]
        if len(ns) == 1: return "only"
        return "first" if n == ns[0] else "last" if n == ns[-1] else "middle"


def short_title(ch):
    """Chapter name for YouTube chapters: 'short' if given, else the part of the title after the last colon."""
    return ch.get("short") or ch["title"].rsplit(":", 1)[-1].strip()


def timestamps(titles, durations):
    t, out = 0.0, []
    for title, d in zip(titles, durations):
        out.append(f"{int(t // 3600)}:{int(t % 3600 // 60):02d}:{int(t % 60):02d} {title}" if t >= 3600 else f"{int(t // 60)}:{int(t % 60):02d} {title}")
        t += d
    return out
