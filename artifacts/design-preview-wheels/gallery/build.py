# B·D4 living gallery: python3 -I build.py  (run from this directory)
# Current round on top, a changelog, earlier rounds collapsed below.
# Images: <id>-{wheel,cockpit,hero,phone,near,diff}.jpg (current), r<N>/... (archived).
import html, json

ROUND = 2
CHANGELOG = [
    (2, "drum: pale drilled face (3 rings of 54 holes) and a wide gold heat-foil band, so it no longer reads as the dark carbon disc. "
        "blownaxle: hub ring 0.34→0.44 of the rim, bore 0.55→0.62, orange machined lip and six drive pegs. "
        "Reference hunt stopped (Commons 429 fleet-wide): ysplit, drum and halomirror marked 'no CC photo found'."),
    (1, "Five candidates on opt-in fields: ysplit, mirrorframe, halomirror, blownaxle, drum."),
]
ROUND1_DIFF = {"ysplit": 4.28, "blownaxle": 3.53, "drum": 1.86, "halomirror": 1.18, "mirrorframe": 1.02}
refs = {e["id"]: e for e in json.load(open("../refs/manifest.json"))}
diff = json.load(open("diff.json"))

C = [
 dict(id="ysplit", opt="style_wheels_ysplit", name="Y-Split Mag", cat="Wheels", field="wheels.spokeSplit", near="mag_forged (Forged Mag)", close="wheel",
  real="BBS forged-magnesium 18-inch rims, 2022 onward (Y-split spoke pairs, visible on 2026 open rims)",
  what="Five spokes fork into ten tines at 55% of the span, so the lip carries ten thin tips instead of eight straight blades.",
  haus="131 mm", area="1.01 m²", refs=["baseline"], refnote="No CC photo found of a modern rim close-up. The 2026 W17 shot is the baseline wheel at race distance.", r=1),
 dict(id="mirrorframe", opt="style_cockpit_mirrorframe", name="Framed Mirrors", cat="Cockpit", field="cockpit.mirrorFrame", near="deflector (Deflector)", close="cockpit",
  real="Ferrari SF90 / SF1000 and Red Bull RB16, 2019–2021",
  what="A lower aero blade and two vertical struts box each housing, 22 mm off it, plus a turning-vane foot outboard.",
  haus="59 mm", area="0.40 m²", refs=["mirrorframe", "mirrorframe_alt"], refnote="RB16 and SF1000 both show the winglet frame round the housing.", r=1),
 dict(id="halomirror", opt="style_cockpit_halomirror", name="Halo Mirrors", cat="Cockpit", field="cockpit.mirrorMount", near="faired_halo (Faired Halo)", close="cockpit",
  real="Ferrari SF71H, 2018 (from the Spanish GP); halo-strut mounts still run in 2026",
  what="Housings move up onto the halo crown corners (y 0.83, 12 cm further forward) on two swept stays; the tub stalk and outer stay go.",
  haus="194 mm", area="0.35 m²", refs=["halomirror"], refnote="No CC photo found of the SF71H mount. The 2026 Red Bull shot shows a mirror on the halo strut.", r=1),
 dict(id="blownaxle", opt="style_wheels_blownaxle", name="Blown Axle", cat="Wheels", field="wheels.blownAxle", near="open_spoke (Open Spoke)", close="wheel",
  real='Hollow "blown" front axles, Mercedes W08–W11 and Ferrari SF70H–SF21, 2017–2021',
  what="The centre nut gives way to a wide hub ring (0.44 of the rim) round a dark bore, with an orange machined lip and six drive pegs.",
  haus=None, area=None, refs=["blownaxle"], refnote="Only a hint: the SF70H garage shot shows the hollow duct behind the wheel, not a clean hub.", r=2),
 dict(id="drum", opt="style_brakes_drum", name="Cake-Tin Drum", cat="Brakes", field="brakes.drum", near="carbon (Carbon), same Open Spoke wheel", close="wheel",
  real='Carbon brake drums ("cake tins") round the disc, 2017–2021 front corners',
  what="A pale weave drum encloses the disc: three rings of cooling holes on each face and a wide gold heat-foil band at the outer edge.",
  haus=None, area=None, refs=[], refnote="No CC photo found (three searches; Commons rate-limited).", r=2),
]
MEAS = json.load(open("meas.json")) if __import__("os").path.exists("meas.json") else {}

def fig(src, cap, cls=""):
    return f'<figure class="{cls}"><img src="{src}" alt="{html.escape(cap)}" loading="lazy"><figcaption>{cap}</figcaption></figure>'

