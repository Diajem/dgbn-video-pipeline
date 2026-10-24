"""Wikimedia Commons: image search (through the Studio), video search and downloads.
Wikimedia rate-limits hard, so everything here is sequential, paced and backs off on HTTP 429."""
import html, io, json, os, re, time, urllib.error, urllib.parse, urllib.request
from workdir import STUDIO, UA

API = "https://commons.wikimedia.org/w/api.php?"
PACE = float(os.environ.get("COMMONS_PACE", "0.7"))  # seconds between Wikimedia requests


def licence_ok(licence):
    """Same rule as the Studio: public domain / CC0 / CC BY(-SA), never NC or ND."""
    text = str(licence or "").strip()
    bad = re.search(r"(^|[\s-])(nc|nd)([\s-]|$)|non-?commercial|no ?derivatives|fair use", text, re.I)
    good = re.match(r"^(cc0|cc[- ]by|public domain|pd\b|attribution)", text, re.I)
    return bool(good and not bad)


def thumb(url, width):
    """A standard-width Commons thumbnail for any upload.wikimedia.org image URL.
    Full-size originals are often refused with HTTP 429; standard thumbnails are served reliably."""
    url = url.split("?")[0]
    m = re.match(r"https://(?:upload|thumb)\.wikimedia\.org/wikipedia/commons/thumb/(.+)/(\d+)px-(.+)$", url)
    if m: return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{m.group(1)}/{width}px-{m.group(3)}"
    m = re.match(r"https://upload\.wikimedia\.org/wikipedia/commons/(\w/\w\w)/(.+)$", url)
    if m: return f"https://upload.wikimedia.org/wikipedia/commons/thumb/{m.group(1)}/{m.group(2)}/{width}px-{m.group(2)}"
    return url


def fetch_image(url):
    from PIL import Image
    for wait in (0, 5, 15, 40):
        time.sleep(wait + PACE)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return Image.open(io.BytesIO(r.read())).convert("RGB")
        except urllib.error.HTTPError as e:
            if e.code != 429: return None
        except Exception:
            return None
    return None


def search_images(q):
    """Commons image search through the Studio (it applies the same licence rules the Studio uses)."""
    u = f"{STUDIO}/api/commons?q=" + urllib.parse.quote(q)
    for wait in (0, 10, 30, 60, 120):
        time.sleep(wait)
        try:
            with urllib.request.urlopen(u, timeout=60) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            # The Studio reports a Commons rate limit as HTTP 400 "Commons search failed: HTTP 429".
            if e.code != 400: raise
        except urllib.error.URLError as e:
            raise SystemExit(f"Cannot reach the Video Studio at {STUDIO} ({e.reason}). Start it with: npm run studio")
    raise RuntimeError("still rate limited after several waits; try again later")


def _get_json(url):
    for wait in (0, 10, 30, 60, 120):
        time.sleep(wait + 1)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r: return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code != 429: raise
    raise RuntimeError("still rate limited after several waits; try again later")


def _strip(s): return html.unescape(re.sub(r"<[^>]+>", "", s or "")).strip()


def search_videos(q, limit=8):
    """Commons video search. Each result's 'src' is the best WebM transcode at 720p or below."""
    params = {"action": "query", "format": "json", "generator": "search", "gsrnamespace": "6", "gsrsearch": q + " filetype:video",
              "gsrlimit": str(limit), "prop": "videoinfo", "viprop": "url|size|mime|extmetadata|derivatives", "viurlwidth": "330"}
    data = _get_json(API + urllib.parse.urlencode(params))
    out = []
    for page in sorted((data.get("query") or {}).get("pages", {}).values(), key=lambda p: p.get("index", 0)):
        info = (page.get("videoinfo") or [None])[0]
        if not info: continue
        meta = info.get("extmetadata") or {}
        lic = _strip(meta.get("LicenseShortName", {}).get("value", ""))
        author = _strip(meta.get("Artist", {}).get("value", "")) or _strip(meta.get("Credit", {}).get("value", "")) or "Unknown author"
        ders = [d for d in info.get("derivatives", []) if d.get("type", "").startswith("video/webm") and d.get("height") and d["height"] <= 720]
        best = max(ders, key=lambda d: d["height"]) if ders else None
        out.append({"title": page["title"].replace("File:", ""), "pageUrl": info.get("descriptionurl"), "thumbUrl": info.get("thumburl"),
                    "duration": round(float(info.get("duration") or 0), 1), "width": info.get("width"), "height": info.get("height"),
                    "licence": lic, "credit": f"{author[:80]} / {lic or 'licence not stated'} / Wikimedia Commons",
                    "rights": "cleared" if licence_ok(lic) else "needs_permission", "src": best["src"] if best else info.get("url")})
    return out


def download(url, dest):
    """Download a file sequentially with backoff. Keeps an existing complete file."""
    if os.path.exists(dest) and os.path.getsize(dest) > 10000: return dest
    for wait in (0, 30, 60, 120, 240):
        time.sleep(wait)
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600) as resp, open(dest + ".part", "wb") as f:
                while chunk := resp.read(1 << 20): f.write(chunk)
            os.replace(dest + ".part", dest)
            time.sleep(5)  # give Wikimedia a breather before the next download
            return dest
        except urllib.error.HTTPError as e:
            print(f"  HTTP {e.code} for {url}", flush=True)
            if e.code != 429: raise
    raise RuntimeError(f"still rate limited downloading {url}")
