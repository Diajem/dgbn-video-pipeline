"""Offline tests for the documentary tools (no Studio or network needed): python -m unittest discover scripts/documentary/tests"""
import json, os, sys, tempfile, unittest
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import commons, graphics, plan
from workdir import Workdir, load_json, short_title, timestamps

SAMPLE = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample", "chapters.json")


def workdir(chapters):
    d = tempfile.mkdtemp()
    with open(os.path.join(d, "chapters.json"), "w", encoding="utf-8") as f: json.dump(chapters, f)
    return Workdir(d)


class PlanTest(unittest.TestCase):
    def test_parse_items(self):
        self.assertEqual(plan.parse("card:1"), {"kind": "card", "ref": 1, "label": None})
        self.assertEqual(plan.parse("photo:q_union:7"), {"kind": "photo", "ref": ("q_union", 7), "label": None})
        self.assertEqual(plan.parse("photo:c1s0v0:?")["ref"], ("c1s0v0", None))
        self.assertEqual(plan.parse("photo:q_cows:2|ILLUSTRATIVE IMAGE")["label"], "ILLUSTRATIVE IMAGE")
        self.assertEqual(plan.parse({"clip": "oval", "label": "FILE FOOTAGE"}), {"kind": "clip", "ref": "oval", "label": "FILE FOOTAGE"})
        for bad in ("photo:7", "map:1", "photo:k:1|NICE PICTURE", {"x": 1}):
            with self.assertRaises(ValueError): plan.parse(bad)

    def test_draft_and_problems(self):
        wd = workdir({"meta": {}, "chapters": [{"n": 1, "title": "T: One", "headline": "H", "scenes": [
            {"text": "A.", "visuals": [{"t": "commons", "q": "x"}, {"t": "card", "big": "1"}]}, {"text": "B.", "visuals": []}]}]})
        p = plan.draft(wd.chapters)
        self.assertEqual(p["chapters"]["1"], [["photo:c1s0v0:?", "card:1"], []])
        errors, todo = plan.problems(wd, p, {}, {})
        self.assertEqual(errors, [])
        self.assertEqual(len(todo), 2)  # one photo to pick, one scene without a picture
        p["chapters"]["1"][0] = ["card:0", "photo:nokey:0", "clip:nope"]
        p["clips"] = {"c": {"from": "v:0", "start": 0, "duration": 4}}
        errors, _ = plan.problems(wd, p, {}, {"v": {"results": [{}]}})
        self.assertTrue(any("not a card" in e for e in errors))
        self.assertTrue(any("nokey" in e for e in errors))
        self.assertTrue(any("clip nope" in e for e in errors))
        self.assertTrue(any("label FILE FOOTAGE" in e for e in errors))  # footage must say what it is

    def test_sample_brief_has_complete_plan(self):
        wd = Workdir(os.path.dirname(SAMPLE))
        p = load_json(os.path.join(os.path.dirname(SAMPLE), "plan.json"))
        errors, _ = plan.problems(wd, p, {"c1s0v0": {"results": [{}]}}, {})
        self.assertEqual(errors, [])


class FilmTest(unittest.TestCase):
    def test_parts(self):
        chs = [{"n": n, "title": f"F: C{n}", "headline": "h", "scenes": []} for n in (3, 1, 2)]
        wd = workdir({"meta": {"title": "The Film"}, "chapters": chs})
        self.assertEqual([wd.part_of(n) for n in (1, 2, 3)], ["first", "middle", "last"])
        self.assertEqual(workdir({"meta": {}, "chapters": chs[:1]}).part_of(3), "only")
        self.assertEqual(wd.film_slug, "The-Film")

    def test_timestamps(self):
        self.assertEqual(timestamps(["A", "B", "C"], [65.4, 3540, 10]), ["0:00 A", "1:05 B", "1:00:05 C"])
        self.assertEqual(short_title({"title": "The Land Question - Chapter 1: Two Scenes"}), "Two Scenes")
        self.assertEqual(short_title({"title": "x", "short": "Belonging"}), "Belonging")


class CommonsTest(unittest.TestCase):
    def test_thumb(self):
        orig = "https://upload.wikimedia.org/wikipedia/commons/a/ab/Farm.jpg"
        self.assertEqual(commons.thumb(orig, 1280), "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Farm.jpg/1280px-Farm.jpg")
        t = "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Farm.jpg/1600px-Farm.jpg?x=1"
        self.assertEqual(commons.thumb(t, 330), "https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Farm.jpg/330px-Farm.jpg")

    def test_licence(self):
        for ok in ("CC BY-SA 4.0", "Public domain", "CC0", "PD-USGov"): self.assertTrue(commons.licence_ok(ok), ok)
        for bad in ("CC BY-NC 2.0", "CC BY-ND 3.0", "Fair use", "", "GFDL"): self.assertFalse(commons.licence_ok(bad), bad)


class GraphicsTest(unittest.TestCase):
    def test_card(self):
        from PIL import Image
        out = os.path.join(tempfile.mkdtemp(), "c.png")
        graphics.card({"big": "2.5 million", "sub": "hectares of state land", "small": "Source: test"}, out)
        im = Image.open(out)
        self.assertEqual(im.size, (1920, 1080))
        self.assertEqual(im.getpixel((5, 5)), (11, 17, 27))  # house background


if __name__ == "__main__":
    unittest.main()
