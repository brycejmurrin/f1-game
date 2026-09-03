# Occlusion probe — proving what is actually in front of what

A screenshot tells you something looks wrong. It does not tell you which mesh
did it, and on a first-person camera the obvious suspect is usually innocent.
This doc is the instrument that answers the question mechanically: **rasterise
the candidate meshes into a JS depth buffer using the renderer's own
view-projection, then count the pixels where one beats the other.**

Written after a cockpit-view session where four rounds of moving geometry by eye
made things worse, and the first run of this probe found the real cause in one
call. Companion to `docs/RENDER-CLIPPING.md` (clipping that is a *rendering*
problem) and `.claude/skills/mcp-probe` (driving the live game).

---

## 1. Why eyeballing fails here

Three specific traps, all hit in the session that produced this doc:

- **A near-clipped mesh does not look clipped.** It looks like a flat,
  washed-out slab. Geometry inside the near plane silently vanishes; what you
  see is the interior of what survived. Nothing in the image says "clipped".
- **`render({what:"view"})` reports the car's BOUNDING BOX**, which is ~0.2 m
  from an in-car camera by construction. It is not evidence of occlusion, and
  reading it as such sends you after the wrong part.
- **Hand-rolled projection is wrong on the cockpit rig.** The instrument rig
  rides the smoothed ROAD basis, not the camera basis. Projecting with
  `viewState().eye`/`.tgt` was off by ~0.3 NDC — enough to "prove" zero cutters
  while half the wheel was covered. Take the matrices from the renderer.

The corollary: **never conclude "X is cutting Y" from a screenshot.** Measure
it, or say the finding is unverified.

## 2. The instrument

Three hooks, installed as a `navigate_page` `initScript` so they are in place
before any mesh is built (the caches are lazy, so a patch applied after boot
still catches them — but before is free).

```js
(() => {
  const t = setInterval(() => {
    if (typeof GLX === "undefined" || !GLX || GLX.__probed) return;
    GLX.__probed = true; clearInterval(t);

    // (a) keep the raw geometry — createMesh throws it away after upload
    const cm = GLX.createMesh;
    GLX.createMesh = function (data) {
      const m = cm.apply(this, arguments);
      try {
        m.__nv = data.pos.length / 3;
        if (data.parts && data.parts.some(p => p.name === "chassis") &&
            !data.parts.some(p => p.name === "halo"))          // ckpt build: no halo
          window.__bodyData = { pos: [...data.pos], idx: [...data.idx], parts: data.parts, nv: m.__nv };
        if (m.__nv === 624) window.__whlData = { pos: [...data.pos], idx: [...data.idx] };
      } catch (e) {}
      return m;
    };

    // (b) the REAL view-projection, straight off the frame
    const bg = GLX.begin;
    GLX.begin = function (frame) {
      try { window.__vp = Array.from(frame.viewProj); } catch (e) {}
      return bg.apply(this, arguments);
    };

    // (c) the REAL model matrices, per mesh of interest
    const dr = GLX.draw;
    GLX.draw = function (mesh, mat, opt) {
      if (window.__bodyData && mesh && mesh.__nv === window.__bodyData.nv) window.__baseM = Array.from(mat);
      if (mesh && mesh.__nv === 624) window.__rigM = Array.from(mat);
      return dr.apply(this, arguments);
    };
  }, 0);
})();
```

Notes that matter:

- `GLX.draw` / `GLX.createMesh` / `GLX.begin` are plain properties on the object
  returned from `js/render/glx/glx.js`, and `js/game.js` holds that same object as
  `gfx` — patching them works. `frame.viewProj` is not on the exported surface,
  which is why it is captured through `begin(frame)`.
- **Identify meshes by vertex count, not by draw order.** Draw order is not
  stable and the field's 21 other cars draw the same kinds of thing.
- Chunked and instanced geometry (road, scenery) goes through `drawChunked` /
  `drawInstanced`, not `draw`, so it never appears here. Fine for car-vs-car
  questions; patch those too if you need the world.

## 3. The depth raster

Half-space rasteriser over the two meshes, one depth buffer each, plus an
`owner` buffer recording which triangle won each pixel. 256×144 is plenty —
the answer is a percentage, not a picture.

