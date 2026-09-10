# MCP probe traps — scene

Load from traps.md when debugging this class of failure.

## A THIRD trap: verify TUNE_DEFS by grep, not by memory

Proving a lighting-tuner slider "does nothing" (or "does something") means
pushing it from its shipped default to an extreme — get either number wrong and
the test is invalid regardless of how careful the rest of it is. MEASURED
2026-08-12: two knobs (`mieScatter`, `flareStreak2`) were tested against
guessed/half-remembered defaults (0.03 and 0.4) that turned out to be wrong (the
real `TUNE_DEFS` defaults are 1.0 and 0.5) — the "no visible effect" result those
produced was really "no visible effect near an arbitrary point that happened not
to be the default," not evidence about the knob. Five more knobs in the same
session had the same class of error. Always
`grep -n 'id: "<knobId>"' js/lighting/knobs.js` immediately before testing a knob
and read `min`/`max`/`def` off that line — never carry values between sessions
or reconstruct them from a description.

A knob that shows no effect at its documented extreme is also worth checking for
a spatially-thin effect before concluding it's dead: a whole-frame pixel-mean
diff is blind to anything confined to a narrow band (a lens-flare core streak
occupying 2–3 pixel rows, star points in a 320×180 capture). Scan horizontal (or
vertical) bands and diff each independently — the band containing the effect
reads an order of magnitude above its neighbours even when the frame-wide mean
shows nothing.

## A FOURTH trap: two same-value screenshots must diff near-zero before you trust any pair

Before comparing knob-A-vs-knob-B, take two screenshots at the SAME value and
diff them. If that "noise floor" isn't near zero, something else in the frame
is moving — most commonly a car left with nonzero speed under a free-cam
(`orbit()`/`view()`) after `jump()`, which keeps driving while you tune the
knob, changing the framing between shots. MEASURED 2026-08-12 (`cloudDef`): a
same-value repeat under a moving car diffed at MAD 5.96 — statistically
IDENTICAL to the "signal" a 0-vs-2 comparison had just shown (MAD 6.03) at the
same pixel locations. The whole "effect" was scenery scrolling past, not the
knob. Use `park()` (freezes the car, `G.frozen = true`) instead of `jump()`
before any free-cam comparison shot; it dropped the noise floor to 0.42 on the
same scene. A knob whose signal doesn't clear a same-value noise-floor check by
several times over is not proven, whichever direction it points.

For sky/cloud knobs specifically, don't reach for `sky()` — its ~58° pitch
looks close to straight up, and the cloud plane in `js/render/glx/shaders/glsl-sky.js`
is sampled as `dir.xz / up * 0.42`: dividing by a near-1 `up` collapses the
sampled coordinate toward one point, so every pixel reads nearly the same
noise value and the sky renders as a smooth gradient with no puffy structure
to carry a cloud-*shape* knob's effect. Use `park()` + a custom
`view({eye, yaw, pitch: ~25-35, fov})` aimed lower toward the horizon instead,
and nudge `cloudCover` — the bare weather default can be near-cloudless in the
one direction `sky()` looks. A real signal here shows up as a cloud-*shaped*
blob in a saved diff-map image (`np.abs(a-b).sum(axis=2)`, contrast-boosted and
written to PNG) sitting where the visible cloud is, not a diffuse scatter.

## An ELEVENTH trap: a screenshot cannot tell you WHICH mesh is hiding another

If the question is "what is cutting through the wheel / covering the dash /
poking into frame", the screenshot is the symptom, not the evidence — and the
part you would bet on is usually innocent. Do not move geometry to fix an
occlusion you have not attributed. Three ways this went wrong in one session
(2026-08-14), all fixed by the same instrument:

- **A near-clipped mesh does not look clipped, it looks washed out.** The
  cockpit rig was moved to `w 0.276` against a 0.30 near plane; every instrument
  (LCD, LED strip, digits, ERS bar, aero lamp) silently vanished and the wheel
  drew as a flat slab. Two rounds went into materials and lighting before the
  projected `w` was ever read.
- **`render({what:"view"})`'s `player` entry is the car's BOUNDING BOX**, always
  ~0.2 m from an in-car camera by construction. It is not occlusion evidence.
