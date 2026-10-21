#!/usr/bin/env python3
"""Pair TLX/GLX stills: pixel diff % (per-pixel sum|dRGB|>30, same rule as tools/shot/backend-compare.mjs),
mean abs diff, the most-different 1/3x1/3 tile (shown at 3x = native DPR-3 pixels), heat map.
Writes scratch/h23/gallery/*.jpg and scratch/h23/gallery/pairs.json."""
import json, os, sys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "out", "stills")
DST = os.path.join(ROOT, "gallery")
os.makedirs(DST, exist_ok=True)

pairs = []
names = sorted({f.rsplit("-", 1)[0] for f in os.listdir(SRC) if f.endswith(".png")})
for base in names:
    a, b = os.path.join(SRC, base + "-three.png"), os.path.join(SRC, base + "-webgl2.png")
    if not (os.path.exists(a) and os.path.exists(b)):
        continue
    A = np.asarray(Image.open(a).convert("RGB")).astype(np.int16)
    B = np.asarray(Image.open(b).convert("RGB")).astype(np.int16)
    h, w = min(A.shape[0], B.shape[0]), min(A.shape[1], B.shape[1])
    A, B = A[:h, :w], B[:h, :w]
    d = np.abs(A - B).sum(axis=2)
    pct = float((d > 30).mean() * 100)
    mad = float(d.mean() / 3)
    # most-different window: 1/3 x 1/3 of the frame, stride 1/12
    cw, ch = w // 3, h // 3
    best, bx, by = -1, 0, 0
    for y in range(0, h - ch + 1, h // 12):
        for x in range(0, w - cw + 1, w // 12):
            s = float(d[y:y + ch, x:x + cw].mean())
            if s > best:
                best, bx, by = s, x, y
    lum = lambda X: float((X[..., 0] * .2126 + X[..., 1] * .7152 + X[..., 2] * .0722).mean())
    out = {"pair": base, "pctDiff": round(pct, 1), "mad": round(mad, 1), "crop": [bx, by, cw, ch],
           "cropMad": round(best / 3, 1), "lumTLX": round(lum(A), 1), "lumGLX": round(lum(B), 1)}
    for tag, X in (("tlx", A), ("glx", B)):
        im = Image.fromarray(X.astype(np.uint8))
        im.resize((w // 2, h // 2), Image.LANCZOS).save(os.path.join(DST, f"{base}-{tag}.jpg"), quality=82)
        im.crop((bx, by, bx + cw, by + ch)).save(os.path.join(DST, f"{base}-{tag}-crop.jpg"), quality=88)
    heat = np.clip(d * 2, 0, 255).astype(np.uint8)
    Image.fromarray(heat).resize((w // 4, h // 4), Image.BILINEAR).save(os.path.join(DST, f"{base}-diff.jpg"), quality=75)
    pairs.append(out)
    print(json.dumps(out))
json.dump(pairs, open(os.path.join(DST, "pairs.json"), "w"), indent=1)
