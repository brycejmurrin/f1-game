"""Build the B·D5 livery-layout gallery: scratch/livery-d5/site/{index.html,img/*.jpg}.

Usage: python3 -I scratch/livery-d5/build.py <capture dir> [round]
Captures come from tools/shot/garage-angles.mjs (TLX, files <team>-<design>-<cam>.png).
"""
import html, itertools, json, os, sys
from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = sys.argv[1]
ROUND = int(sys.argv[2]) if len(sys.argv) > 2 else 1
SITE = os.path.join(ROOT, "site")
os.makedirs(os.path.join(SITE, "img"), exist_ok=True)
DATA = json.load(open(os.path.join(ROOT, "designs.json")))
TEAMS = [("mclaren", "McLaren colours (papaya / anthracite)"), ("williams", "Williams colours (blue / white)")]
CAMS = [("free_az54_el17_d4_6", "Front three-quarter"), ("free_az90_el8_d7", "Side")]

def find(team, did, cam):
    p = os.path.join(SRC, f"{team}-{did}-{cam}.png")
    return p if os.path.exists(p) else None

# Pixel diff: % of pixels whose luminance moved by >24/255 between two designs, same team and camera.
diffs = {}
area = {}
for team, _ in TEAMS:
    for cam, _ in CAMS:
        imgs = {d["id"]: Image.open(p).convert("RGB") for d in DATA["designs"] if (p := find(team, d["id"], cam))}
        masks = {}
        for a, b in itertools.combinations(imgs, 2):
            masks[(a, b)] = ImageChops.difference(imgs[a], imgs[b]).convert("L").point(lambda v: 255 if v > 24 else 0)
        if not masks: continue
        union = None
        for m in masks.values(): union = m if union is None else ImageChops.lighter(union, m)
        n = union.histogram()[255] or 1
        area[(team, cam)] = n
        for (a, b), m in masks.items():
            diffs.setdefault(tuple(sorted((a, b))), []).append(m.histogram()[255] / n * 100)

def jpg(src, name):
    out = os.path.join(SITE, "img", name)
    im = Image.open(src).convert("RGB")
    im.thumbnail((960, 960)); im.save(out, quality=82)
    return "img/" + name

ids = [d["id"] for d in DATA["designs"]]
cards = []
for d in sorted(DATA["designs"], key=lambda d: d["rank"]):
    shots = []
    for team, tl in TEAMS:
        for cam, cl in CAMS:
            p = find(team, d["id"], cam)
            if p:
                shots.append(f'<figure><img src="{jpg(p, f"r{ROUND}-{team}-{d["id"]}-{cam}.jpg")}" alt="{html.escape(d["label"])} on {tl}, {cl.lower()} view" loading="lazy"><figcaption>{tl} · {cl}</figcaption></figure>')
            else:
                shots.append(f'<figure class="missing"><div>not captured</div><figcaption>{tl} · {cl}</figcaption></figure>')
    near = min(((min(v), (set(k) - {d["id"]}).pop()) for k, v in diffs.items() if d["id"] in k), default=None)
    near_txt = f'Closest other design: <b>{near[1]}</b>, {near[0]:.1f}% of the paint area differs (worst of the 4 frames).' if near else ""
    refs = " · ".join(f'<a href="{html.escape(u)}" target="_blank" rel="noopener">{html.escape(t)}</a>' for t, u in d["refs"])
    cards.append(f'''<section class="design" id="{d["id"]}">
  <header><span class="rank">#{d["rank"]}</span><h2>{html.escape(d["label"])}</h2><code>{d["id"]}</code></header>
  <p class="layout">{html.escape(d["layout"])}</p>
  <p class="ref"><span>After</span> {html.escape(d["after"])} — {refs}</p>
  <div class="shots">{"".join(shots)}</div>
  <p class="metric">{near_txt}</p>
</section>''')

matrix = '<table><thead><tr><th></th>' + "".join(f"<th>{i}</th>" for i in ids) + "</tr></thead><tbody>"
for a in ids:
    matrix += f"<tr><th>{a}</th>"
    for b in ids:
        v = diffs.get(tuple(sorted((a, b))))
        matrix += "<td>—</td>" if a == b or not v else f"<td>{min(v):.1f}%</td>"
    matrix += "</tr>"
matrix += "</tbody></table>"

rounds = "".join(
    f'<details{" open" if r["round"] == ROUND else ""}><summary>Round {r["round"]} · {html.escape(r["date"])}</summary><p>{html.escape(r["changed"])}</p></details>'
    for r in sorted(DATA["rounds"], key=lambda r: -r["round"]))

page = open(os.path.join(ROOT, "template.html")).read()
page = page.replace("{{ROUND}}", str(ROUND)).replace("{{CARDS}}", "\n".join(cards))
page = page.replace("{{MATRIX}}", matrix).replace("{{ROUNDS}}", rounds).replace("{{RANKED}}", ", ".join(d["id"] for d in sorted(DATA["designs"], key=lambda d: d["rank"])))
open(os.path.join(SITE, "index.html"), "w").write(page)
print(json.dumps({"pairs": {"|".join(k): round(min(v), 2) for k, v in diffs.items()}}, indent=1))
