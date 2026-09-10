# MCP probe traps — camera

Load from traps.md when debugging this class of failure.

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
