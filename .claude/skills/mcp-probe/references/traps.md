# MCP probe traps (load on demand)

Measured war stories. Read only when debugging shots, lighting A/B, occlusion, or camera stability.

## THE trap: never render in the MCP browser while Playwright is running

A live game page in the MCP browser holds ~20% CPU (survey-ui-matrix measured
21.7%). On this 4-core box that is enough to starve a concurrently-running
Playwright render and produce **false failures**, not just timeouts. Measured
2026-08-12: rendering one Portimão frame here while `test:webgl` ran turned two
passing specs red — a 120 s timeout AND an assertion miss (`dynamic player shadow`
read a stale-frame transform, delta 694 vs `< 5`). Both passed clean solo. So:

- **Check `node tools/test-bg.mjs --status` before you render here.** If a group
  is running, wait — or accept you will re-run its false-fails solo.
- **Park to `about:blank` (`navigate_page`) the moment you're done**, so the warm
  page doesn't tax the next `test-solo`.
- **"The moment you're done" is a promise you WILL break once you get absorbed in
  something else — make parking a precondition of starting a Playwright run, not
  a thing you remember to do first.** MEASURED 2026-08-13: after a multi-shot MCP
  session proving out a shadow-acne fix, the very last verification screenshot's
  `navigate_page(about:blank)` call got skipped — attention had moved to writing
  up the finding — and the live game page sat there actively rendering (frozen
  car, but the render loop keeps running) through a `test-bg.mjs gfx` (then `ab webgl`)
  launch. Load average climbed to 8–12 (guidance: < 3) and produced a real
  `page.screenshot: Timeout 60000ms exceeded` failure plus several more in the
  second group — a genuine false failure that took a `ps -eo pid,etimes,args`
  audit to trace back to 4+ lingering Chromium renderer processes from the MCP
  session, not to orphans from a killed run (the first, wrong hypothesis — those
  look identical in `pgrep -cf pw-browsers` and only `ps` with full args
  distinguishes `chrome-devtools-mcp`'s own tree from Playwright's). **Before
  every `test-bg.mjs` invocation, `navigate_page(about:blank)` unconditionally**
  — even (especially) when you're confident you already parked. It's one call;
  the cost of skipping it once is a full contaminated test run.
- **Parking is NECESSARY BUT NOT SUFFICIENT — verify by CPU, then kill by age.**
  The bullet above reads as though `about:blank` ends the problem. It does not.
  MEASURED 2026-08-14: after a mobile-emulation session, `navigate_page` to
  `about:blank` returned success and the page WAS blank, yet the MCP browser's
  GPU process still held **174% CPU** five minutes later, and a `test:webgl`
  launched on top of it inherited that load. (A plausible contributor: CPU
  throttling / device-metrics overrides set via `emulate` survive the
  navigation — the emulation banner is re-printed on every subsequent call —
  so the compositor keeps working even with nothing to draw.) So park, then
  CHECK, then kill:

  ```sh
  # Ages separate the two trees far more reliably than args do: the run you
  # just started is seconds old, an MCP browser is minutes old.
  ps -eo pid,etimes,pcpu,comm | awk '$4 ~ /chrome/ {print $1, $2"s", $3"%"}'
  for p in $(ps -eo pid,etimes,comm | awk '$2>120 && $3 ~ /chrome/ {print $1}'); do
    kill -9 $p 2>/dev/null            # >120s = pre-dates the run; MCP's, not Playwright's
  done
  ```

  Do this AFTER `test-bg.mjs` has started (so its own processes are the young
  ones) and confirm every survivor shares the run's age. A parked-but-spinning
  MCP browser is indistinguishable from a healthy box by load average alone,
  which is why the check has to be per-process.
- A screenshot returned with the left ~400 px solid black = the WebGL canvas, not
  the MCP. For UI (not 3D) work, `headless(true)` + hide `#game` first — that's
  survey-ui-matrix's department.

---

## A SECOND trap: `snapCam()` after a free-cam call cancels the free-cam