- **Hand-rolled projection is wrong on the cockpit rig**, which rides the
  smoothed ROAD basis, not the camera basis — off by ~0.3 NDC, enough to "prove"
  zero cutters while 55% of the wheel was covered.

The instrument: patch `GLX.createMesh` (keep `data.pos`/`idx`/`parts` — the
upload throws them away), `GLX.begin` (grab `frame.viewProj`; it is not on the
exported surface) and `GLX.draw` (grab the real model matrices), all from a
`navigate_page` `initScript`. Then rasterise both meshes into a 256×144 JS depth
buffer and count pixels where one beats the other, mapping each loss back to a
`part()` name via the cumulative `out.parts[].vertices` sum. Full code, and the
NDC-bbox shortcut that produces false positives, in
[`../../../../docs/notes/OCCLUSION-PROBE.md`](../../../../docs/notes/OCCLUSION-PROBE.md). It costs one
`evaluate_script` and returns a number you can put in a commit message —
`2722 px → 0 px` beats "looks better now".

## An EIGHTH trap: `lightState().numLights` reads 0 until enough frames render

`numLights` is the per-frame ACTIVE (culled) light count, produced inside the
render loop — so it needs several *rendered frames*, not elapsed wall-clock,
before it means anything. Read it too early after `race()` or
`setTimeOfDay()` and you get **0**, which reads exactly like "the floodlights
aren't firing" — one of the symptoms in `lighting-tuner`'s own table.

MEASURED 2026-08-13 (Monza, polling every 100 ms after `setTimeOfDay("dusk")`
on a parked car): 0 at every sample through 2611 ms, then 28 at **2711 ms**.
`bakedLights` stayed 292 the whole time — the baked set was never lost, only
the active count was not yet computed. The settle time is NOT a constant: in
a quieter moment the same sequence read 28 after ~1.1 s, and a fixed 1500 ms
wait landed inside the dead window and produced a false `numLights: 0` that
briefly looked like a real dusk-vs-dawn lighting bug. Under SwiftShader the
frame rate — and therefore this window — moves with whatever else is loading
the box.

So never sample it on a timer. Poll until it settles:

```js
// RIGHT — wait for frames, not for the clock
let n = 0;
for (let i = 0; i < 40 && n === 0; i++) {
  await new Promise(r => requestAnimationFrame(r));
  n = __apex.lightState().numLights;
}
```

Cross-check with `bakedLights` before believing any `numLights` reading:
`bakedLights > 0 && numLights === 0` means "not settled yet," whereas
`bakedLights === 0` is the genuine "this circuit baked no lights" case. Same
shape as the SIXTH/SEVENTH traps — a real render state that is simply not
ready yet, misread as a defect because the probe outran the renderer.

## A NINTH trap: `scene()` lists what the circuit ASKED for, not what got drawn

`scene().props` is built from `ctx.note(...)`, and several model helpers note
themselves BEFORE deciding whether to emit — `building()` notes after its two
footprint guards but before the `opts.kind` massing branch. A prop that draws
**nothing at all** therefore still appears, at a plausible `sizeM` and `at`.

MEASURED 2026-08-14: Imola's pit building
(`building(K(0.00), -1, 1, 16, 11, 130, {kind:"slab"})`) was listed by `scene()`
throughout a session in which it emitted ZERO vertices — it failed rejBox (its
padded half-width crossed the road at gap 1) *and* massBlocked (it ran through
the pit wall and grandstand). The listing is what kept the search pointed at
camera framing instead of at emission.

The vertex count is the honest instrument, and it is a shell call, not a browser
one: `node tools/track/verify-track.cjs <id>`, then comment the call out and run it
again. Identical `props N` = nothing was emitted. **Run a control first** — add
a throwaway `for (let i=0;i<50;i++) addBox(out, [0,500+i,0], [10,10,10], [1,0,0]);`
and confirm the number moves (+1200) — because two equal readings look identical
whether the geometry is absent or your edit simply isn't being read. Note also
that MOVING a prop never changes the count, so relocation tests prove nothing
about emission; only add/remove does.