def refblock(c):
    out = "".join(fig(f"ref-{r}.jpg", f"Real car: {html.escape(refs[r]['car'])} {refs[r].get('year','')} · {html.escape(refs[r]['licence'])} · <a href=\"{refs[r]['source_page_url']}\">source</a>", "ref") for r in c["refs"])
    return out or '<div class="noref">No CC photo found</div>'

secs = []
for i, c in enumerate(C, 1):
    m = MEAS.get(c["id"], {})
    haus, area = m.get("haus", c["haus"]), m.get("area", c["area"])
    other = "cockpit" if c["close"] == "wheel" else "wheel"
    badge = f'<span class="new">changed in round {ROUND}</span>' if c["r"] == ROUND else ""
    secs.append(f'''<section class="cand" id="{c['id']}">
<header><div class="rank">#{i}</div><div class="hd"><h2>{c['name']} <span class="sid">{c['id']}</span></h2>
<p class="meta"><span class="chip">{c['cat']}</span><code>{c['opt']}</code> · field <code>{c['field']}</code> {badge}</p></div>
<dl class="stats"><div><dt>Hausdorff vs nearest</dt><dd>{haus}</dd></div><div><dt>Moved area</dt><dd>{area}</dd></div><div><dt>Close-up pixels changed</dt><dd>{diff[c['id']]}%</dd></div></dl></header>
<p class="src"><b>Real-car source.</b> {c['real']}</p><p class="src"><b>What changed.</b> {c['what']}</p>
<h3>Close-up next to its reference</h3>
<div class="grid g3">{refblock(c)}{fig(f"{c['id']}-{c['close']}.jpg", 'Candidate')}{fig(f"{c['id']}-near.jpg", 'Nearest existing: ' + c['near'])}</div>
<p class="note">{c['refnote']}</p>
<h3>Pixel diff vs nearest, and the other angles</h3>
<div class="grid g4">{fig(f"{c['id']}-diff.jpg", 'Changed pixels (magenta) over the nearest part')}{fig(f"{c['id']}-{other}.jpg", ('Wheel' if other == 'wheel' else 'Cockpit') + ' close-up')}{fig(f"{c['id']}-hero.jpg", '3/4 garage view')}{fig(f"{c['id']}-phone.jpg", 'Phone 844×390')}</div>
</section>''')

r1 = "".join(f'<div class="r1row"><h4>{c["name"]} <span class="sid">{c["id"]}</span> · {ROUND1_DIFF[c["id"]]}% changed</h4><div class="grid g3">{fig(f"r1/{c["id"]}-{c["close"]}.jpg", "Round 1 candidate")}{fig(f"r1/{c["id"]}-near.jpg", "Nearest existing")}{fig(f"r1/{c["id"]}-diff.jpg", "Round 1 diff")}</div></div>' for c in C if c["r"] > 1)
log = "".join(f"<li><b>Round {n}.</b> {html.escape(t)}</li>" for n, t in CHANGELOG)
ranked = " · ".join(c["id"] for c in C)