`park()`/`jump()` need `snapCam()` right after them (see `docs/DEBUG-HOOKS.md`).
`orbit()`/`view()`/`dolly()`/`eyeAt()`/`roadside()`/`cinematic()`/`sky()` do
**not** — they position the free-cam (`G.dbgCam`) instantly, no easing to settle.
Calling `snapCam()` after one of them does `G.dbgCam = null` first and snaps back
to the ordinary player camera mode, silently discarding the framing you just set.
It doesn't error — you get a real, in-focus render, just not the shot you asked
for, so a "before"/"after" pair taken this way can show two DIFFERENT camera
positions with nothing to flag it.

MEASURED 2026-08-12 (proving out lighting-tuner sliders this way): `orbit(0.16,
40, 20, 20); snapCam();` before one screenshot and the identical call before a
second gave a wide cityscape in one and a close-up car in the other — the
`snapCam()` was cancelling the orbit both times and each shot landed at a
different point in the chase cam's own spring-back. Dropping `snapCam()` (just
`orbit(...)` + a couple of `requestAnimationFrame` waits) made every subsequent
pair land on the identical framing.

```js
// WRONG — snapCam() cancels the orbit that came before it
__apex.orbit(0.16, 40, 20, 20);
__apex.snapCam();              // <- G.dbgCam = null; back to chase
// RIGHT — free-cam hooks need no snap; just let a couple of frames settle
__apex.orbit(0.16, 40, 20, 20);
await new Promise(r => requestAnimationFrame(r));
await new Promise(r => requestAnimationFrame(r));
```

`viewState().dbgCamActive` tells you which camera is actually live — check it
once when setting up a shot sequence rather than assuming.

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

## A FIFTH trap: only `chase` (and other player-relative modes) hold still for a frozen before/after pair — broadcast-cut cameras and the debug free-cam don't

Three separate ways a "stable" comparison turns out not to be, all found in one
session (2026-08-13) proving out the lighting-tuner distance sliders:

**1. Broadcast camera modes (`heli`, `far`, and likely others in `CAM_MODES`)
re-cut/retarget between calls, even with the player frozen.** They aren't
purely player-relative — some pick a trackside camera or retarget based on
track position, independent of your `park()`. MEASURED: `camera('heli')` +
`park(0.15)` + `snapCam()`, then only `lightTune()` + `step()` calls (no camera
call at all) between two screenshots — `eye`/`target` moved from
`[90.7, 20.9, 142.0]` to `[94.1, 21.1, 120.9]`, a totally different frame the
second shot. `camera('far')` did the same, worse (jumped ~280m). Only
`camera('chase')` (and presumably the other strictly player-relative modes —
`cockpit`, `hood`, `reverse`, `tcam`) held `eye`/`target` identical to 5+
decimal places across `lightTune()` + `step()` calls with no re-snap. **Use
`chase` (or another confirmed player-relative mode) for any comparison pair,
and verify by diffing `viewState().eye`/`.tgt` between the two states before
trusting the screenshots** — don't assume any non-`chase` mode is safe just
because it's not `orbit()`/`view()` (the free-cam family covered by the SECOND
trap above).

**2. `orbit()`/`view()`/`eyeAt()`-family calls silently zero the draw-distance
cull.** `game.js`'s `frame.cullDist = dbgCam ? (gfx.isMobile ? 700 : 0) : ...`
— on desktop, ANY free-cam hook (`G.dbgCam` set) makes the scenery draw-distance
cull a no-op (uncapped), and the far-clip plane comes from `dbgCam.far`, not the
renderDistMul-scaled `farPlane`. A render-distance knob will show **zero**
effect under `orbit()`/`view()` regardless of whether it works, because the
thing it scales isn't even being applied. If a knob claims to affect draw
distance, test it under `chase` (or another `dbgCamActive:false` mode) — check
`viewState().dbgCamActive` before you trust a null result.

**3. `park()`/`jump()` called before the race's start-lights sequence resolves
gets overridden the moment you next advance frames.** MEASURED: `go()` →
`setTimeOfDay('night')` → `park(0.3)` → `snapCam()` → screenshot showed
`POS -/22, TIME -` (still in the grid/formation hold) with a broadcast-style
overview framing; the very next call, `step(1/60, 30)`, pushed the race past
its start and the HUD flipped to `POS 1/22, TIME 0:00.50` — the start sequence
re-seated the car at its grid slot, discarding the parked position, and the
camera reset to a completely different chase framing. **Always `step()` well
past the start (≈120 frames / 2s was enough) before your first `park()`+
`snapCam()`**, not after — parking into a still-resolving race state is not
stable no matter how carefully everything after it is done.

