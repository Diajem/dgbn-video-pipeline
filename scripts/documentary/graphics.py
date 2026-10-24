"""In-house cards in the DGBN house style, and contact sheets for picking images, footage and checking renders."""
import os
from PIL import Image, ImageDraw, ImageFont
import commons

BG, GOLD, WHITE, SOFT = "#0b111b", "#e0a52c", "#f4f5f7", "#dfe3ea"
FONTS = os.environ.get("DOC_FONTS", r"C:\Windows\Fonts")
BOLD, REG = os.path.join(FONTS, "arialbd.ttf"), os.path.join(FONTS, "arial.ttf")


def font(path, size):
    try: return ImageFont.truetype(path, size)
    except OSError: return ImageFont.load_default(size)


def _fit(draw, text, path, size, maxw, minsize):
    while size > minsize and draw.textlength(text, font=font(path, size)) > maxw: size -= 4
    return font(path, size)


def _wrap(draw, text, f, maxw):
    lines, cur = [], ""
    for w in text.split():
        t = (cur + " " + w).strip()
        if draw.textlength(t, font=f) <= maxw or not cur: cur = t
        else: lines.append(cur); cur = w
    return lines + [cur]


def card(v, out, size=(1920, 1080)):
    """Key-number card: big gold figure, white line under it, small grey source line."""
    W, H = size
    MAXW = W - 200
    im = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(im)
    big, sub, small = v.get("big", ""), v.get("sub", ""), v.get("small", "")
    bf = _fit(d, big, BOLD, 230, MAXW, 120)
    sf = _fit(d, sub, BOLD, 60, MAXW, 38)
    mf = _fit(d, small, REG, 42, MAXW, 28)
    blocks = [(l, bf, GOLD, int(bf.size * 1.08)) for l in _wrap(d, big, bf, MAXW)]
    blocks += [(None, None, None, 60)] + ([(l, sf, WHITE, int(sf.size * 1.3)) for l in _wrap(d, sub, sf, MAXW)] if sub else [])
    if small: blocks += [(None, None, None, 18), (small, mf, SOFT, int(mf.size * 1.3))]
    y = (H - sum(b[3] for b in blocks)) // 2
    for text, f, col, h in blocks:
        if text: d.text(((W - d.textlength(text, font=f)) / 2, y + h / 2), text, font=f, fill=col, anchor="lm")
        y += h
    im.save(out)


def list_card(title, lines, out, footer="", cols=1, size=40):
    """A plain list card (e.g. SOURCES) in the house style."""
    W, H = 1920, 1080
    im = Image.new("RGB", (W, H), BG); d = ImageDraw.Draw(im)
    f = font(REG, size)
    d.text((W / 2, 90), title, font=font(BOLD, 64), fill=GOLD, anchor="mm")
    per = max(1, -(-len(lines) // cols)); colw = (W - 160) // cols
    for i, line in enumerate(lines):
        x, y = 80 + (i // per) * colw, 170 + (i % per) * int(size * 1.45)
        while d.textlength(line, font=f) > colw - 30: line = line[:-2]
        d.text((x, y), line, font=f, fill=WHITE)
    if footer: d.text((W / 2, H - 50), footer, font=font(REG, 30), fill=SOFT, anchor="mm")
    im.save(out)


def sheet(title, items, out):
    """Contact sheet of up to 8 candidates: items are (image or None, caption line 1, caption line 2)."""
    S = Image.new("RGB", (4 * 320, 40 + 2 * 290), "white"); d = ImageDraw.Draw(S)
    small, big = font(REG, 15), font(BOLD, 22)
    d.text((10, 8), title[:110], fill="black", font=big)
    for i, (im, a, b) in enumerate(items[:8]):
        x, y = (i % 4) * 320, 40 + (i // 4) * 290
        if im: im.thumbnail((310, 240)); S.paste(im, (x + 5, y))
        else: d.rectangle((x + 5, y, x + 315, y + 240), outline="#bbbbbb")
        d.text((x + 5, y + 244), f"[{i}] {a}"[:42], fill="black", font=small)
        d.text((x + 5, y + 262), b[:42], fill="blue", font=small)
    S.save(out, quality=80)


def image_sheet(key, q, results, out):
    items = [(commons.fetch_image(commons.thumb(r["thumbUrl"], 330)), r["title"], f"{r['licence'][:20]} {r['width']}x{r['height']}") for r in results[:8]]
    sheet(f"{key}: {q}", items, out)


def video_sheet(key, q, results, out):
    items = [(commons.fetch_image(r["thumbUrl"]) if r.get("thumbUrl") else None, r["title"], f"{r['licence'][:18]} {r['duration']}s {r['height']}p") for r in results[:8]]
    sheet(f"VIDEO {key}: {q}", items, out)


def is_blank(path):
    """True when a contact sheet came out without pictures (thumbnails were rate-limited)."""
    if not os.path.exists(path): return True
    return Image.open(path).convert("L").crop((0, 40, 1280, 280)).getextrema()[0] >= 200


def frame_grid(frames, out, cols=4, width=480):
    """Tile (image, caption) frames into one sheet with the caption (e.g. a timestamp) under each frame."""
    if not frames: return
    w = width; h = int(frames[0][0].height * w / frames[0][0].width)
    rows = -(-len(frames) // cols)
    S = Image.new("RGB", (cols * w, rows * (h + 24)), "white"); d = ImageDraw.Draw(S); f = font(BOLD, 18)
    for i, (im, cap) in enumerate(frames):
        x, y = (i % cols) * w, (i // cols) * (h + 24)
        S.paste(im.resize((w, h)), (x, y))
        d.text((x + 6, y + h + 2), cap, fill="black", font=f)
    S.save(out, quality=82)