page = f'''<title>Wheel and Cockpit Candidates</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* Layout: one pit-wall sheet per candidate, ranked top to bottom; reference left, candidate, nearest part. */
:root{{--bg:#f3f4f2;--panel:#ffffff;--fg:#17191c;--muted:#5b6168;--line:#d9dcd8;--accent:#d2560f;--chip:#e8ebe6;--new:#0b7a55;
--display:"Barlow Condensed","Arial Narrow",sans-serif;--body:"IBM Plex Sans",system-ui,sans-serif;--mono:"IBM Plex Mono",ui-monospace,monospace}}
@media (prefers-color-scheme:dark){{:root:not([data-theme="light"]){{--bg:#121417;--panel:#1a1d21;--fg:#e8eaec;--muted:#9aa1a8;--line:#2c3036;--accent:#ff8a3d;--chip:#262a30;--new:#4fd1a1;color-scheme:dark}}}}
:root[data-theme="dark"]{{--bg:#121417;--panel:#1a1d21;--fg:#e8eaec;--muted:#9aa1a8;--line:#2c3036;--accent:#ff8a3d;--chip:#262a30;--new:#4fd1a1;color-scheme:dark}}
body{{background:var(--bg);color:var(--fg);font:15px/1.55 var(--body);padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px));padding-block:28px 64px}}
main{{max-width:1180px;margin:0 auto;display:flex;flex-direction:column;gap:28px}}
h1{{font:700 clamp(30px,5vw,46px)/1.05 var(--display);letter-spacing:.01em;margin:0;text-wrap:balance}}
.lede{{max-width:68ch;color:var(--muted);margin:8px 0 0}}
.kv{{font:13px var(--mono);color:var(--muted);overflow-wrap:anywhere}} .kv b{{color:var(--fg);font-weight:500}}
ol.short,ul.log{{margin:0;padding-left:22px;display:grid;gap:4px;max-width:90ch}} ol.short li::marker{{font:600 15px var(--display);color:var(--accent)}}
.cand{{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:20px;display:flex;flex-direction:column;gap:10px}}
.cand header{{display:flex;flex-wrap:wrap;gap:12px 20px;align-items:flex-start}}
.rank{{font:700 40px/1 var(--display);color:var(--accent);min-width:2ch}}
.hd{{flex:1 1 280px;min-width:0}} h2{{font:700 30px/1.05 var(--display);margin:0;letter-spacing:.01em}}
.sid{{font:500 13px var(--mono);color:var(--accent);vertical-align:middle;margin-left:6px}}
.new{{font:600 11px var(--body);letter-spacing:.06em;text-transform:uppercase;color:var(--new);margin-left:6px}}
.meta{{margin:4px 0 0;color:var(--muted);font-size:13px;overflow-wrap:anywhere}} code{{font:12.5px var(--mono)}}
.chip{{display:inline-block;background:var(--chip);border-radius:3px;padding:1px 7px;font:600 11px var(--body);letter-spacing:.06em;text-transform:uppercase;color:var(--fg);margin-right:6px}}
.stats{{display:flex;flex-wrap:wrap;gap:6px 22px;margin:0}} .stats div{{display:flex;flex-direction:column}}
dt{{font:500 11px var(--body);letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}} dd{{margin:0;font:500 18px var(--mono);font-variant-numeric:tabular-nums}}
.src{{margin:0;max-width:80ch}} h3{{font:600 13px var(--body);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin:10px 0 0}}
h4{{font:600 20px var(--display);margin:6px 0}}
.grid{{display:grid;gap:10px}} .g3{{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}} .g4{{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}}
figure{{margin:0;display:flex;flex-direction:column;gap:4px;min-width:0}} figure img{{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:3px;background:var(--chip)}}
figure.ref img{{object-fit:contain}} figcaption{{font-size:12.5px;color:var(--muted)}} figcaption a{{color:var(--accent)}}
.noref{{display:grid;place-items:center;aspect-ratio:16/9;border:1px dashed var(--line);border-radius:3px;color:var(--muted);font-size:13px}}
.note{{margin:0;font-size:13px;color:var(--muted)}}
details{{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:14px 20px}} summary{{cursor:pointer;font:600 22px var(--display)}}
summary:focus-visible{{outline:2px solid var(--accent);outline-offset:3px}}
footer{{color:var(--muted);font-size:13px;max-width:80ch}}
</style>
<main>
<div><h1>Wheel and Cockpit Candidates</h1>
<p class="lede">B·D4 design preview for the garage catalog: shapes real F1 cars ran, each behind an opt-in field the shipped grid never sets. McLaren livery, garage lighting, same camera for candidate and nearest existing part. Say “iterate &lt;id&gt;” to send a design back for another round.</p>
<p class="kv">round <b>{ROUND}</b> · branch <b>cursor/design-preview-wheels-c1da</b> @ <b>@@SHA@@</b> · based on #3118 head · no PR</p></div>
<div><h3>Changelog</h3><ul class="log">{log}</ul></div>
<div><h3>Ranked shortlist</h3><ol class="short">
<li><b>ysplit</b>: reads at every distance, the only one still visible at phone size.</li>
<li><b>mirrorframe</b>: clear in close-up and 3/4, with two good period references.</li>
<li><b>halomirror</b>: the largest geometric move; reads in the cockpit close-up.</li>
<li><b>blownaxle</b>: round 2 hub is wider with a coloured lip; reads in close-up and 3/4.</li>
<li><b>drum</b>: round 2 face is now pale and drilled with a gold band, clearly not the carbon disc up close.</li></ol></div>
{''.join(secs)}
<details><summary>Round 1 (earlier designs, changed since)</summary>{r1}</details>
<footer>Diff threshold: any channel moving more than 24/255. Hausdorff and moved area come from tools/car/parts-sweep.mjs compare() on the full car mesh against the candidate's equivalent. Phone frames use the garage hero view at 844×390. Reference photos are from Wikimedia Commons under the licences shown; authors are on each source page. Ranked: {ranked}.</footer>
</main>'''
open("index.html", "w").write(page.replace("@@SHA@@", open("sha.txt").read().strip() if __import__("os").path.exists("sha.txt") else "unpushed"))
print("wrote index.html", len(page))
