#!/usr/bin/env python3
"""Build scratch/h23/gallery/index.html from pairs.json + mem/perf/census JSON. Images are sibling files."""
import json, os, html

ROOT = os.path.dirname(os.path.abspath(__file__))
G = os.path.join(ROOT, "gallery")
pairs = {p["pair"]: p for p in json.load(open(os.path.join(G, "pairs.json")))}
facts = json.load(open(os.path.join(ROOT, "facts.json")))   # hand-assembled numbers (mem, perf, census, captions)

ORDER = [
    ("menu-low", "Title menu", "Menu is DOM over a canvas backdrop; identical on both."),
    ("garage-low", "Garage car", ""),
    ("monza-helmet-low", "Monza helmet cam (phone default view)", ""),
    ("monza-straight-low", "Monza straight, chase", ""),
    ("monaco-kerb-low", "Monaco kerbs, orbit", ""),
    ("monaco-kerb-med", "Monaco kerbs, MED 0.75 + UPSCALE", ""),
    ("spa-chase-low", "Spa, chase", ""),
    ("spa-chase-med", "Spa, chase, MED 0.75 + UPSCALE", ""),
    ("spa-rain-low", "Spa in rain, chase", ""),
    ("singapore-night-low", "Singapore at night, chase", ""),
    ("singapore-night-med", "Singapore night, MED 0.75 + UPSCALE", ""),
    ("monza-mirror-low", "Rear-view mirror (helmet cam, HUD on)", ""),
]
captions = facts.get("captions", {})

def esc(s): return html.escape(str(s))

cards = []
for key, title, note in ORDER:
    p = pairs.get(key)
    if not p: continue
    note = captions.get(key, note)
    sev = "hi" if p["pctDiff"] >= 15 else "mid" if p["pctDiff"] >= 5 else "lo"
    cards.append(f'''
<section class="pair" id="{esc(key)}">
  <header class="pair-h">
    <h3>{esc(title)}</h3>
    <div class="chips">
      <span class="chip {sev}" title="pixels whose RGB differs by more than 30 summed">{p["pctDiff"]}% px differ</span>
      <span class="chip">MAD {p["mad"]}</span>
      <span class="chip">luma TLX {p["lumTLX"]} · GLX {p["lumGLX"]}</span>
    </div>
  </header>
  {f'<p class="note">{esc(note)}</p>' if note else ''}
  <div class="duo">
    <figure><img loading="lazy" src="{key}-tlx.jpg" alt="{esc(title)} on TLX"><figcaption><b class="tlx">TLX</b> three.js (current default)</figcaption></figure>
    <figure><img loading="lazy" src="{key}-glx.jpg" alt="{esc(title)} on GLX"><figcaption><b class="glx">GLX</b> plain WebGL2</figcaption></figure>
  </div>
  <div class="zoom">
    <div class="flip" data-a="{key}-tlx-crop.jpg" data-b="{key}-glx-crop.jpg" tabindex="0" role="button" aria-label="Tap to switch between TLX and GLX">
      <img loading="lazy" src="{key}-tlx-crop.jpg" alt="Biggest-difference crop at 3x"><span class="tag tlx">TLX</span>
    </div>
    <div class="zoom-side">
      <p class="hint">3× crop of the most different region (native iPhone pixels). <b>Tap the crop</b> to flip TLX ↔ GLX.</p>
      <img class="heat" loading="lazy" src="{key}-diff.jpg" alt="Difference heat map: brighter is more different">
      <p class="hint">Difference map: bright = different.</p>
    </div>
  </div>
</section>''')

def table(rows, head):
    th = "".join(f"<th>{esc(h)}</th>" for h in head)
    tr = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f'<div class="tw"><table><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table></div>'

mem_t = table(facts["memRows"], ["Moment", "TLX heap+ArrayBuffers", "GLX heap+ArrayBuffers", "TLX ArrayBuffers", "GLX ArrayBuffers"])
perf_t = table(facts["perfRows"], facts["perfHead"])
gap_t = table(facts["gapRows"], ["Feature", "TLX on phone", "GLX on phone", "Shows in stills?"])

