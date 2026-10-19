# Assemble the B·D3 aero preview gallery (single self-contained HTML, JPEG data URIs).
import base64, io, json, os
from PIL import Image
D = "artifacts/design-preview-aero"; S = D + "/studio"
diff = json.load(open(S + "/diff.json"))
refs = json.load(open(D + "/refs/manifest-rear.json")) + json.load(open(D + "/refs/manifest-front.json"))
def uri(p, w=900, q=72):
    im = Image.open(p).convert("RGB"); im.thumbnail((w, w))
    b = io.BytesIO(); im.save(b, "JPEG", quality=q, optimize=True)
    return "data:image/jpeg;base64," + base64.b64encode(b.getvalue()).decode()
C = json.load(open(D + "/candidates.json"))
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
            fig(f"{S}/{cid}/{v}.png", "Candidate") + fig(f"{S}/{base}/{v}.png", f"Base: {base}") + fig(f"{S}/{cid}/{v}-diff.png", "Changed pixels") + "</div></div>"
    cards.append(f'''<section class="cand" id="{cid}"><header><span class="rank">#{c["rank"]}</span><h2>{c["name"]}</h2><code>{c["cat"]}/{cid} · {c["field"]}: 1</code></header>
<p class="what">{c["what"]}</p><p class="src"><b>Real car:</b> {c["source"]} · <b>Clones:</b> {base} (same cost and stats)</p>
<div class="refs">{refhtml}</div>{rows}</section>''')
html = open(D + "/gallery-template.built.html").read().replace("%%CARDS%%", "\n".join(cards))
html = html.replace("%%TOC%%", "".join(f'<a href="#{c["id"]}"><span>#{c["rank"]}</span> {c["name"]}</a>' for c in C))
open(D + "/aero-preview.html", "w").write(html); print(len(html)//1024, "KB")