The combined safe recipe for a trustworthy before/after pair:
```js
__apex.race(track); /* wait for track */ __apex.go();
__apex.step(1/60, 120);                 // clear the start-lights hold FIRST
__apex.camera('chase');                 // player-relative — not heli/far/orbit/view
__apex.park(s); __apex.snapCam();
// capture "before" viewState().eye/.tgt, screenshot
// change ONLY the tuned value(s) + a short step() to let effects settle
// re-check viewState().eye/.tgt matches "before" — if not, the pair is invalid
// screenshot "after"
```

NOTE: see the SEVENTH trap below (chase cam auto-cuts after ~2s idle) — the
`viewState().eye`/`.tgt` re-check above only proves the camera hadn't moved
*at the moment you captured it*, not at the moment the screenshot itself
fired. If your setup call and your screenshot call are separated by more than
about 1.5s of real wall-clock (MCP round-trip latency, not `step()`'s
simulated time), re-verify `viewState()` again immediately after the
screenshot, not just before it.

## A SIXTH trap (FIXED 2026-08-13): `jump()`/`park()` used to render the car mid-air

`playerAnchor()`/`renderPosOf()` (js/game.js) draw the HUMAN car from
`c.rPrevPx`/`c.rPrevPz` (WORLD-space render-interpolation anchors) blended
toward `c.px`/`c.pz` by `renderAlpha` — NOT from `c.rPrevS`/`c.rPrevX` (the
arc-based anchors, which only feed the AI-car branch). `jump()`
(`js/agent/apex.js`) reset `rPrevS`/`rPrevX` on teleport but never touched
`rPrevPx`/`rPrevPz`, so the player mesh kept rendering a straight-line lerp
between wherever it was BEFORE the teleport and the new spot. Under `park()`'s
`G.frozen` (physics never steps again, so `renderAlpha` never advances) that
lerp never resolved — the car sat at a permanent mid-blend position, which on
a curved track can be off the road, mid-air, or nowhere near either endpoint.
MEASURED: `park(0.10)` on Monaco (a track with a ~36 m road-over-terrain
viaduct gap right there) rendered the car airborne against the skyline, no
road visible under it, in BOTH the chase cam and a free-cam aimed exactly at
`physState().px/pz` — the free-cam shot showed no car at all, because the
render position wasn't near the aim point either. `physState()`/`groundY()`
read correctly the whole time — only the drawn mesh was wrong, which is why
this reads as "the car is floating," not as an obvious data bug. Fixed by
also syncing `G.player.rPrevPx = G.player.px; G.player.rPrevPz = G.player.pz;`
in `jump()` — verified: same `park(0.10)` now renders the car grounded,
correctly oriented, at the exact `physState()` position. If a screenshot ever
shows the car detached from the road again, checking `rPrevPx` vs `px` is the
first move, not distrusting the shot.

## A SEVENTH trap: the chase cam auto-cuts to a broadcast angle after ~2 s idle

Even with `frozen: true` and `speed: 0`, the CHASE camera (not the free-cam)
periodically jumps `eye`/`tgt` to an unrelated position — MEASURED: stable for
~2.0–2.1 s after `park()+snapCam()`, then a hard cut (not an ease) to a
different vantage, sometimes hundreds of metres away in `z`, and it keeps
cutting every ~2.2–2.5 s after that. `camMode` stays reported as `"chase"`
throughout — this is not a mode switch you can detect from `viewState()`
alone, and the player's own `physState()` position never moves, so it is
purely a camera-side idle/broadcast-style cycle. A screenshot taken more than
~1.5 s after `snapCam()` can silently land on one of these cut angles instead
of the expected close driving shot — combined with the fifth trap above, this
is what originally made a parked car look like it was "flying" over Monaco's
harbour. Two ways to avoid it: take the chase-cam shot within ~1.5 s of
`snapCam()` (before the first cut), or — safer for any multi-shot comparison
— use the free-cam (`orbit()`/`dolly()`/`view()`) for the whole sequence, same
as the sky/cloud guidance above; it held perfectly static (six samples, zero
drift, ~3 s span) in the same session where chase cam cut twice in the same
window.

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
[`docs/OCCLUSION-PROBE.md`](docs/OCCLUSION-PROBE.md). It costs one
`evaluate_script` and returns a number you can put in a commit message —
`2722 px → 0 px` beats "looks better now".

