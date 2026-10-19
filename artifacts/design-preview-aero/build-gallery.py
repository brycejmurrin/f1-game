# Assemble the B·D3 aero preview gallery (single self-contained HTML, JPEG data URIs).
import base64, io, json, os
from PIL import Image
D = "artifacts/design-preview-aero"; S = D + "/studio"
diff = json.load(open(D + "/r1/diff.json"))               # round-1 numbers, overridden by any reshot frame
if os.path.exists(S + "/diff.json"):
    for k, v in json.load(open(S + "/diff.json")).items(): diff.setdefault(k, {}).update({a: b for a, b in v.items() if b is not None})
refs = json.load(open(D + "/refs/manifest-rear.json")) + json.load(open(D + "/refs/manifest-front.json"))
def uri(p, w=900, q=72):
    im = Image.open(p).convert("RGB"); im.thumbnail((w, w))
    b = io.BytesIO(); im.save(b, "JPEG", quality=q, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
C = json.load(open(D + "/candidates.json"))
def pick(cid, v):                       # round-2 frame if reshot, else the round-1 frame recovered from the artifact
    p = f"{S}/{cid}/{v}.png"
    return p if os.path.exists(p) else f"{D}/r1/{cid}/{v}.jpg"
def fig(src, cap, cls=""):
    return f'<figure class="{cls}"><img loading="lazy" src="{uri(src)}" alt="{cap}"><figcaption>{cap}</figcaption></figure>' if os.path.exists(src) else f'<figure class="missing {cls}"><div class="ph">not captured</div><figcaption>{cap}</figcaption></figure>'
cards = []
for c in C:
    cid, base = c["id"], c["base"]; d = diff.get(cid, {})
    rs = [r for r in refs if r["subject"] == c["ref"]]
    refhtml = ""
    for r in rs:
        if r.get("file") and os.path.exists(f"{D}/refs/{r['file']}"):
            refhtml += fig(f"{D}/refs/{r['file']}", f"Reference: {r['car']} {r['year']} · {r['view']}", "ref") + f'<p class="lic">{r["author"]} · {r["license"]} · <a href="{r["source_page_url"]}">source</a></p>'
        else:
            refhtml += f'<div class="ref-missing"><b>{r["car"]} {r["year"]}</b><span>{r.get("status","not fetched")}</span><a href="{r["source_page_url"]}">Open the reference on Commons</a><span class="lic">{r["author"]} · {r["license"]}</span></div>'
    rows = ""
    for v, lab in (("q34", "3/4 close-up"), ("side", "Side"), ("top", "Top"), ("phone", "Phone 844×390")):
        pct = d.get(v); pc = "—" if pct is None else f"{pct:.2f}% px changed"
        rows += f'<div class="trip"><h4>{lab} <span class="pct">{pc}</span></h4><div class="tri">' + \
            fig(pick(cid, v), "Candidate" + ("" if os.path.exists(f"{S}/{cid}/{v}.png") else " (round 1)")) + fig(f"{D}/r1/{base}/{v}.jpg", f"Base: {base}") + fig(pick(cid, v + "-diff"), "Changed pixels") + "</div></div>"
    cards.append(f'''<section class="cand" id="{cid}"><header><span class="rank">#{c["rank"]}</span><h2>{c["name"]}</h2><code>{c["cat"]}/{cid} · {c["field"]}: 1</code></header>
<p class="what">{c["what"]}</p><p class="src"><b>Real car:</b> {c["source"]} · <b>Clones:</b> {base} (same cost and stats)</p>
<div class="refs">{refhtml}</div>{rows}</section>''')
F = json.load(open(D + "/fit/fit.json"))
fits = []
for c in C:
    cid = c["id"]; f = F[cid]; pics = ""
    for v in (("q34", "side") if cid in ("x_wings", "monkey_seat") else ("q34",)):
        if os.path.exists(f"{S}/{cid}/{v}.png"):        # reshot in round 2: same framing as round 1
            pics += fig(f"{D}/r1/{cid}/{v}.jpg", f"Round 1 · {v}") + fig(f"{S}/{cid}/{v}.png", f"Round 2 · {v}")
    fits.append(f'<div class="fitrow"><h3>{c["name"]} <code>{cid}</code></h3><p class="lic">{f["joint"]}</p><div class="pair">{pics}</div>'
                f'<dl><dt>Before</dt><dd>{f["before"]}</dd><dt>After</dt><dd>{f["after"]}</dd></dl></div>')
html = open(D + "/gallery-template.built.html").read().replace("%%CARDS%%", "\n".join(cards)).replace("%%FIT%%", "\n".join(fits))
html = html.replace("%%TOC%%", "".join(f'<a href="#{c["id"]}"><span>#{c["rank"]}</span> {c["name"]}</a>' for c in C))
open(D + "/aero-preview.html", "w").write(html); print(len(html)//1024, "KB")