```js
const W = 256, H = 144;
const mul = (m, v) => { const o = [0,0,0,0];
  for (let r = 0; r < 4; r++) o[r] = m[r]*v[0] + m[4+r]*v[1] + m[8+r]*v[2] + m[12+r]*v[3];
  return o; };                                     // column-major, as GLX stores them

function screenPts(data, model) {
  const { pos } = data, n = pos.length / 3, s = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const c = mul(window.__vp, mul(model, [pos[i*3], pos[i*3+1], pos[i*3+2], 1]));
    if (c[3] <= 1e-4) { s[i*3+2] = -1; continue; }  // behind the eye
    s[i*3]   = (c[0]/c[3] * 0.5 + 0.5) * W;
    s[i*3+1] = (0.5 - c[1]/c[3] * 0.5) * H;
    s[i*3+2] = c[3];                                // w == view-space distance
  }
  return s;
}

function raster(data, model, depth, owner) {
  const s = screenPts(data, model), idx = data.idx;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t]*3, b = idx[t+1]*3, c = idx[t+2]*3;
    if (s[a+2] < 0 || s[b+2] < 0 || s[c+2] < 0) continue;
    const x0 = Math.max(0, Math.floor(Math.min(s[a], s[b], s[c])));
    const x1 = Math.min(W-1, Math.ceil(Math.max(s[a], s[b], s[c])));
    const y0 = Math.max(0, Math.floor(Math.min(s[a+1], s[b+1], s[c+1])));
    const y1 = Math.min(H-1, Math.ceil(Math.max(s[a+1], s[b+1], s[c+1])));
    const ax = s[a], ay = s[a+1], bx = s[b], by = s[b+1], cx = s[c], cy = s[c+1];
    const det = (bx-ax)*(cy-ay) - (cx-ax)*(by-ay);
    if (Math.abs(det) < 1e-9) continue;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const u  = ((bx-px)*(cy-py) - (cx-px)*(by-py)) / det;
      const v  = ((cx-px)*(ay-py) - (ax-px)*(cy-py)) / det;
      const w2 = 1 - u - v;
      if (u < 0 || v < 0 || w2 < 0) continue;
      const z = u*s[a+2] + v*s[b+2] + w2*s[c+2], o = y*W + x;
      if (z < depth[o]) { depth[o] = z; if (owner) owner[o] = t; }
    }
  }
}
```

Then compare, and **attribute the loss to a named part**. `Car3D.build()` returns
`out.parts` — `{name, vertices, sizeM, centreM, boundsZ}` in emission order — so
a cumulative sum over `vertices` maps any vertex index back to `part("…")`:

```js
const dW = new Float32Array(W*H).fill(1e9), dB = new Float32Array(W*H).fill(1e9);
const oB = new Int32Array(W*H).fill(-1);
raster(window.__whlData, window.__rigM, dW, null);      // the thing being hidden
raster(window.__bodyData, window.__baseM, dB, oB);      // the suspects

let acc = 0;
const ranges = window.__bodyData.parts.map(p => {
  const r = { name: p.name, from: acc, to: acc + p.vertices }; acc += p.vertices; return r; });
const nameOf = (vi) => (ranges.find(r => vi >= r.from && vi < r.to) || {}).name || "?";

const by = {}; let wheelPx = 0, occl = 0;
for (let i = 0; i < W*H; i++) {
  if (dW[i] > 1e8) continue; wheelPx++;
  if (dB[i] < dW[i] - 1e-4) { occl++; const n = nameOf(window.__bodyData.idx[oB[i]]); by[n] = (by[n]||0) + 1; }
}
// -> { wheelPx: 4938, occl: 2722, pct: 55.1, by: { chassis: 2722 } }
```

`by` is the whole point. A percentage tells you there is a problem; the part
name tells you which source line to edit.

### The bbox shortcut that lies

An earlier pass tested triangle-NDC-bbox overlap against the wheel's NDC rect,
keeping the triangle's nearest `w`. It named the tub side walls and the crown
stripe as cutters. **They contribute zero pixels.** A long triangle running from
z 0.15 to z 1.35 has its near vertex far off-axis and its far vertex near the
centre; the bbox unions both, and the `min(w)` comes from the vertex that is
*not* the one overlapping. Rasterise, or accept the false positives.

