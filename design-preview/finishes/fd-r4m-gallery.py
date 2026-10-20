#!/usr/bin/env python3
"""Round 4 matrix gallery: JPEG each shot, diff it against plain gloss (same team / angle / light), splice the
"Round 4" section into finish-lab.html between the R4 markers.

  python3 design-preview/finishes/fd-r4m-gallery.py jpg      # convert new PNGs, print the JPEGs still to upload
  python3 design-preview/finishes/fd-r4m-gallery.py diff     # write r4-diff.json
  python3 design-preview/finishes/fd-r4m-gallery.py html     # splice the section (needs r4-assets.json: jpg path -> blob url)

Diff = share of the cell's paint area (the union of pixels any finish changes vs gloss there) whose largest channel
moved by more than 12/255 against gloss. The scene is pinned (shot.mjs "comparison" profile), so the background is 0%.
"""
import json, os, sys, html
from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = os.path.join(ROOT, "artifacts/finish-designs/r4m")
HERE = os.path.dirname(os.path.abspath(__file__))
LIGHTS = [("day", "Race daylight · Monza, sun 48° up"), ("garage", "Garage broadcast")]
TEAMS = [("williams", "dark · Williams navy"), ("ferrari", "mid · Ferrari red"), ("haas", "light · Haas white")]
ANGLES = [("side", "side"), ("graze", "45° grazing"), ("spec", "specular")]
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


def cmd_files():
    """Print the Artifact `files` list (root artifacts/finish-designs/r4m) for every JPEG not served as a blob."""
    assets = load_assets()
    print(json.dumps([{"path": "jpg/" + n} for n in sorted(os.listdir(os.path.join(SRC, "jpg")))
                      if os.path.relpath(os.path.join(SRC, "jpg", n), ROOT) not in assets]))


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


def changed_mask(a, b):
    import numpy as np
    A = np.asarray(Image.open(a).convert("RGB")).astype(np.int16)
    B = np.asarray(Image.open(b).convert("RGB")).astype(np.int16)
    return np.abs(A - B).max(axis=2) > THRESH


def cmd_diff():
    """Share of the PAINT AREA that changed vs gloss. The paint area of a cell (team x angle x light) is the union of
    pixels any of the 18 finishes changes there, so 100% = every paintable pixel moved (ultra black does that)."""
    import numpy as np
    groups = {}
    for light, key, team, angle, p in cells():
        if key != "gloss":
            groups.setdefault((light, team, angle), []).append((key, p))
    out = {}
    for (light, team, angle), items in groups.items():
        base = os.path.join(SRC, light, f"gloss-{team}-{angle}.png")
        if not os.path.exists(base):
            continue
        masks = {k: changed_mask(p, base) for k, p in items}
        area = np.logical_or.reduce(list(masks.values())).sum()
        for k, m in masks.items():
            out[f"{light}-{k}-{team}-{angle}"] = round(100.0 * m.sum() / max(area, 1), 1)
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
    up = {k for k in assets} | {os.path.relpath(jpg_path(*c), ROOT) for c in have if os.path.exists(jpg_path(*c))}
    shot = sum(1 for c in have if c[1] != "gloss" and os.path.relpath(jpg_path(*c), ROOT) in up)
    pending = []
    verdicts = {}
    vp = os.path.join(HERE, "r4-verdicts.json")
    if os.path.exists(vp):
        verdicts = json.load(open(vp))

    def img(light, key, team, angle, cap):
        j = jpg_path(light, key, team, angle)
        url = assets.get(os.path.relpath(j, ROOT)) or (f"jpg/{os.path.basename(j)}" if os.path.exists(j) else None)
        if not url:
            return '<figure class="r4c r4miss"><figcaption>not shot yet</figcaption></figure>'
        d = diffs.get(f"{light}-{key}-{team}-{angle}")
        tag = f'<span class="r4d">{d:.1f}% of the paint changed vs gloss</span>' if d is not None else '<span class="r4d">baseline</span>'
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
            if not any(os.path.relpath(jpg_path(l, key, t, a), ROOT) in up for l, _ in LIGHTS for t, _ in TEAMS for a, _ in ANGLES):
                pending.append(f"#{fid} {key}" if fid else key)
                continue
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
    {f'<p class="note">Still shooting: {", ".join(pending)}.</p>' if pending else ""}
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


def cmd_record():
    """(Round 4 batch 1 only; later batches publish the JPEGs as the artifact's own files at jpg/<name>, root
    artifacts/finish-designs/r4m.) stdin: the Artifact asset-upload result lines, `- "<path>" (…) → "/_blob/<id>"`; merged into r4-assets.json."""
    import re
    assets = load_assets()
    for m in re.finditer(r'"([^"]+\.jpg)"[^\n]*?"(/_blob/[0-9a-f]{32})"', sys.stdin.read()):
        assets[m.group(1)] = m.group(2)
    json.dump(assets, open(os.path.join(HERE, "r4-assets.json"), "w"), indent=0, sort_keys=True)
    print(len(assets), "assets recorded")


if __name__ == "__main__":
    {"jpg": cmd_jpg, "diff": cmd_diff, "html": cmd_html, "record": cmd_record, "files": cmd_files}[sys.argv[1]]()
