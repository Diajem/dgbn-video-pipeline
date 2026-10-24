"""Small client for the local Video Studio API. Retries when Wikimedia rate-limits (HTTP 429) a request the Studio passes on."""
import json, os, time, urllib.error, urllib.parse, urllib.request
from workdir import STUDIO, RENDERS

WAITS = (20, 60, 120, 240)


class StudioError(RuntimeError):
    pass


def _call(method, path, body=None, raw=None, timeout=600):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    headers = {"X-Studio": "1", "Content-Type": "application/octet-stream" if raw is not None else "application/json"}
    req = urllib.request.Request(STUDIO + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        raise StudioError(f"{method} {path} -> {e.code}: {e.read().decode(errors='replace')[:500]}")
    except urllib.error.URLError as e:
        raise SystemExit(f"Cannot reach the Video Studio at {STUDIO} ({e.reason}). Start it with: npm run studio")


def call(method, path, body=None, raw=None, timeout=600, waits=WAITS):
    for wait in (*waits, None):
        try: return _call(method, path, body, raw, timeout)
        except StudioError as e:
            if "429" not in str(e) or wait is None: raise
            print(f"  rate limited, waiting {wait}s", flush=True); time.sleep(wait)


def project(pid): return call("GET", f"/api/projects/{pid}")


def upload(pid, sid, file, name, origin):
    """Upload a local image or clip into a scene and return the new asset id."""
    with open(file, "rb") as f: raw = f.read()
    pr = call("POST", f"/api/projects/{pid}/scenes/{sid}/upload?name={urllib.parse.quote(name)}&origin={origin}", raw=raw)
    return next(s for s in pr["scenes"] if s["id"] == sid)["assets"][-1]["id"]


def set_asset(pid, sid, aid, **fields):
    # Label and rights note must be saved before the rights status can be set to cleared.
    rights = fields.pop("rights", None)
    if fields: call("PUT", f"/api/projects/{pid}/scenes/{sid}/assets/{aid}", fields)
    if rights: call("PUT", f"/api/projects/{pid}/scenes/{sid}/assets/{aid}", {"rights": rights})


def render(pid, draft, poll=15):
    """Run the Studio render and wait for it. Returns the render state (status, output, log)."""
    chk = call("POST", f"/api/projects/{pid}/check", {"draft": draft})
    if chk["blockers"]: return {"status": "blocked", "blockers": chk["blockers"], "warnings": chk["warnings"]}
    call("POST", f"/api/projects/{pid}/render", {"draft": draft})
    while True:
        time.sleep(poll)
        s = call("GET", f"/api/projects/{pid}/render")
        if s["status"] in ("done", "failed"): return s


def render_file(name, fallback_dir):
    """Path to a finished render: the Studio's renders folder if visible from here, else download it over HTTP."""
    local = os.path.join(RENDERS, name)
    if os.path.exists(local): return local
    os.makedirs(fallback_dir, exist_ok=True)
    dest = os.path.join(fallback_dir, name)
    if not os.path.exists(dest):
        with urllib.request.urlopen(f"{STUDIO}/renders/{urllib.parse.quote(name)}", timeout=600) as r, open(dest + ".part", "wb") as f:
            while chunk := r.read(1 << 20): f.write(chunk)
        os.replace(dest + ".part", dest)
    return dest
