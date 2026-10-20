#!/usr/bin/env python3
"""Round 4 matrix gallery: JPEG each shot, diff it against plain gloss (same team / angle / light), splice the
"Round 4" section into finish-lab.html between the R4 markers.

  python3 design-preview/finishes/fd-r4m-gallery.py jpg      # convert new PNGs, print the JPEGs still to upload
  python3 design-preview/finishes/fd-r4m-gallery.py diff     # write r4-diff.json
  python3 design-preview/finishes/fd-r4m-gallery.py html     # splice the section (needs r4-assets.json: jpg path -> blob url)

Diff = share of pixels whose largest channel moved by more than 12/255, inside the car's box (the union box of every
pixel that differs between any two finishes of that cell is too noisy; we use a fixed box per angle instead).
"""
import json, os, sys, html
from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "artifacts/finish-designs/r4m")
HERE = os.path.dirname(os.path.abspath(__file__))
LIGHTS = [("day", "Race daylight · Monza, sun 48° up"), ("garage", "Garage broadcast")]
TEAMS = [("williams", "dark · Williams navy"), ("ferrari", "mid · Ferrari red"), ("haas", "light · Haas white")]
ANGLES = [("side", "side"), ("graze", "45° grazing"), ("spec", "specular")]
# Car box per angle as frame fractions (x0, y0, x1, y1): measured off the gloss frames.
BOX = {"day": {"side": (0.03, 0.40, 0.92, 0.95), "graze": (0.0, 0.40, 0.97, 1.0), "spec": (0.12, 0.30, 0.92, 1.0)}}
ORDER = [("keep", [69, 63, 67, 68, 72, 71, 84, 66, 85, 65, 83, 60, 62]), ("borderline", [61, 70, 74, 81]),
         ("drop", [82])]
THRESH = 12


def finishes():
    return {f["id"]: f for f in json.load(open(os.path.join(HERE, "finishes.json")))}


def cells():
    for light, _ in LIGHTS:
        d = os.path.join(SRC, light)
        if not os.path.isdir(d):
            continue
        for n in sorted(os.listdir(d)):
            if n.endswith(".png"):
                key, team, angle = n[:-4].rsplit("-", 2)
                yield light, key, team, angle, os.path.join(d, n)


def jpg_path(light, key, team, angle):
    return os.path.join(SRC, "jpg", f"{light}-{key}-{team}-{angle}.jpg")


def cmd_jpg():
    os.makedirs(os.path.join(SRC, "jpg"), exist_ok=True)
    assets = load_assets()
    todo = []
    for light, key, team, angle, p in cells():
        j = jpg_path(light, key, team, angle)
        if not os.path.exists(j) or os.path.getmtime(j) < os.path.getmtime(p):
            Image.open(p).convert("RGB").save(j, quality=86, optimize=True)
        if os.path.relpath(j, ROOT) not in assets:
            todo.append(os.path.relpath(j, ROOT))
    print("\n".join(todo))


def diff_pct(a, b, box):
    A, B = Image.open(a).convert("RGB"), Image.open(b).convert("RGB")
    if box:
        w, h = A.size
        crop = (int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h))
        A, B = A.crop(crop), B.crop(crop)
    d = ImageChops.difference(A, B)
    r, g, bb = d.split()
    m = ImageChops.lighter(ImageChops.lighter(r, g), bb).point(lambda v: 255 if v > THRESH else 0)
    hist = m.histogram()
    return round(100.0 * hist[255] / (A.size[0] * A.size[1]), 1)


def cmd_diff():
    out = {}
    for light, key, team, angle, p in cells():
        if key == "gloss":
            continue
        base = os.path.join(SRC, light, f"gloss-{team}-{angle}.png")
        if os.path.exists(base):
            out[f"{light}-{key}-{team}-{angle}"] = diff_pct(p, base, BOX.get(light, {}).get(angle))
    json.dump(out, open(os.path.join(HERE, "r4-diff.json"), "w"), indent=0, sort_keys=True)
    print(len(out), "cells diffed")


def load_assets():
    p = os.path.join(HERE, "r4-assets.json")
    return json.load(open(p)) if os.path.exists(p) else {}


