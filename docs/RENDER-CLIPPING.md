# Render-side clipping — seeing it, and fixing it without moving geometry

Companion to `docs/SCENERY-GROUNDING.md`, which covers clipping you fix by
moving models. This one covers clipping that is a *rendering* problem: the
geometry is correct and the image is still wrong.

---

## 1. Depth precision is the root of most of it

A perspective depth buffer distributes precision by the **near : far ratio**,
not by the far distance. The main camera ran `near = 0.3`, `far = 900` — a
3000:1 ratio that spends almost all resolution in the first few metres and
leaves distant surfaces separated by only a few depth quanta. That is why
coplanar-ish geometry (decals on tarmac, window bands on facades, kerb ribbons)
looks fine in the pit lane and shimmers at the far end of a straight.

### The trap: you cannot just raise the near plane

The obvious fix — raise `near` — breaks the cockpit. The cockpit rig sits
**0.44 m from the eye** (`_rigT` in `js/game.js`, against an eye at car-local
z −0.18). Any near plane above ~0.40 slices the steering wheel and dash out of
the shot.

An earlier draft of the grounding doc recommended `0.3 → 0.6` globally. That
recommendation was wrong, and this is why.

### The same trap from the other side: geometry moved INSIDE the near plane

The constraint is symmetric, and the other direction is worse because it is
silent. Measured 2026-08-14: the wheel rig was moved to z 0.10 to resolve a
depth-ordering complaint, putting it at **w 0.276** and every instrument mesh at
**w 0.274** — inside the 0.30 near plane. The LCD, LED strip, gear/speed digits,
ERS bar and aero lamp all vanished, and the wheel rendered as a flat washed-out
slab (its near-clipped interior).

**Nothing in that image reads as "clipped".** It reads as a materials or
lighting bug, and two rounds were spent there. Any change to `_rigT`, to
`COCKPIT_EYE_FWD`/`COCKPIT_EYE_UP`, or to `_nearM` must be checked against the
projected `w` of the rig, not against a screenshot — see
[OCCLUSION-PROBE.md](OCCLUSION-PROBE.md) for the one-call instrument.

### What actually works: per-camera near planes

Only `cockpit` and `hood` have geometry within a metre of the eye. Every other
view — chase, TV, heli, overhead, drift, reverse — has nothing closer than
several metres, so it can afford a much larger near plane:

```js
const _nearM = (mode === "cockpit" || mode === "hood") ? 0.3 : 0.9;
```

`0.3 → 0.9` is a **3× reduction in depth error** everywhere it is applied, for
one comparison per frame and no geometry change. Implemented in `render()`.
The debug free camera (`__apex.view`) keeps 0.3 so close-up scenery inspection
is unaffected.

## 2. Decals: bias the depth, don't lift the mesh

A decal held above its surface by a small Y lift is fighting a losing battle —
the lift is fixed in metres, the precision it needs is not. Use depth bias:

```js
gfx.draw(mesh, MAT_IDENT, { …material, depthBias: [-1, -2] });   // [factor, units]
```

`GLX.draw()` enables `POLYGON_OFFSET_FILL` around the draw when `depthBias` is
present. Polygon offset scales with the fragment's depth slope, so it holds at
every distance and grazing angle. The start line uses it; any new decal should.

## 3. Ways to SEE render clipping

Static screenshots are the weakest instrument here — most of these artifacts are
temporal or view-dependent.

| Symptom | How to look at it |
|---|---|
| Z-fighting / shimmer | Only visible in motion. Use the **playwright-probe** skill (`references/motion-capture.md`, `tools/shot/motion-capture.mjs`) to record a driven lap headless; a still frame will not show it. |
| Decal dropout at range | Park at increasing distances from the start line (`__apex.eyeAt`) and compare — dropout is a function of distance, so one framing proves nothing. |
| Camera inside geometry | Observed repeatedly this session: `orbit`/`trackside` framings landed *inside* tree canopies, producing a full-screen green wash. Worth an `__apex` guard that reports when the eye is inside a prop's bounds. |
| Near-plane slicing | Cockpit and hood only. Check the wheel/fascia edges after ANY near-plane change — and after any change that moves near geometry, which is the direction that fails silently. A clipped mesh looks washed-out, not clipped: read the projected `w`, per [OCCLUSION-PROBE.md](OCCLUSION-PROBE.md). |
| One mesh hiding another | Not answerable from a screenshot, and the intuitive suspect is usually innocent (measured: the cockpit tub walls, named twice, contributed 0 of 2722 occluding pixels). Rasterise both into a JS depth buffer off the renderer's own `viewProj` and attribute the loss to a `part()` name — [OCCLUSION-PROBE.md](OCCLUSION-PROBE.md). |
| Overdraw / depth complexity | Not currently instrumented. A debug shader colouring fragments by depth-test-fail count would localise z-fighting to the exact surfaces, rather than hunting frames. |

## 4. Ranked options if artifacts persist

1. **Per-camera near plane** — done, biggest win per unit of risk.
2. **Polygon offset on decals** — done, free, targeted.
3. **Reversed-Z** with `WEBGL_clip_control` where available: near-uniform
   precision across the range. Needs `depthFunc(GREATER)`, clear depth 0, and a
   projection change — a real port, but the correct end state.
4. **Logarithmic depth** in the vertex shader: writes `gl_FragDepth`, which
   **disables early-Z**. A genuine performance cost on a mobile-targeted
   renderer; treat as a last resort.
5. **Tighten `far`** per camera. Less effective than moving `near` (the ratio is
   dominated by the small end) but free where the view is short.

## 5. Verification debt

The per-camera near plane and the decal depth bias are verified by build and by
construction, **not by eye** — screenshot capture was unavailable while writing
them. Before trusting either:

- cockpit and hood views: confirm the wheel and fascia are not clipped,
- start line: view up close and from ~200 m, in dry and wet,
- one driven lap through motion-capture to confirm shimmer is reduced, not moved.