page = f'''<title>Phone Renderer A/B</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,600;1,700&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;600&display=swap">
<style>
/* Layout: a pit-wall timing sheet — summary verdict up top, then data tables, then one card per frozen frame. */
:root {{
  --bg:#f3f4f6; --panel:#ffffff; --ink:#15171c; --mute:#5b6170; --line:#d9dce3;
  --tlx:#c2410c; --glx:#0e7490; --hi:#b91c1c; --mid:#a16207; --lo:#15803d;
  --display:"Barlow Condensed","Arial Narrow",sans-serif; --body:"IBM Plex Sans",system-ui,sans-serif; --mono:"IBM Plex Mono",ui-monospace,monospace;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --bg:#0f1115; --panel:#171a21; --ink:#e8eaf0; --mute:#9aa1b2; --line:#2a2f3a;
  --tlx:#fb923c; --glx:#22d3ee; --hi:#f87171; --mid:#facc15; --lo:#4ade80; color-scheme:dark }} }}
:root[data-theme="dark"] {{
  --bg:#0f1115; --panel:#171a21; --ink:#e8eaf0; --mute:#9aa1b2; --line:#2a2f3a;
  --tlx:#fb923c; --glx:#22d3ee; --hi:#f87171; --mid:#facc15; --lo:#4ade80; color-scheme:dark }}
body {{ background:var(--bg); color:var(--ink); font:15px/1.55 var(--body); }}
.wrap {{ max-width:1180px; margin:0 auto; padding-block:24px 64px; padding-left:max(16px, env(safe-area-inset-left, 0px)); padding-right:max(16px, env(safe-area-inset-right, 0px)); display:grid; gap:28px; }}
h1,h2,h3 {{ font-family:var(--display); font-style:italic; letter-spacing:.01em; text-wrap:balance; margin:0; }}
h1 {{ font-size:clamp(2rem,5vw,3.1rem); line-height:1; }}
h2 {{ font-size:1.6rem; text-transform:uppercase; }}
h3 {{ font-size:1.3rem; }}
.kicker {{ font:600 .78rem var(--mono); letter-spacing:.08em; text-transform:uppercase; color:var(--mute); }}
p {{ margin:0; max-width:72ch; }}
.tlx {{ color:var(--tlx); }} .glx {{ color:var(--glx); }}
.verdict {{ background:var(--panel); border:1px solid var(--line); border-left:6px solid var(--glx); padding:18px 20px; display:grid; gap:10px; }}
.stats {{ display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:12px; }}
.stat {{ background:var(--panel); border:1px solid var(--line); padding:12px 14px; display:grid; gap:2px; }}
.stat b {{ font:600 1.5rem var(--mono); font-variant-numeric:tabular-nums; }}
.stat span {{ color:var(--mute); font-size:.85rem; }}
section.block {{ display:grid; gap:12px; }}
.tw {{ overflow-x:auto; border:1px solid var(--line); background:var(--panel); }}
table {{ border-collapse:collapse; width:100%; font-size:.88rem; }}
th,td {{ text-align:left; padding:7px 10px; border-bottom:1px solid var(--line); vertical-align:top; }}
th {{ font:600 .74rem var(--mono); text-transform:uppercase; letter-spacing:.06em; color:var(--mute); }}
td {{ font-variant-numeric:tabular-nums; }}
.pair {{ background:var(--panel); border:1px solid var(--line); padding:14px; display:grid; gap:12px; min-width:0; }}
.pair-h {{ display:flex; flex-wrap:wrap; gap:8px 16px; align-items:baseline; justify-content:space-between; }}
.chips {{ display:flex; flex-wrap:wrap; gap:6px; }}
.chip {{ font:600 .74rem var(--mono); padding:3px 8px; border:1px solid var(--line); border-radius:3px; color:var(--mute); }}
.chip.hi {{ color:var(--hi); border-color:var(--hi); }} .chip.mid {{ color:var(--mid); border-color:var(--mid); }} .chip.lo {{ color:var(--lo); border-color:var(--lo); }}
.note {{ color:var(--mute); }}
.duo {{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }}
@media (max-width:640px) {{ .duo {{ grid-template-columns:1fr; }} }}
figure {{ margin:0; display:grid; gap:4px; min-width:0; }}
figure img, .flip img, .heat {{ width:100%; height:auto; display:block; border:1px solid var(--line); }}
figcaption {{ font-size:.82rem; color:var(--mute); }}
figcaption b {{ font-family:var(--mono); }}
.zoom {{ display:grid; grid-template-columns:2fr 1fr; gap:12px; align-items:start; }}
@media (max-width:640px) {{ .zoom {{ grid-template-columns:1fr; }} }}
.flip {{ position:relative; cursor:pointer; min-width:0; }}
.flip:focus-visible {{ outline:3px solid var(--glx); outline-offset:2px; }}
.tag {{ position:absolute; top:8px; left:8px; font:600 .8rem var(--mono); background:var(--panel); padding:2px 8px; border:1px solid currentColor; }}
.zoom-side {{ display:grid; gap:8px; min-width:0; }}
.hint {{ font-size:.82rem; color:var(--mute); }}
.toc {{ display:flex; flex-wrap:wrap; gap:6px; }}
.toc a {{ font:600 .78rem var(--mono); color:var(--ink); text-decoration:none; border:1px solid var(--line); padding:4px 8px; background:var(--panel); }}
.toc a:hover, .toc a:focus-visible {{ border-color:var(--glx); }}
code {{ font-family:var(--mono); font-size:.88em; }}
</style>
<div class="wrap">
  <header style="display:grid;gap:8px">
    <div class="kicker">Apex 26 · B·H23 · {esc(facts["date"])} · round {esc(facts["round"])}</div>
    <h1>Phone renderer A/B: <span class="tlx">TLX</span> vs <span class="glx">GLX</span></h1>
    <p>{esc(facts["setup"])}</p>
  </header>
  <div class="verdict"><div class="kicker">Recommendation</div><p>{facts["recommendation"]}</p></div>
  <div class="stats">{"".join(f'<div class="stat"><span>{esc(a)}</span><b>{esc(b)}</b><span>{esc(c)}</span></div>' for a,b,c in facts["tiles"])}</div>
  <section class="block"><h2>Memory</h2><p>{esc(facts["memNote"])}</p>{mem_t}</section>
  <section class="block"><h2>Frame time</h2><p>{esc(facts["perfNote"])}</p>{perf_t}</section>
  <section class="block"><h2>What GLX lacks (and doesn't)</h2><p>{esc(facts["gapNote"])}</p>{gap_t}</section>
  <section class="block"><h2>Side by side</h2><p>{esc(facts["stillsNote"])}</p>
    <nav class="toc">{"".join(f'<a href="#{k}">{esc(t)}</a>' for k,t,_ in ORDER if k in pairs)}</nav>
  </section>
  {"".join(cards)}
  <p class="hint">{esc(facts["footer"])}</p>
</div>
<script>
document.querySelectorAll(".flip").forEach((el) => {{
  const img = el.querySelector("img"), tag = el.querySelector(".tag");
  let b = false;
  const flip = () => {{ b = !b; img.src = b ? el.dataset.b : el.dataset.a; tag.textContent = b ? "GLX" : "TLX"; tag.className = "tag " + (b ? "glx" : "tlx"); }};
  el.addEventListener("click", flip);
  el.addEventListener("keydown", (e) => {{ if (e.key === "Enter" || e.key === " ") {{ e.preventDefault(); flip(); }} }});
}});
</script>
'''
open(os.path.join(G, "index.html"), "w").write(page)
print("wrote", os.path.join(G, "index.html"), len(page))