def cmd_html():
    F = finishes()
    assets = load_assets()
    diffs = json.load(open(os.path.join(HERE, "r4-diff.json")))
    have = {(l, k, t, a) for l, k, t, a, _ in cells()}
    shot = sum(1 for c in have if c[1] != "gloss")
    verdicts = {}
    vp = os.path.join(HERE, "r4-verdicts.json")
    if os.path.exists(vp):
        verdicts = json.load(open(vp))

    def img(light, key, team, angle, cap):
        rel = os.path.relpath(jpg_path(light, key, team, angle), ROOT)
        url = assets.get(rel)
        if not url:
            return '<figure class="r4c r4miss"><figcaption>not shot yet</figcaption></figure>'
        d = diffs.get(f"{light}-{key}-{team}-{angle}")
        tag = f'<span class="r4d">{d:.1f}% vs gloss</span>' if d is not None else '<span class="r4d">baseline</span>'
        return (f'<figure class="r4c"><button class="shot" data-cap="{html.escape(cap)}"><img src="{url}" '
                f'alt="{html.escape(cap)}" loading="lazy"></button><figcaption>{tag}</figcaption></figure>')

    def grid(light, key, name):
        head = '<div class="r4g"><span></span>' + "".join(f'<span class="r4h">{a}</span>' for _, a in ANGLES)
        rows = ""
        for t, tl in TEAMS:
            rows += f'<span class="r4h r4row">{tl}</span>' + "".join(
                img(light, key, t, a, f"{name} · {tl} · {al} · {light}") for a, al in ANGLES)
        return head + rows + "</div>"

    parts = []
    lights = [l for l in LIGHTS if any(c[0] == l[0] for c in have)]
    for group, ids in [("baseline", [None])] + ORDER:
        for fid in ids:
            if fid is None:
                key, name, pitch, chip = "gloss", "Plain gloss", "The shipped gloss paint every cell is diffed against.", "baseline"
            else:
                f = F[fid]; key, name, pitch = f["key"], f["name"], f["pitch"]
                chip = verdicts.get(key, {}).get("verdict") or {"keep": "keep", "borderline": "borderline", "drop": "would drop"}[group]
            v = verdicts.get(key, {})
            cls = "ok" if chip.startswith("keep") else ("" if chip == "baseline" else "warn")
            body = "".join(f'<h4>{html.escape(ll)}</h4>{grid(l, key, name)}' for l, ll in lights)
            note = f'<p class="note">{html.escape(v["note"])}</p>' if v.get("note") else ""
            tag = f"#{fid} {key}" if fid else "gloss"
            parts.append(f'<article class="card r4card" id="r4-{key}"><div class="card-head"><span class="id">{tag}</span>'
                         f'<h3>{html.escape(name)}</h3><span class="chip {cls}">{html.escape(chip)}</span></div>'
                         f'<p class="pitch">{html.escape(pitch)}</p>{note}{body}</article>')
    total = 18 * 3 * 3 * 2
    sec = f"""<!-- R4 -->
  <section id="r4">
    <h2>Round 4 · close-up matrix <small>{shot} of {total} cells shot · 1600×900 · TLX</small></h2>
    <p class="note">Every kept finish, close up, on three paint colours (Williams navy, Ferrari red, Haas white) from three angles: straight side-on, a 45° grazing angle low to the ground, and a high angle where the sun (or the garage lamp) reflects off the top panels. Each still shows how much of the car changed against plain gloss on the same car, angle and light, so a finish that looks like gloss shows a low number. Tap any still to zoom to full size.</p>
    <style>
      .r4card h4 {{ font: 600 16px var(--display); text-transform: uppercase; margin: 6px 0 0; color: var(--mute); }}
      .r4g {{ display: grid; grid-template-columns: 7.5em repeat(3, minmax(0, 1fr)); gap: 6px; align-items: center; }}
      .r4h {{ font: 500 11px var(--mono); color: var(--mute); }}
      .r4row {{ align-self: center; }}
      .r4c figcaption {{ text-align: right; }}
      .r4d {{ color: var(--tape); }}
      .r4miss {{ border: 1px dashed var(--rule); border-radius: 4px; min-height: 60px; display: grid; place-items: center; }}
      #r4 .finishes {{ grid-template-columns: 1fr; }}
      @media (max-width: 720px) {{ .r4g {{ grid-template-columns: repeat(3, minmax(0, 1fr)); }} .r4row {{ grid-column: 1 / -1; }} .r4g > span:first-child {{ display: none; }} }}
    </style>
    <div class="finishes">
{chr(10).join(parts)}
    </div>
  </section>
<!-- /R4 -->"""
    page = open(os.path.join(HERE, "finish-lab.html")).read()
    if "<!-- R4 -->" in page:
        a, rest = page.split("<!-- R4 -->", 1)
        page = a + sec + rest.split("<!-- /R4 -->", 1)[1]
    else:
        page = page.replace('  <section id="cut">', sec + '\n\n  <section id="cut">', 1)
    open(os.path.join(HERE, "finish-lab.html"), "w").write(page)
    print("spliced", shot, "cells")


if __name__ == "__main__":
    {"jpg": cmd_jpg, "diff": cmd_diff, "html": cmd_html}[sys.argv[1]]()