## 4. Case study — the cockpit, 2026-08-14

Two defects, both invisible to screenshots, both found in one probe run.

**The dash was inside the near plane.** `js/game.js` sets the cockpit near plane
to 0.30 m (`_nearM`) and the eye sits at car-local z −0.18. With the rig at
z 0.10 the wheel projected at **w = 0.276** and every instrument mesh at
**w = 0.274** — LCD, LED strip, gear/speed digits, ERS bar and the aero lamp all
clipped away. The symptom read as "the LCDs are missing and the wheel looks
washed out", which points at materials, not at the projection. The `w` column of
the probe output is what named it. Rig moved to z 0.26 — a real 0.44 m
eye-to-wheel reach with 0.11 m of margin for heave/kerb motion.

**The tub's own rear cap was eating the wheel.** `CHASSIS.monocoque` in
`js/car/car3d.js` is built by `addSpan`, which emits a **closed** block, so its
rear face at z 0.05 is a solid wall across the tub: x ±0.30, y 0.155…0.635,
sitting 0.23 m from the driver's face. In chase you never see inside it, so it
cost nothing for as long as the car had no first-person build.

| | pixels | share |
|---|---|---|
| wheel pixels | 4938 | — |
| occluded, build 1186 | 2722 | 55.1% |
| …attributed to `chassis` | 2722 | **100%** |
| …attributed to `bolsters` / tub walls / crown stripe | 0 | 0% |
| occluded, build 1188 (after fix) | **0** | 0% |

The tub side walls were the intuitive suspect and were named out loud twice.
They were innocent both times.

The fix follows from the attribution rather than from taste: the cockpit build
ends the monocoque **ahead** of the driver (z 0.45, where the cap lands 0.63 m
out — behind the wheel, so it reads as dash surface) and drops the seat-surround
span entirely, since the `ckpt` bolsters and inner tub walls already model that
from the inside.

### …and the same cap, moved, then hid the nose

Moving a wall is not removing it. A follow-up run — this time rasterising the
whole `ckpt` body against the frame and reporting **visible coverage per part**,
rather than one mesh against one other — put the honest state of the view in a
table:

| part | share of frame |
|---|---|
| `bolsters` (tub walls + coaming + shroud) | 16.30% |
| steering wheel + instruments | 13.15% |
| `mirrors` | 1.55% |
| `chassis` | 0.79% |
| `sidepods` | 0.31% |
| `frontWing` | 0.14% |
| `hood` | **absent** |

`hood` absent is the finding. A first-person view of an F1 car whose most
recognisable feature — the long nose running out ahead between the front tyres —
is not on screen at all is wrong however good the dash looks.

Rasterising `hood` **alone** and then asking who beats it separates "off-screen"
from "occluded", which the coverage table cannot:

```
hoodPixelsIfAlone: 2626      rows 117..179 of 180      beatenBy: { chassis: 2428, livery: 16 }
```

On screen, in the lower third, and 92% of it lost to the cap that had just been
moved to z 0.45. Its top sat at y 0.599; the sightline from the eye to the
hood's near top edge (y 0.44 at z 0.58) passes through y 0.488 at that station,
so the top goes to **0.48** and the driver sees over the dash onto the vanity
deck and the nose.

The lesson is the reason this doc exists: **each fix needs its own measurement.**
The z-0.45 move was correct and verified against the wheel (2722 px → 0), and
that verification said nothing whatever about the nose. Re-run the probe against
what you changed, not against what you fixed last time.

## 5. When to reach for this

- Anything hidden behind anything, in any camera, where you cannot simply orbit
  around and look.
- Before moving geometry to "fix" an occlusion. Moving the wrong part is how
  four rounds get spent making the framing worse.
- After moving it, as the acceptance test: `occl` going to 0 is a number, not an
  opinion, and it costs one `evaluate_script`.

Cheaper instruments first, per `AGENTS.md`: `__apex` JSON hooks, then
`render({what:"view"})`, then this. It sits below the character raster in cost
and far above it in precision, and unlike a screenshot it produces something you
can put in a commit message.
