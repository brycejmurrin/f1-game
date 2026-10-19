# Pixel diff candidate vs clone base at identical framing; writes overlay PNGs + diff.json.
import json, os, sys
from PIL import Image, ImageChops
S = "artifacts/design-preview-aero/studio"
PAIRS = [("spoon_wing","low"),("beam_twin","high"),("monkey_seat","extreme"),
         ("bridge_wing","medium"),("x_wings","rake_setup"),("double_diffuser","gurney_edge")]
out = {}
for cand, base in PAIRS:
    out[cand] = {}
    for v in ("q34","side","top","phone"):
        a, b = f"{S}/{cand}/{v}.png", f"artifacts/design-preview-aero/r1/{base}/{v}.jpg"   # round 2: bases unchanged, JPEG from round 1
        if not (os.path.exists(a) and os.path.exists(b)): out[cand][v] = None; continue
        A, B = Image.open(a).convert("RGB"), Image.open(b).convert("RGB")
        d = ImageChops.difference(A, B).convert("L").point(lambda x: 255 if x > 32 else 0)
        n = sum(1 for p in d.getdata() if p); tot = d.size[0]*d.size[1]
        ov = Image.blend(A, Image.new("RGB", A.size, (0,0,0)), 0.55)
        ov.paste(Image.new("RGB", A.size, (255,0,200)), mask=d)
        ov.save(f"{S}/{cand}/{v}-diff.png")
        out[cand][v] = round(100.0*n/tot, 2)
out = {k: v for k, v in out.items() if any(x is not None for x in v.values())}
json.dump(out, open(f"{S}/diff.json","w"), indent=1); print(json.dumps(out))