## A TWELFTH trap: the CAMERA only advances on real rAF frames — not on step()

`act()` and `step()` advance PHYSICS. They do not run the camera smoothing in
js/game.js (`camEye`/`camTgt` damp toward the solved vantage), so a loop of
`act(); read viewState()` reads a camera frozen at the last RENDERED frame while
the car's heading marches on. Anything you compute from that pair — aim-vs-
heading, lag, framing — is measuring frame starvation, not the code.

MEASURED 2026-08-14 while proving out a cockpit aim fix: per call, heading moved
1.7 deg and the aim moved EXACTLY 0.000 — on `act()` AND on `step()`. Three
successive attempts to measure camera lag this way produced 170-180 deg, 33 deg
and 21 deg "results", all of them pure staleness, before the null test above was
run. Run that null test FIRST: if `dAim` is 0 while `dHead` is not, stop.

The instrument that works: sample INSIDE the frame the camera updates in, and
drive with real input so rAF keeps running (a tight JS `act()` loop starves it).

```js
const rec = []; let stop = false;
const tick = () => { if (stop) return;
  const v = __apex.viewState(), p = __apex.physState();
  rec.push({ yaw: Math.atan2(v.tgt[0]-v.eye[0], v.tgt[2]-v.eye[2])*180/Math.PI,
             head: (p.head||0)*180/Math.PI, yawRate: (p.yawRate||0)*180/Math.PI });
  requestAnimationFrame(tick); };
requestAnimationFrame(tick);
window.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowLeft', code:'ArrowLeft'}));
await new Promise(r => setTimeout(r, 4000));      // WALL CLOCK, so real frames land
```

Under SwiftShader that yields only 2-3 frames in 4 s, so filter to frames that
are actually rotating (`yawRate > 5`) and report a median, not a mean. It is a
small sample by construction — enough to separate 0.55 deg from 3.34 deg, not
enough to quote three significant figures.

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
one: `node tools/verify-track.cjs <id>`, then comment the call out and run it
again. Identical `props N` = nothing was emitted. **Run a control first** — add
a throwaway `for (let i=0;i<50;i++) addBox(out, [0,500+i,0], [10,10,10], [1,0,0]);`
and confirm the number moves (+1200) — because two equal readings look identical
whether the geometry is absent or your edit simply isn't being read. Note also
that MOVING a prop never changes the count, so relocation tests prove nothing
about emission; only add/remove does.

## A TENTH trap: camera `lat` and circuit `gap` are different spaces

`eyeAt(f, lat, …)` measures `lat` from the **centreline**. A circuit places
scenery with `anchor(k, side, gap)` / `building(k, side, gap, w, …)`, where
`gap` is **beyond the road edge**, and `building()` centres its mass half a
width further out again. Nothing converts between them:

```js
const lat = side * (hw + gap);            // anchor()-placed prop  (hw ≈ baseHW, ~7)
const lat = side * (hw + gap + w / 2);    // building() mass centre
```

MEASURED 2026-08-14: hunting Imola's pit complex at `building(…, -1, 20, 16, …)`
— really `lat ≈ -35` — was attempted at `lat ±75` and burned a dozen
screenshots of grass and treetops before the arithmetic was done. When the frame
already exists, skip the conversion entirely: read `scene().props[].at` for
world coords and aim with `view({eye, yaw, pitch})`, which takes world space
directly. (`orbit(f, az, el, dist, h, opts)` always targets the point on the
CENTRELINE at `f`, so it cannot centre on off-track scenery at all — it can only
put it somewhere in frame.)

---
