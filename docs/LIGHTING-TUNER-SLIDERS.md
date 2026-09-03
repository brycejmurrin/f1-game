# LIGHTING TUNER — the 183 sliders, and what each one drives

Generated from `TUNE_DEFS` in `js/lighting/knobs.js`; that registry is the
source of truth and this table is a view of it. Regenerate rather than hand-edit:
`node tools/gen-slider-doc.mjs` rewrites the marked block below and `--check`
(run by `tests/unit/generated-docs.test.mjs`) fails when it drifts.

**2026-08-13 range pass:** every knob's step was halved (finer scrubbing), and
maxima were widened ×1.5 — except the categories where wider is broken, not
generous: toggles; 0..1 gates/fractions; **any knob whose max is below 1**
(sub-unit maxima are fractions of something — `godrayAniso` is a
Henyey-Greenstein `g` that must stay < 1, `lampWarmupDim` > 1 would go
negative-light); hue knobs (±180 is the full circle); `lampCull` (48 is
`MAX_LIGHTS`, the shader array size); `lampFogBase` (its consumer clamps at
0.9 — the top of a wider slider would be dead, the exact bug class recorded
below); and `wetness` (-0.05 is the weather-driven sentinel). The measured
recipes further down quote the PRE-widening extremes (e.g. `renderDistMul` 2 =
1800 m); those numbers are still correct, there is simply more headroom above
them now. `tests/unit/light-grid.test.mjs` guards the lattice — the first cut
of this pass rounded steps to 4 decimals, which turned 0.00125 into 0.0013 and
knocked four knobs' own defaults off their grids; the guard caught it.

## Every slider is wired — the full audit

An exhaustive scan of every `<obj>.<id>` read across the WHOLE `js/` tree (not a
sampled file list) gives all 183 knobs a consumer on the shipping (GLX) path —
**zero unwired**. The classification, and the invalidation each class needs to
be live from a slider drag (not just at track load):

The audit below was run against the 178 that existed then; the three added
since — `lampDensity` (LAMPS/POOLS, `rebuild:true`), `lampReach`
(LAMPS/BEHAVIOUR) and `renderDistMul` (ATMOSPHERE) — are in the tables with
their consumers and are not part of the class counts in the next table.

| class | count | consumed in | live via | guarded by |
|---|---|---|---|---|
| per-frame | 74 | render/frame code | read every frame off live `LT` | — |
| shader-uniform | 73 | GLX upload → GLSL (all 73 uniforms upload) | uniform re-uploaded each frame | — |
| build-only | 5 | `buildTrackLights` only (poolEnergy, lampRadiusMul, bleedMul, beamCone, lampGapFill) | `rebuild:true` nulls `track._lights` | `lighting-rebuild.test.mjs` |
| apply-only | 15 | `applyRaceSettings`/`atmosphere.js` only | `APPLY_RACE_IDS` re-runs it | `lighting-reapply.test.mjs` |

The 16 lamp/tail-light knobs in LAMPS / CAR are the trap:
11 of them (`lampFlicker`, `lampWarmup*`, `lampCull*`, `lampBehindBias`,
`tailLightMul`, `brakeGlowMul`, `tailRange`, `tailFade`) are read in
`lighting.js` too — but inside `setFrameLights`/`appendCarTailLights`/`lampCap`,
which run **every frame**, so they are live directly and correctly carry no
`rebuild` flag. Only the 5 read inside `buildTrackLights` bake into cached
geometry and need `rebuild:true`; all 5 have it. Counting "read in lighting.js"
as one bucket wrongly flags all 16 as needing rebuild — the split is by
function, not by file.

So "this slider does nothing" is never the value going nowhere. It is one of
these, and they need different fixes:

| Failure mode | How to tell | Fix |
|---|---|---|
| **Not stored** | `__apex.lightTune({id: v})` then `__apex.lightTune()[id] !== v` | the store/clamp path, not the renderer |
| **Stored but not re-applied** | `lightTune()[id]` updates but the scene does not, until some *other* action re-runs `applyRaceSettings()` | the id is missing from `APPLY_RACE_IDS` in `light-store.js` (this is what broke five knobs — see below) |
| **Stored but not rebuilt** | a lamp/floodlight knob updates but the lamp geometry does not, until the track reloads | the id is read in `buildTrackLights` but its TUNE_DEFS entry lacks `rebuild:true` |
| **Inert everywhere** | stored, re-applied, but pushed to its extreme it moves no SCENE STATE in any condition | its consumer is gated off, or the effect is genuinely a no-op |
| **Conditional** | inert in the condition you are in, live in another | **expected, not a defect** — night lamp knobs in daylight, wet-road knobs when dry |

The third and fourth are the common ones, and the reason a casual "half these do
nothing" is usually wrong: 69 of the 183 knobs are also set by shipped presets per
(track, time-of-day, weather), so what a slider appears to do depends on where
you are standing when you drag it.

**Measure scene STATE, not the frame mean.** A frame-wide mean-absolute pixel
diff is the wrong instrument for a knob whose effect is diluted across the
image. MEASURED: `nightAmbLift` pushed 1→4 scales `frame.ambientSky` and
`ambientGround` by exactly ×4 (verified via `__apex.lightState()`), yet the
night frame — dominated by lamp-lit surfaces where ambient is a small term —
moved a mean of only 0.37/255, which a pixel-threshold sweep scored "inert" at
1.8× over noise. The value reaches the scene; the *mean* hides it. `lightState()`
exposes `ambientSky/ambientGround/sunColor/exposure/fogDensity/fogColor/...`,
so an A→B→A′ read of the actual derived value is exact, noise-free, and needs no
threshold. The five repaired knobs were all confirmed this way:

| knob | condition it needs | state it moves (verified) |
|---|---|---|
| `nightAmbLift` | night | `ambientSky`/`ambientGround` band ×4 |
| `cityGlowWarm` | night, `street_night`/`modern` theme | `ambientSky` white-balance |
| `weatherSunMute` | wet / overcast / fog | `sunColor` ×0.53 |
| `overcastFogMul` | **overcast only** | `fogDensity` ×3.5 |
| `fogWxMul` | **fog only** | `fogDensity` ×2.7 |

The last two are why `tools/lighting-tuner-sweep.mjs` gained `day-overcast`/`day-fog`
conditions: their gates never open under dry/wet, so any pixel sweep would have
scored them dead regardless of runtime.

### The three DISTANCE knobs: where each one is actually demonstrable

`lampReach` / `renderDistMul` / `shadowRange`+`moonShadow` are the sharpest case
of "conditional, not dead" in the table above: each has exactly one family of
(track, position, weather) where it moves anything at all, and the obvious test
setup — Bahrain, night, dry, free-cam — is the one place where **all three** are
provably inert. Measured 2026-08-13; use these recipes rather than re-deriving.

**`renderDistMul` — needs DAY, a real player camera, and far scenery.**
It scales the camera far-clip plane exactly (`M4.perspectiveTo`'s `far` arg,
wrapped and read directly): 0.5→450 m, 1→900 m, 1.5→1350 m, 2→1800 m. But on
this box `PerfGov.tier()` is 0, so `frame.cullDist` is the `_fogCull` branch —
and `_fogCull = ceil(3/fogDensity)` **does not contain `farPlane`**; the far
plane only gates whether that cull switches on. In clear day fog (~0.0008–0.0013)
the cull is 0 (uncapped) at *every* multiplier, so the far plane is the ONLY
lever, and it can only reveal scenery sitting between 900 m and 1800 m. Props in
that band, measured with `scene({radius}).counts.inRadius`:

| spa | suzuka | vegas | jeddah | singapore | abudhabi | silverstone | mexico | **bahrain** |
|---|---|---|---|---|---|---|---|---|
| 1550 | 1492 | 1357 | 538 | 418 | 258 | 210 | 122 | **70** |

Bahrain is last by an order of magnitude — a `renderDistMul` A/B there is
near-guaranteed to look like a no-op no matter how carefully it is shot. Use
**daylight, `camera('chase')`**. And never `orbit()`/`view()`: under any free-cam
`farPlane = dbgCam.far`, so the knob is bypassed entirely (and `cullDist` is
forced to 0) — a free-cam A/B measures nothing.

**The per-track band count is necessary but NOT sufficient — the VANTAGE must
have an open sightline, and most do not.** Suzuka 0.10 and Vegas 0.50 both sit
in the top three tracks by band count and both still showed nothing (MAD 0.99
and 1.29, at/below the ~0.6–1.0 noise floor): the first is walled in by near
forest, the second is a corner between casino blocks, so there is no line of
sight for the extra 900 m to populate. Do not pick the vantage by eye — find it
by counting **actual chunk draws**, which is exact and cheap: wrap
`gl.drawElements` on the `#game` canvas, take the MIN over ~8 frames at each
multiplier (the min rejects the env-probe/shadow-rebuild frames that make a
single-frame count swing 209↔393), and look for a position where the two minima
diverge. Measured on Spa, day:

| Spa frac | 0.05 | 0.20 | 0.35 | 0.65 | 0.80 | **0.50** |
|---|---|---|---|---|---|---|
| min draws, mul 1 → 2 | 151→151 | 207→427 | 180→472 | 167→497 | 143→468 | **183→528** |
| delta | **+0** (enclosed) | +220 | +292 | +330 | +325 | **+345 (+188%)** |

**Spa 0.50, day, chase** is the reference shot: a distant hillside and treeline
appear along the horizon where mul 1 renders bare sky, at **MAD 3.46 overall but
6.19 in the horizon band vs 1.36–1.44 on the road** — i.e. 5.3× the same-value
noise floor, and the saved diff-map shows solid tree/hill SHAPES rather than the
edge outlines that sub-pixel camera drift produces. Spa 0.05, on the same track
in the same session, gives exactly +0 draws and no visible change — the vantage
matters more than the track.

**`lampReach` — needs a lamp-saturated view with far lamps that currently lose.**
For a lamp ahead, `d /= 1 + (reach-1)·cos²θ`; at reach 4 a dead-ahead lamp's
SQUARED rank distance is quartered, so it ranks as if **half as far**. That only
changes the selection when (a) lamps in range exceed `lampCull` (28), and (b)
lamps exist in the newly-reachable band. Farthest selected lamp ahead, reach 1→4:

| Singapore frac | 0.15 | 0.35 | **0.55** | 0.75 |
|---|---|---|---|---|
| reach 1 → 4 | 212→275 m | 292→295 m | **217→313 m** | 251→326 m |
| gain | +63 m | +3 m | **+96 m (+44%)** | +75 m |

**Singapore ~0.55** is the best demo. By contrast Vegas at frac 0.05 gains
**0 m**: all 28 selected lamps sit within 33 m there (a dense casino cluster), so
halving a distance cannot pull in anything new. Note frac 0.35 is nearly flat
too — the spot matters as much as the track. Read the selection by wrapping
`LightTune.setFrameLights` (it is called via property lookup on the global, so a
monkeypatch takes effect) and measuring `frame.lights` distances against `eye`.

The table above is the ORIGINAL curve, which under-delivered against its own
label: `d` in that loop is a SQUARED distance, so dividing it by
`1 + (reach-1)·cos²θ` shortened the ranked LINEAR distance only by `sqrt(reach)`
— a slider reading 4 bought 2× reach. The divisor is now squared, so the number
is the literal reach multiplier for a dead-ahead lamp. Re-measured at Singapore
0.55, farthest selected lamp ahead:

| reach | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| farthest ahead | 249 m | 379 m | **415 m** | 415 m (saturated) |
| lamps within 40 m | 4 | 4 | 4 | 4 |

**+67%** (249→415 m) where the old curve gave +44%. Two things worth keeping:
the near road is NOT starved — lamps inside 40 m hold at 4 and the nearest stays
~29 m, so the budget is taken from the mid field (80 m band 8→6), not from under
the car; and the gain **saturates at reach 3** because the track simply has no
further lamps in that sightline, which is why the 1–4 range needs no widening.
A knob like this is bounded by lamp availability, so expect a plateau rather
than a linear response.

**`moonShadow`'s escape hatch — needs BAD weather; it is a guaranteed no-op when dry.**
`frame.moonGate = max(moonK, clamp((moonShadow-0.5)*2, 0, 1))`, and `moonK` is
already 1 on a clear dry night, so the max() cannot move:

| night weather | moonShadow 0.25 → 1 | moonGate |
|---|---|---|
| dry | 1 → 1 | **no change — inert by construction** |
| wet | 0.101 → 0.056 | 0.101 → **1** |
| fog | 0 → 0 | 0 → **1** (clean binary flip) |

**Night + fog (or wet)** is the only condition where the gate moves at all: prop/car
shadow casting goes fully off→on. Every dry-night A/B of this knob is measuring
nothing, whatever the screenshot shows.

**But the gate flipping is NOT visible, and that is the honest result.** With the
gate driven 0→1 at Bahrain night/wet, from a frozen chase cam with byte-identical
`eye`/`tgt`, the frame moved **MAD 1.081 against a same-value noise floor of
1.061 — a signal/noise ratio of 1.0**, i.e. nothing above frame noise. The first
attempt looked more promising (MAD 1.02) until a same-value repeat showed rain
particles alone accounted for MAD 0.648 (ratio 1.58, still short of the "several
times over" bar this file demands); killing the particles with
`rainCount:0, drizzleCount:0, particleMul:0` removed that confound and the
remaining signal vanished with it. The mechanism is sound and the state is
verifiably live — the shadow simply has almost nothing to draw with: the night
key light is `sunColor ≈ [0.08, 0.10, 0.15]`, so cast-shadow contrast against
lamp-dominated night lighting is near zero, and the visible strength is
`moonShadow × moonGate` on top of that. Treat `moonShadow > 0.5` as a
state-level feature verified by `lightState().moonGate`, not something to sign
off from a screenshot. (Unproven, worth checking before relying on it: whether
raising `moonBright` alongside it gives the shadows enough key to actually read.)

### PER-CHUNK LAMPS: why the 32-lamp ceiling is not what it looks like

`lampCull`/`lampReach` exist to ration 32 shader slots across the whole visible
scene. But **`MAX_LIGHTS = 32` is a fragment-shader uniform-array size, so it
bounds lights per DRAW, not per scene.** Binding a different 32 per draw needs no
shader change at all — `lit.js`, `MAX_LIGHTS` and the per-fragment loop are
untouched. Two properties of this codebase make that cheap: track lamps are baked
and static (`track._lights`), and chunked scenery already carries per-chunk AABBs
that `drawChunked` frustum-tests, so each chunk's lamp set is computed once
(`_pickChunkLamps`, radius-vs-AABB) and cached on the chunk.

The generic alternative is worse here. WebGL2 has **no compute shaders and no
SSBOs**, and UBOs cap at 64 KB with a performance penalty — which is why engines
pick ~32 rather than it being a device cap. Clustered forward IS reachable via
CPU-built clusters + data textures (a three.js forward+ demo runs 1000 point
lights that way) but needs a whole new spatial structure and showed
hardware-specific breakage on mobile.

Measured at Singapore 0.55, night (`perChunkLights` 0 → 1):

| | uploads/frame | max bound on one draw | GL errors |
|---|---|---|---|
| off | 18 | 28 (the global cull) | 0 |
| on | 190 | **32** (chunks fill the array) | 0 |

Visually the effect lands on the scenery, not the road, and the road doubles as
an in-frame control:

| band 0–1 (buildings) | band 2–3 (road) |
|---|---|
| MAD **5.39 / 5.82** | MAD 0.95 / 1.11 |

— overall MAD 3.32, 42,614 px over threshold, and the diff map is solid filled
building faces, not the edge outlines sub-pixel drift produces. Cost is ~190
extra uniform uploads/frame at that vantage.

**Perf: it is FASTER, not a cost.** Interleaved A/B/A/B at the same vantage,
median frame time — the two `off` blocks agree to 0.1%, so the harness is
reproducible:

| off | on | off | on |
|---|---|---|---|
| 6519 ms | **5618 ms** | 6512 ms | **5205 ms** |

≈14–20% faster, which is the mechanism working as designed: a chunk binds only
lamps whose radius reaches it, so fragments run fewer light-loop iterations, and
that saving outweighs the extra uploads. Two caveats keep the knob **off by
default** anyway: (1) these frames are 5–6.5 SECONDS under SwiftShader, ~60x off
real-time and heavily fragment-bound — exactly the regime where cutting
per-fragment light iterations wins biggest, so the magnitude will not transfer
to a real GPU even if the direction does; (2) nothing here measures the mobile
tier, whose own lamp loop is the cost this would help most and which is also the
tier most exposed to per-draw upload overhead. Real hardware decides.

Method note: the first two perf attempts died and it was NOT the feature — exit
143, my own `timeout` firing. Singapore night renders at ~1–2 s/frame here, so a
480-frame plan needed 8–16 minutes. Sample single-digit frame counts per block
and interleave A/B/A/B for drift rather than sampling long.

**PER-CHUNK ROAD (`roadChunkLamps`) is where the original complaint actually
lived.** PER-CHUNK LAMPS lit the scenery but barely moved the road, and the
reason is structural: only `props`/`glass` go through `drawChunked`; the road is
a single `gfx.draw()` mesh, so it can only ever carry the ONE global set of 32 —
culled nearest the CAMERA, which covers the tarmac around the car and starves
the road AHEAD. Drawing the ribbon chunked (99 cells at Singapore) routes it
through the same path. Measured, same frozen chase vantage, `roadChunkLamps`
0 → 1, and the band profile is the exact inverse of the props-only result:

| band | 0 (sky) | 1 (far road) | 2 (mid road) | 3 (car/HUD) |
|---|---|---|---|---|
| props-only | — | 5.82 | 0.95 | 1.11 |
| **road knob** | 1.04 | **7.67** | **6.28** | 1.62 |

overall MAD 4.15, 38,154 px over threshold, and the diff map is a solid filled
ribbon following the road into the distance rather than edge outlines.
`drawChunked` goes from 2 calls/frame to 3, the new one carrying 99 chunks.

**Seams are not possible below the cap, by construction:** `_pickChunkLamps`
excludes a lamp with the SAME reach test the shader uses (`radius` vs the chunk
AABB ↔ `if (dist > rad) continue`), so an excluded lamp would have contributed
exactly zero anyway. The one case that CAN seam is a chunk with more than 32
lamps reaching it, where the cap drops real contributors — rare for props (2 of
104 chunks) but unmeasured for road chunks, so check that before defaulting on.

**`_keepPositions` is mandatory when building the chunked road**, not defensive:
`createChunkedMesh` nulls `data.pos`/`data.idx`, and `track.roadGeo` is still
read by `debrisworld.js` (the Rapier side-world) and `__apex.trackGeometry()`.
Verified byte-identical across the build — pos 69,672 / idx 128,256 before and
after (≈42.7k triangles, comfortably over the 2,000-triangle chunking floor).

**Car tail-lights needed explicit plumbing, and verifying it took three tries.**
`appendCarTailLights` pushes onto `frame.lights` AFTER the static cull, so those
records live outside `track._lights` — the array `_pickChunkLamps` builds from.
Left alone, switching the knob ON silently stopped chunked scenery receiving any
tail-light contribution. `uploadLightSet` now takes an optional second source and
reserves the tail-lights FIRST (at most 5; a car beside you outranks the
32nd-nearest lamp). Confirmed live: `drawChunked` sees
`[perChunkLights 1, tailCount 5, hasLights 1, hasAllLights 1]`.

Two traps cost a full debugging round each, both worth avoiding:

- **Do not derive the dynamic-light count by measuring `frame.lights` before and
  after the append.** When the set is already at cap, `appendCarTailLights`
  TRIMS the farthest static lamps before pushing, so length-in equals
  length-out and the difference is always 0. The first fix computed exactly
  that, compiled, passed 442/442 and shipped as a pure no-op. The count is now
  recorded inside that function, where `nT` is actually known.
- **`drawChunked` runs only ~2x per frame** (props + glass) while
  `uploadLightSet` fires ~79 times inside them. A probe armed one rAF before
  sampling can catch uploads from a frame whose `begin()` had not yet seen the
  current state, reporting `nTail: 0` while the frame-level value is 5. Assert
  at `drawChunked` (few calls, unambiguous state) rather than at the upload.

Two instruments that did NOT work, recorded so they are not retried: a
union-of-distinct-lamps count via wrapping `gl.uniform3fv` reported 64 → 270,
but 270 exceeds the track's 249 baked lamps — it was catching material/ambient
uploads too, so its absolute numbers are unusable. And raw `gl.drawElements`
counts read 211 → 327 purely from env-probe/shadow-rebuild pass scheduling
swinging between frames; take the MIN over ~8 frames if you need that number.

## Five ways a LIVE knob still reads "no observed change"

A follow-up runtime pass sampled one knob per class (shader-uniform, apply-only,
build-only, per-frame lamp) against a single parked, solo chase-cam capture.
8 of 12 showed clear pixel or state movement immediately. The other 4
(`starBright`, `lampCull`, `tailLightMul`, `beamCone`) showed none — and every
one of them turned out to be correctly wired and live; the capture setup itself
was blind to each, for a different, traceable reason. A blanket runtime sweep
of every knob with one fixed capture recipe would score all four "dead" and be
wrong every time:

| knob | why this capture missed it | how it was confirmed live |
|---|---|---|
| `starBright` | stars are sub-pixel point features; a frame MEAN can't resolve a few dozen brightened pixels in a 160×90 capture | signal `max 22` vs noise `max 14`, `p99 1.33` vs `1.0` — the distribution TAIL moves even though the mean (0.19 vs 0.34) does not |
| `starBright` (2nd cause) | `sky.js` multiplies stars by `(1 - cityCov)`; Vegas (`street_night`) has heavy city glow that suppresses the star field to near-zero regardless of `starBright` | re-probed on `bahrain` (desert, dark sky) with the camera tilted skyward — still measured no change purely from the mean-vs-point-feature issue above, confirming the FIRST cause is what matters, not the theme |
| `lampCull` | `lampCap(carCount, …)` only applies the knob `carCount > 1`; the standard `park()` capture teleports every AI car away, leaving the player solo | traced the gate in `js/lighting/lighting.js`; a capture with traffic present (no `park()`, or a scripted grid start) would show it |
| `tailLightMul` | `appendCarTailLights` only emits for cars within `tailRange` (160 m); `park()` scatters the field 600 m away, so there are zero tail lights to scale | same fix as above — needs cars in frame, not a parked solo car |
| `beamCone` | build-only, changes lamp cone SHAPE not brightness — a subtler pixel delta than `poolEnergy` (its build-only sibling, same rebuild path), which DID move measurably in the same capture | `poolEnergy` moving proves `set()` → `rebuild:true` → `track._lights = null` fires correctly; `beamCone` rides the identical path |

The general lesson: **a single fixed capture recipe (one track, parked, solo,
chase-cam) has systematic blind spots** — sky-effect knobs need a dark sky and
the right camera angle, traffic/proximity knobs need cars in frame, and any
sub-pixel-sparse effect needs a distribution statistic (`max`, `p99`), not a
frame mean. Before calling a knob "inert" from a runtime capture, check: is the
scene event it drives even happening in this shot (traffic, dark sky, weather),
and would this effect show up in a MEAN across the whole frame or only in a
handful of pixels?

`tools/slider-effect.mjs --live` now carries a **per-id recipe** for every
`TUNE_DEFS` knob (`tools/slider-effect-live.mjs`). `--live --all --dry-run`
prints the 183 plans grouped by `track|tod|wx|camera` so a real sweep parks
once per condition, not once per slider. `--shots N` sets how many frames
(default 2); without `--from`/`--to`, N>2 linspaces the slider's min→max.
`--levels 0,0.26,0.55` sets the values explicitly. A 2-shot still writes
`a.png`/`b.png`/`filter.png`/`sheet.png`; N>2 also writes `v0.png…` and a
labeled `ramp.png`. Documented specials: `fogWxMul` → fog, `overcastFogMul` →
overcast, `drizzle*` → wet (not rain), `moonShadow` → night+wet,
`renderDistMul` → Spa day 0.50 chase, `starBright` → Bahrain night sky,
`lampCull`/`tailLightMul` → Singapore night + traffic. Pixel MAD is still
corroboration; `lightState` is the verdict.

## The full day-dry sweep's 18 "no clear signal" knobs: all 18 confirmed live

A later day-dry sweep over the 178 knobs that existed then
(`tools/lighting-tuner-sweep.mjs --cond=day-dry`)
carried 18 knobs through to a genuinely clean, isolated re-check (own noise
floor ≈0.12, not the FLOOR=2.0 the sweep uses) that still showed no signal:
`sunShaftMul`, `sunShaftDecay`, `mieScatter`, `flareStreak2`, `whites`,
`carShadow`, `aoStr`, `ssaoRadius`, `ambContactDark`, `carEnvCube`, `carGloss`,
`carGlow`, `bounceK`, `fogSunCore`, `hazeCloudShare`, `fogHeight`, `cloudDef`,
`surfDetail`. Driving the live page through the Chrome DevTools MCP (screenshots
+ in-page pixel diffs, `.claude/skills/mcp-probe`) resolved all 18 — LIVE,
every time, once the right condition was found.

**Two of this session's own earlier mistakes accounted for most of the false
"no signal" results**, both now written up in `mcp-probe`'s trap list:

1. **Wrong default/push values.** `mieScatter` was tested against a remembered
   default of 0.03; the real `TUNE_DEFS` default is **1.0**. `flareStreak2` used
   0.4 against a real default of **0.5**. `ssaoRadius`, `ambContactDark`,
   `fogSunCore`, `cloudDef`, `whites` had the same class of error. A knob tested
   against the wrong starting point isn't tested at all.
2. **`snapCam()` called right after `orbit()`.** `snapCam()` unconditionally
   clears the free-cam (`G.dbgCam = null`) before snapping the player camera —
   calling it after a free-cam positioning call cancels that positioning. The
   first BEFORE/AFTER pair this session captured showed a wide cityscape and a
   close-up car: not because anything in the scene changed, but because each
   `snapCam()` silently discarded the orbit and let the chase cam's own spring
   settle at a different point each time. Dropping `snapCam()` after free-cam
   calls fixed every subsequent comparison.

With both fixed, plus matching each knob to the condition its own gate needs
(bright midday sun for the sun-shaft/flare group — dusk's dim sun color closes
an internal `_sunGate`; night+wet for `carGlow`/`bounceK`; fog+dusk for
`fogSunCore`; a close chase-cam shot for the six car-paint/shadow knobs; a
close low-angle road shot for `surfDetail`), 17 of 18 confirmed LIVE — several
by a numeric pixel-diff alone (`sunShaftDecay`, `mieScatter`, `ambContactDark`,
`fogHeight` all sat 4–15× a measured ≈0.12 noise floor with no visible-by-eye
difference), one (`flareStreak2`) only by scanning horizontal bands and finding
a single 3-pixel-tall row at 60× the surrounding noise — the same
sub-pixel-band blind spot as `starBright` above, just narrower.

**`cloudDef` (the 18th) needed a THIRD trap fixed: `sky()`'s hardcoded ~58°
pitch is the wrong angle to test it.** The cloud noise plane is sampled as
`dir.xz / up * 0.42` (`js/render/shaders/sky.js`) — dividing by `up` means a
steep look-up angle compresses the sampled coordinate toward a single point,
so every pixel in frame reads nearly the same noise value and the sky renders
as a smooth gradient with no puffy structure regardless of `cloudDef`. All
three earlier attempts (fog+dusk, overcast+day, dry+`cloudCover:0.5`) inherited
this same bias toward looking too high. Fixed by using `park()` (freezes the
car — required, since a moving `jump()`'d car under a free-cam changes the
framing between shots and reads as a false signal roughly the SAME magnitude
as the real one, which is what happened on the first retry here) plus a custom
`view({eye, yaw, pitch: ~30, fov})` aimed at a shallower angle toward the
horizon, `cloudCover` nudged to put total cover around 0.5–0.7 (bare default
gave an almost cloudless frame). The resulting diff between `cloudDef:0` and
`cloudDef:2` is a clean cloud-shaped blob in the diff map (not scattered
noise), reading ≈2.6× the frozen-scene noise floor exactly where the visible
cloud sits, confirming it LIVE — the last of the 178 that sweep covered.

## Reading the table

Resolution order, lowest→highest: `def` below → `LightPresets["*"]` → shipped
`"track|tod|weather"` → localStorage `"*"` → localStorage `"track|tod|weather"`.
A live slider edit writes the LAST of those — which is why an edit survives a
reload, and why RESET is per-condition rather than global.

- **uniform** — the GLSL uniform when the knob is a direct shader upload.
  Knobs without one are consumed in JS: light building, per-frame scene state.
- **consumed in** — files on the SHIPPING path. `light-presets.js` is excluded
  because it is preset DATA keyed by knob id, not a consumer.
- **three backends** — every `u:` knob is named on GLX, WGX, and TLX
  (`tests/unit/light-grid.test.mjs`). CPU knobs bake into `frame.*` /
  `frameSky.*` / `present()` opts in `js/game.js` and reach all three.
  Honest gaps (help text already says so): `perChunkLights` and
  `roadChunkLamps` are WebGL2-only. `pcssPen` on three.js phones /
  software WebGL2, and on a desktop PCSS-off fallback, scales the
  fixed Poisson radius (not distance-based PCSS). Screen sun-shafts
  and bloom width/threshold/knee need the bloom chain (shed at perf
  auto-tier 4).
- **preset** — ✓ when shipped presets override this knob for some condition.

## Every shipped value is reachable on its own slider

A knob renders as `<input type="range" min step>`, so the thumb can only land
on `min + k*step`. A shipped preset value off that grid cannot be represented:
the readout prints the true value while the thumb snaps to a neighbouring
notch. `fmtTune` derives its decimals from the step, so both were already
printing two decimals — the mismatch was invisible in the text.

It bites harder than a cosmetic mismatch, because `set()` in
`js/lighting/profiles.js` stores a player override whenever the incoming value
differs from `fallback(id)`, and `fallback` includes the shipped preset for the
current condition. With `keyMul` shipped at 0.85 against a 0.02 grid the slider
can only emit 0.84 or 0.86, so the first nudge persisted a value the player
never chose and flipped the profile to "(1 tuned)" — and 0.85 became
unreachable through the UI, recoverable only by RESET.

MEASURED before the fix: **481 of the 1,921 shipped values (25%), across 30
knobs**, plus two `TUNE_DEFS` defaults that were off their own slider's grid
(`godrayLowBoost` 0.55, `shadowStr` 1.15). The 27 worst knobs were all step
0.02 carrying values on odd hundredths — every one exactly half a step off.

The fix refined `step` to 0.01 on the 31 affected knobs rather than rounding
the presets. 0.01 divides the old 0.02 and 0.05 steps, so every previously
reachable value stays reachable, and **no shipped value changed** — the baked
look was tuned by eye and rounding 481 of its values to fit the widget would
have edited the thing the widget is meant to display. Guarded by
`tests/unit/light-grid.test.mjs`.

Note the grid test must be done in integer space: `(0.06 - 0) / 0.02` is
`2.9999999999999996`, so a float `% 1` check calls 223 perfectly on-grid values
off-grid.

---

<!-- GENERATED: tune-defs -->
_Generated by `node tools/gen-slider-doc.mjs` from `TUNE_DEFS` in `js/lighting/knobs.js` — 183 sliders in 11 groups. Do not edit the tables by hand; `--check` guards them (`tests/unit/generated-docs.test.mjs`)._

## SUN & MOON  (12)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `keyMul` | KEY LIGHT (SUN) | 0 … 2.5 | 1 | `uKeyMul` | ✓ | glx.js×4 |
| `sunTemp` | SUN / MOON WARMTH | -3.3 … 8.3 | 0 | — | ✓ | atmosphere.js |
| `sunElev` | SUN ELEVATION | -50 … 50 | 0 | — | ✓ | atmosphere.js×2 |
| `sunAzim` | SUN AZIMUTH | -180 … 180 | 0 | — |   | atmosphere.js×2 |
| `moonBright` | MOON BRIGHTNESS | 0 … 2.5 | 1 | — | ✓ | game.js×2, atmosphere.js |
| `grMul` | SUN GOD-RAYS | 0 … 2.5 | 1 | — | ✓ | game.js×2 |
| `godrayAniso` | GOD-RAY FOCUS | 0 … 0.95 | 0.6 | `uHgAniso` | ✓ | post.js×2 |
| `godrayFloor` | GOD-RAY HAZE | 0 … 0.2 | 0.02 | `uHgFloor` | ✓ | post.js×2 |
| `godrayLowBoost` | GOD-RAY LOW-SUN DRAMA | 0 … 1.375 | 0.55 | — | ✓ | game.js×2 |
| `godrayBase` | GOD-RAY BASE | 0 … 0.95 | 0.38 | — | ✓ | game.js×2 |
| `sunShaftMul` | SCREEN SUN-SHAFT | 0 … 2.5 | 1 | — | ✓ | post.js×4 |
| `sunShaftDecay` | SUN-SHAFT REACH | 0.08 … 0.98 | 0.82 | `uShaftDecay` | ✓ | post.js×2 |

## AMBIENT & BOUNCE  (5)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `ambientMul` | AMBIENT FILL | 0 … 2.5 | 1 | — | ✓ | glx.js×2 |
| `ambTemp` | AMBIENT WARMTH | -4.16 … 10 | 0 | — | ✓ | atmosphere.js |
| `ambBalance` | SKY / GROUND FILL | -6 … 6 | 0 | — | ✓ | atmosphere.js |
| `nightAmbLift` | NIGHT AMBIENT | 0 … 2.5 | 1 | — | ✓ | game.js×2 |
| `bounceK` | LAMP BOUNCE | 0 … 0.3 | 0.04 | `uBounceK` | ✓ | glx.js×2 |

## SHADOWS  (12)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `shadowStr` | SHADOW DARKNESS | 0 … 3 | 1.15 | `uShadowStr` | ✓ | glx.js×2 |
| `shadowRange` | SHADOW DISTANCE | 16 … 200 | 80 | `uShadowRange` | ✓ | game.js×2, glx.js×2 |
| `pcssPen` | SHADOW SOFTEN | 5 … 200 | 80 | `uPcssPen` | ✓ | glx.js×2 |
| `shadowBias` | SHADOW BIAS | 0 … 0.004 | 0.001 | `uShadowBias` |   | glx.js×2 |
| `shadowTintAmt` | SHADOW COOLNESS | 0 … 1 | 0 | `uShadowTintAmt` | ✓ | glx.js×2 |
| `moonShadow` | MOON SHADOWS | 0 … 1 | 0.25 | — |   | game.js×7, glx.js×2 |
| `carShadow` | CAR SUN SHADOWS | 0 … 1 | 1 | — |   | game.js×2, glx.js |
| `lampShadow` | LAMP SHADOWS | 0 … 1 | 1 | — |   | game.js, glx.js |
| `aoStr` | AMBIENT OCCLUSION | 0 … 1.05 | 1 | — |   | game.js |
| `ssaoRadius` | AO RADIUS | 0.02 … 1.465 | 0.6 | `uRadius` |   | post.js×2 |
| `contactStr` | CONTACT SHADOW | 0 … 2 | 1 | — | ✓ | game.js |
| `ambContactDark` | AMBIENT CONTACT DARK | 0 … 2.5 | 1 | `uAmbContactDark` |   | glx.js×2 |

## LAMPS  (25)

One tuner tab for every track lamp (street posts and flood banks). Was split as
FLOODLIGHTS / LAMP BEHAVIOUR — both drove the same `lampPosts` pipeline.

### POOLS

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `lampLevel` | LAMP LEVEL | 0 … 0.687 | 0.26 | — | ✓ | game.js×3 |
| `lampDensity` | LAMP DENSITY | 0.1 … 2.35 | 1 | — |   | track-lights.js×2, tracks.js×3 |
| `floodDay` | DAYTIME LAMPS | 0 … 4.5 | 0 | — |   | game.js×3 |
| `poolEnergy` | POOL ENERGY | 0 … 1.375 | 0.55 | — | ✓ | track-lights.js×3 |
| `lampRadiusMul` | POOL RADIUS | 0.4 … 1.9 | 1 | — | ✓ | track-lights.js×3 |
| `bleedMul` | VALLEY BLEED | 0 … 2.5 | 1 | — | ✓ | track-lights.js×3 |
| `glareStr` | LENS GLARE | 0 … 0.3 | 0.12 | — | ✓ | game.js×4, scene.js |
| `lampTemp` | LAMP TEMPERATURE | -3.3 … 8.3 | 0 | — | ✓ | game.js |
| `lampFlicker` | LAMP FLICKER | 0 … 0.6 | 0.1 | — | ✓ | frame-lights.js |
| `beamCone` | BEAM CONE WIDTH | 0.08 … 2.2 | 1 | — | ✓ | track-lights.js×3 |
| `lampWallSpill` | LAMP WALL SPILL | 0 … 3 | 1 | `uLampWallSpill` | ✓ | glx.js×2 |

### BEHAVIOUR

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `twilightFloor` | TWILIGHT FLOOR | 0 … 1 | 0.3 | — | ✓ | game.js×2 |
| `twilightRamp` | TWILIGHT RAMP | 0.4 … 6 | 6 | — | ✓ | game.js×2 |
| `twilightWarm` | TWILIGHT WARMTH | 0 … 2.5 | 1 | — | ✓ | game.js×2 |
| `lampWarmup` | LAMP WARM-UP | 0 … 2.5 | 1 | — | ✓ | frame-lights.js×2 |
| `lampWarmupDim` | WARM-UP DIP | 0 … 0.9 | 0.3 | — |   | frame-lights.js×2 |
| `lampWarmupWarm` | WARM-UP WARMTH | 0 … 2.5 | 1 | — |   | frame-lights.js×2 |
| `lampCull` | LAMP COUNT | 16 … 48 | 40 | — |   | apex.js, frame-lights.js×3 |
| `lampCullFade` | LAMP CULL FADE | 0.02 … 0.9 | 0.35 | — | ✓ | frame-lights.js×2 |
| `lampGapFill` | DARK-GAP FILL | 0 … 150 | 60 | — |   | track-lights.js×2 |
| `lampBehindBias` | BEHIND-CAM BIAS | 0.2 … 8 | 5.25 | — |   | frame-lights.js×3 |
| `roadChunkLamps` | PER-CHUNK ROAD | 0 … 1 | 0 | — | ✓ | apex.js, game.js×5, chunked.js |
| `perChunkLights` | PER-CHUNK LAMPS | 0 … 1 | 0 | — | ✓ | apex.js×3, game.js×7, frame-lights.js×2, tuner-panel.js, glx.js, chunked.js×2 |
| `lampReach` | LAMP REACH AHEAD | 1 … 4 | 1 | — |   | frame-lights.js×2 |
| `lampNearClamp` | LAMP NEAR CLAMP | 1 … 8.5 | 4 | `uLampNearClamp` | ✓ | glx.js×2 |

## NIGHT GLOW & BLOOM  (10)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `floodEmitMul` | LIT GEOMETRY | 0 … 1.425 | 1 | — | ✓ | game.js |
| `glowAmp` | EMISSIVE GLOW | 0 … 6 | 2.3 | `uGlowAmp` | ✓ | glx.js×2 |
| `neonBoost` | NEON & LENS BLOOM | 0 … 1.5 | 0.6 | `uBloomBoost` | ✓ | glx.js×2 |
| `cityGlowMul` | CITY SKYGLOW | 0 … 2.75 | 1 | — | ✓ | atmosphere.js×2 |
| `cityGlowWarm` | SKYGLOW WARMTH | -5 … 3.3 | 0 | — | ✓ | atmosphere.js |
| `cityGlowTint` | SKYGLOW ON AMBIENT | 0 … 0.7 | 0.28 | — |   | game.js×2 |
| `bloomMul` | BLOOM AMOUNT | 0 … 2.5 | 1 | — | ✓ | game.js |
| `bloomSpread` | BLOOM SPREAD | 0.25 … 2.125 | 1 | `uSpread` | ✓ | post.js×2 |
| `threshOff` | BLOOM THRESHOLD | -0.57 … 0.4 | 0 | — |   | game.js |
| `bloomKnee` | BLOOM ON HIGHLIGHTS | 0 … 1 | 0.5 | `uBloomKnee` | ✓ | post.js×2 |

## ATMOSPHERE  (19)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `fogDensityMul` | FOG DENSITY | 0 … 3.625 | 1 | `uFogDensity` | ✓ | game.js×2, glx.js×2 |
| `fogHeight` | FOG HEIGHT FALLOFF | 0 … 0.25 | 0.018 | `uFogHeight` | ✓ | game.js×2, glx.js×4 |
| `fogTint` | FOG WARM / COOL | -6 … 3.9 | 0 | `uFogTint` | ✓ | glx.js×2 |
| `fogColorSat` | FOG COLOUR SATURATION | 0 … 2.5 | 1 | — | ✓ | atmosphere.js×2 |
| `mistDensity` | GROUND MIST | 0 … 3.75 | 1 | `uGroundMist` | ✓ | game.js×3, glx.js×2 |
| `mistHeight` | MIST HEIGHT BAND | 0.05 … 0.675 | 0.3 | `uMistHeight` | ✓ | glx.js×2 |
| `lampFogBase` | FOG GLOW BASE | 0 … 0.9 | 0.45 | — | ✓ | game.js |
| `lampFogHaze` | FOG GLOW HAZE | 0 … 1.5 | 0.6 | — | ✓ | game.js |
| `mistShare` | MIST GLOW SHARE | 0 … 3.75 | 1.5 | `uMistShare` |   | glx.js×2 |
| `hazeWetShare` | WET HAZE SHARE | 0 … 0.55 | 0.22 | — | ✓ | game.js×2 |
| `hazeCloudShare` | CLOUD HAZE SHARE | 0 … 0.3 | 0.12 | — |   | game.js×2 |
| `fogClip` | FOG GLOW CLIP | 0 … 1.75 | 0.7 | `uLampFogClip` | ✓ | glx.js×2 |
| `fogSunCore` | FOG SUN CORE | 0 … 1.5 | 0.6 | `uFogSunCore` |   | glx.js×2 |
| `overcastFogMul` | OVERCAST FOG BOOST | 1 … 2.75 | 1.7 | — |   | atmosphere.js×2 |
| `fogWxMul` | FOG BOOST | 1 … 6 | 3 | — |   | atmosphere.js×2 |
| `lampVolBase` | BEAMS (CLEAR) | 0 … 0.7 | 0.05 | — | ✓ | game.js |
| `lampVolHaze` | BEAMS (HAZE) | 0 … 1.5 | 0.65 | — | ✓ | game.js |
| `lampVolCap` | BEAM CEILING | 0 … 1.5 | 0.7 | — | ✓ | game.js |
| `renderDistMul` | RENDER DISTANCE | 0.3 … 2.05 | 1 | — |   | game.js×2 |

## ROAD & REFLECTIONS  (10)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `ssrWetMul` | WET MIRROR | 0 … 2.4 | 1 | — | ✓ | game.js |
| `ssrDryNight` | DRY NIGHT SHEEN | 0 … 1 | 0.08 | — | ✓ | game.js×2 |
| `ssrDryDay` | DRY DAY SHEEN | 0 … 0.6 | 0.07 | — | ✓ | game.js |
| `roadRough` | TARMAC ROUGHNESS | 0.05 … 1.175 | 1 | — | ✓ | game.js×2 |
| `surfDetail` | SURFACE DETAIL | 0 … 2.5 | 1 | — | ✓ | game.js×2 |
| `matTexMix` | BAKED MATERIALS | 0 … 1 | 1 | `uMatTexMix` |   | apex.js×2, glx.js×2 |
| `ssrThick` | SSR THICKNESS | 0.05 … 1 | 0.2 | `uSsrThick` | ✓ | post.js×2 |
| `wetDark` | WET ROAD DARKEN | 0 … 1.72 | 1 | `uWetDark` | ✓ | glx.js×2 |
| `windowSunFlash` | WINDOW SUN FLASH | 0 … 2.5 | 1 | `uWindowSunFlash` | ✓ | glx.js×2 |
| `skyRimGlow` | SKY RIM GLOW | 0 … 2.5 | 1 | `uSkyRimGlow` | ✓ | glx.js×2 |

## CAR  (13)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `carReflect` | CAR REFLECTION | 0 … 1 | 0.05 | `uCarReflect` | ✓ | game.js, post.js×10 |
| `carEnvCube` | ENV REFLECTION | 0 … 1 | 0.3 | — | ✓ | game.js, glx.js×2 |
| `carGloss` | PAINT GLOSS | 0.2 … 1.4 | 1 | `uCarGloss` | ✓ | game.js, post.js×2 |
| `carSpecular` | PAINT SPECULAR | 0 … 2.5 | 1 | — | ✓ | game.js |
| `carClearcoat` | CLEARCOAT | 0 … 1 | 0.05 | — | ✓ | game.js |
| `carMetal` | PAINT METALNESS | 0 … 2.5 | 1 | — | ✓ | game.js |
| `carGlow` | BODY GLOW | 0 … 2.5 | 1 | — | ✓ | game.js |
| `tailLightMul` | TAIL-LIGHT GLOW | 0 … 2.5 | 1 | — |   | frame-lights.js |
| `brakeGlowMul` | BRAKE FLARE | 0 … 2.5 | 1 | — |   | frame-lights.js |
| `tailRange` | TAIL-LIGHT RANGE | 60 … 310 | 160 | — |   | frame-lights.js×2 |
| `tailFade` | TAIL-LIGHT FADE | 0 … 60 | 0 | — | ✓ | frame-lights.js×2 |
| `carSunGlint` | PAINT SUN GLINT | 0 … 30 | 12 | `uCarSunGlint` | ✓ | glx.js×2 |
| `carSparkle` | METALLIC SPARKLE | 0 … 4 | 1.6 | `uCarSparkle` | ✓ | glx.js×2 |

## SKY & WEATHER  (35)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `cloudCover` | CLOUD COVER | -1 … 1 | 0 | — | ✓ | atmosphere.js×2 |
| `cloudShadowDim` | CLOUD SHADOW DEPTH | 0 … 1 | 0.8 | `uCloudShadowDim` |   | glx.js×2 |
| `cloudSpeed` | CLOUD SPEED | 0 … 2.5 | 1 | `uCloudSpeed` |   | game.js×4, glx.js×6, post.js |
| `starBright` | STAR BRIGHTNESS | 0 … 2.5 | 1 | `uStarBright` | ✓ | game.js×2, glx.js×2 |
| `starDensity` | STAR DENSITY | 0.2 … 2.2 | 1 | `uStarDensity` | ✓ | game.js×2, glx.js×2 |
| `skyGrad` | SKY GRADIENT | 0.03 … 0.829 | 0.35 | `uSkyGrad` | ✓ | game.js×2, glx.js×2 |
| `daySkyBlue` | DAY SKY BLUE | 0 … 2 | 1 | `uDaySkyBlue` | ✓ | game.js×2, glx.js×2 |
| `mieScatter` | SKY SUN GLOW | 0 … 2.5 | 1 | `uMieScatter` | ✓ | game.js×2, glx.js×2 |
| `cloudSilver` | CLOUD SILVER LINING | 0 … 2.5 | 1 | `uCloudSilver` | ✓ | game.js×2, glx.js×2 |
| `coronaAureole` | SUN AUREOLE | 0 … 2.5 | 1 | `uCoronaAureole` | ✓ | game.js×2, glx.js×2 |
| `sunDiscSize` | SUN DISC SIZE | 0.06 … 2.405 | 1 | `uSunDiscSize` | ✓ | game.js×2, glx.js×2 |
| `sunCorona` | SUN CORONA RING | 0 … 2.5 | 1 | `uSunCorona` | ✓ | game.js×2, glx.js×2 |
| `sunSquash` | SUN HORIZON SQUASH | 0 … 2.5 | 1 | `uSunSquash` | ✓ | game.js×2, glx.js×2 |
| `starSize` | STAR SIZE | 0.2 … 2.2 | 1 | `uStarSize` |   | game.js×2, glx.js×2 |
| `starTwinkle` | STAR TWINKLE | 0 … 4 | 1 | `uStarTwinkle` |   | game.js×2, glx.js×2 |
| `moonDiscSize` | MOON DISC SIZE | 0.06 … 2.405 | 1 | `uMoonDiscSize` |   | game.js×2, glx.js×2 |
| `moonHalo` | MOON HALO SPREAD | 0 … 2.5 | 1 | `uMoonHalo` |   | game.js×2, glx.js×2 |
| `cityGlowReach` | CITY GLOW REACH | 0.04 … 2.44 | 1 | `uCityGlowReach` | ✓ | game.js×2, glx.js×2 |
| `cloudDef` | CLOUD DEFINITION | 0 … 1.2 | 1 | `uCloudDef` |   | game.js×2, glx.js×2 |
| `skyColorSat` | SKY COLOUR SATURATION | 0 … 2.5 | 1 | — | ✓ | atmosphere.js×2 |
| `wetness` | WETNESS | -0.05 … 1 | -0.05 | — | ✓ | apex.js, game.js×11, glx.js×2 |
| `rainCount` | RAIN INTENSITY | 20 … 1000 | 360 | — | ✓ | particles.js |
| `rainStreak` | RAIN STREAK LEN | 0.04 … 2.44 | 1 | — | ✓ | particles.js |
| `rainSpeed` | RAIN FALL SPEED | 0.04 … 2.44 | 1 | — | ✓ | particles.js×2 |
| `drizzleCount` | DRIZZLE DENSITY | 0 … 1 | 0.3 | — | ✓ | particles.js×2 |
| `drizzleLen` | DRIZZLE STREAK | 0 … 1 | 0.5 | — |   | particles.js×2 |
| `drizzleSpeed` | DRIZZLE FALL SPEED | 0 … 1 | 0.6 | — |   | particles.js×2 |
| `rainOpacity` | RAIN OPACITY | 0 … 4 | 1 | — |   | particles.js×2 |
| `rainWind` | RAIN WIND | -3 … 3 | 0.18 | — | ✓ | particles.js |
| `rainShearWind` | RAIN SPEED SLANT | 0 … 2.25 | 0.9 | — |   | particles.js×2 |
| `rainShearLen` | RAIN SPEED STRETCH | 0 … 5 | 2 | — |   | particles.js×2 |
| `lightning` | LIGHTNING FREQ | 0 … 2.75 | 1 | — | ✓ | game.js×4, glx.js×2 |
| `lightningFlash` | LIGHTNING FLASH | 0 … 2 | 1 | — |   | game.js×2 |
| `lightningDecay` | LIGHTNING DECAY | 0.4 … 19.35 | 8 | — |   | game.js×4 |
| `weatherSunMute` | WEATHER SUN MUTE | 0 … 2.5 | 1 | — | ✓ | atmosphere.js×2 |

## IMAGE & COLOUR  (41)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `exposureMul` | EXPOSURE | 0.1 … 2.35 | 1 | — | ✓ | game.js |
| `contrast` | CONTRAST | 0.5 … 2.05 | 1.12 | `uContrast` | ✓ | scene.js×4, post.js×2 |
| `shadows` | SHADOWS | -0.55 … 0.55 | 0 | — | ✓ | post.js×3 |
| `midtones` | MIDTONES | -2 … 1.4 | 0 | — | ✓ | post.js×3 |
| `highlights` | HIGHLIGHTS | -1 … 1.5 | 0 | — | ✓ | post.js×3 |
| `whites` | WHITES | -1.8 … 3 | 0 | — | ✓ | post.js×3 |
| `toe` | TOE | -1 … 1 | 0 | — | ✓ | car3d.js, post.js×3 |
| `shoulder` | SHOULDER | -1 … 1 | 0 | — | ✓ | car3d.js, post.js×3 |
| `liftG` | LIFT · GREEN | -0.3 … 0.3 | 0 | — | ✓ | post.js×3 |
| `liftB` | LIFT · BLUE | -0.3 … 0.3 | 0 | — | ✓ | post.js×3 |
| `gammaR` | GAMMA · RED | 0.4 … 2.5 | 1 | — | ✓ | post.js×4 |
| `gammaG` | GAMMA · GREEN | 0.4 … 2.5 | 1 | — | ✓ | post.js×4 |
| `gammaB` | GAMMA · BLUE | 0.4 … 2.5 | 1 | — | ✓ | post.js×4 |
| `gainR` | GAIN · RED | 0.4 … 2.5 | 1 | — | ✓ | post.js×4 |
| `gainG` | GAIN · GREEN | 0.4 … 2.5 | 1 | — | ✓ | post.js×4 |
| `gainB` | GAIN · BLUE | 0.4 … 2.5 | 1 | — | ✓ | post.js×4 |
| `vibrance` | VIBRANCE | 0 … 1.5 | 0.2 | `uVibrance` | ✓ | post.js×2 |
| `tint` | WARM / COOL | -6 … 6 | 0 | `uTint` | ✓ | track-lights.js×2, gltf.js, post.js×2, geom.js, tracks.js |
| `gradeStr` | GRADE STRENGTH | 0 … 2.5 | 1 | — | ✓ | game.js |
| `shadowHue` | SHADOW TINT HUE | -180 … 180 | 0 | — |   | game.js×2 |
| `hiHue` | HIGHLIGHT TINT HUE | -180 … 180 | 0 | — |   | game.js×2 |
| `vignetteSoft` | VIGNETTE REACH | 0.1 … 0.69 | 0.35 | `uVigSoft` | ✓ | post.js×2 |
| `blackLift` | BLACK FLOOR | 0 … 0.2 | 0.005 | `uBlackLift` | ✓ | post.js×2 |
| `whitePoint` | ACES WHITE SCALE | 0.08 … 2.38 | 1 | `uWhitePoint` | ✓ | post.js×2 |
| `acesA` | TONE CURVE SHOULDER | 1.6 … 4 | 2.51 | `uAcesA` | ✓ | post.js×2 |
| `acesB` | TONE CURVE TOE LIFT | 0 … 0.08 | 0.03 | `uAcesB` | ✓ | post.js×2 |
| `acesC` | TONE CURVE CONTRAST | 1.6 … 4 | 2.43 | `uAcesC` | ✓ | post.js×2 |
| `acesD` | TONE CURVE MIDS | 0.2 … 1.2 | 0.59 | `uAcesD` | ✓ | post.js×2 |
| `acesE` | TONE CURVE BLACK | 0.02 … 0.45 | 0.14 | `uAcesE` | ✓ | post.js×2 |
| `chromAb` | CHROMATIC AB. | 0 … 15 | 0 | `uChromAb` |   | post.js×2 |
| `grain` | FILM GRAIN | 0 … 0.3 | 0 | `uGrain` |   | post.js×2 |
| `lensDirt` | LENS DIRT | 0 … 1 | 0.15 | `uLensDirt` | ✓ | post.js×2 |
| `flareMul` | LENS FLARE | 0 … 2.5 | 1 | — | ✓ | game.js×2, post.js×2 |
| `flareStreak` | FLARE STREAK | 2 … 10 | 7 | `uFlareStreak` | ✓ | post.js×2 |
| `flareStreak2` | FLARE CORE STREAK | 0 … 1.25 | 0.5 | `uFlareStreak2` | ✓ | post.js×2 |
| `sharpen` | SHARPEN | 0 … 2.5 | 0 | `uSharpen` | ✓ | post.js×2 |
| `speedBlur` | SPEED BLUR | 0 … 3 | 0 | `uSpeedBlur` |   | game.js×3, post.js×2 |

### TONAL RANGE

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `blacks` | BLACKS | -0.6 … 0.6 | 0 | — | ✓ | post.js×3 |

### RGB LIFT / GAMMA / GAIN

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `liftR` | LIFT · RED | -0.3 … 0.3 | 0 | — | ✓ | post.js×3 |

### COLOUR

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `saturation` | SATURATION | 0 … 2.5 | 1 | `uSaturation` | ✓ | post.js×2 |

### LENS & FINISH

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `vignette` | VIGNETTE | 0 … 1 | 0.8 | `uVignette` | ✓ | post.js×2 |

## FX  (1)

| id | slider | range | def | uniform | preset | consumed in |
|---|---|---|---|---|---|---|
| `particleMul` | PARTICLE FX | 0 … 2 | 1 | — | ✓ | particles.js×2 |
<!-- /GENERATED -->

---

## Tools for exploring sliders

Two tools exist for measuring and visualising slider effects. They use
**different browser mechanisms** and must not run simultaneously.

| | `slider-effect --live` | `cdmcp-cli.py look-survey` |
|---|---|---|
| Browser | Playwright (owns its own Chromium) | Chrome DevTools MCP (connects to an existing session) |
| Purpose | A/B or N-shot ramp a **single knob** | Full tod×weather **matrix** for a circuit |
| Camera lock | Yes — `A.view({eye,target})` pinned between shots | No — each shot parks fresh |
| renderClock | Pinned to 0 (no sky drift) | Not pinned |
| Pixel diff | `filter.png`, `heat.png`, MAD/p99 stats | No — raw screenshots only |
| Stitched sheet | `sheet.png` per knob | `docs/look-survey/<id>_grid.png` (via look-survey-sheet.py) |
| Can run together | **No** — check `pgrep -a chromium` first | **No** |

### slider-effect quick reference

```sh
# No browser — classify all knobs in a group
node tools/slider-effect.mjs --group LAMPS
node tools/slider-effect.mjs --risk inert --json

# Single knob A/B (default: shipped def → farther extreme)
node tools/slider-effect.mjs --live saturation
node tools/slider-effect.mjs --live glareStr   # auto-selects night + full 0→0.3 range

# Explicit range
node tools/slider-effect.mjs --live saturation --from 0 --to 2

# 5-shot ramp (shows full range, not just two endpoints)
node tools/slider-effect.mjs --live contrast --shots 5

# Batch — one park per shared condition
node tools/slider-effect.mjs --live --ids bloomMul,bloomSpread,threshOff
node tools/slider-effect.mjs --live --group "NIGHT GLOW & BLOOM"

# Dry-run: see recipes without launching a browser
node tools/slider-effect.mjs --live --all --dry-run
node tools/slider-effect.mjs --live glareStr --dry-run

# Filter only (two existing PNGs, no game)
node tools/slider-effect.mjs --filter --a a.png --b b.png --out dir/
```

### look-survey quick reference

```sh
# Serve the game first (required — Chrome MCP needs a URL):
npx serve -l 3456 .

# All 20 conditions for a circuit
python3 tools/cdmcp-cli.py look-survey monaco --frac 0.45

# Subset
python3 tools/cdmcp-cli.py look-survey bahrain --frac 0.12 \
  --combos dawn|dry,day|dry,dusk|dry,night|dry,night|wet,night|rain

# Batch plan (shoots only missing PNGs across all circuits)
python3 tools/cdmcp-cli.py look-survey --plan artifacts/lighting/survey-plan.json

# Stitch the 4×5 contact sheet
python3 tools/look-survey-sheet.py monaco
# Or all circuits that have shots:
python3 tools/look-survey-sheet.py --ready
```

### When a slider appears inert

1. **Confirm the condition** — `--dry-run` shows which track/tod/weather the
   recipe picks. Night-gated knobs do nothing on a day track.
2. **Check `lightState()`** — pixel MAD is the wrong measure for ambient/fog
   knobs diluted across the frame. Run `node tools/slider-effect.mjs --live
   nightAmbLift --shots 2` and look at `result.json` → `movedFields`.
3. **Check `result.stored`** — if `stored.a === stored.b` the value was not
   accepted (clamped, not in `APPLY_RACE_IDS`, or `rebuild:true` not triggering).
4. **`--shots 5`** — the default 2-shot can land on a flat region; a ramp
   shows where the curve starts moving.

See also: `tools/slider-effect.mjs --risk inert` lists knobs the static
classifier has flagged as conditionally or structurally inert.
