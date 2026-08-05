---
name: debug-cameras
description: Use when the user asks to switch or check camera modes, cockpit/chase/orbit/cinematic/roadside shots, frame a corner/chicane, inspect camState/viewState, debug camera lag/framing, or set up Apex 26 screenshots from specific camera angles.
---

# Camera debug hooks

Verified live against the running game (`tools/apex-eval.mjs`). Two layers: the
**13 built-in camera modes** (what a player cycles with C / the CAM button) and
the **free debug camera** (`view()` and friends) that overrides them for framing.

## The 13 camera modes

`__apex.camera()` → `{ mode, index, modes:[...] }`. Full list, in cycle order
(`CAM_MODES` in game.js):

```
chase  far  drift  cockpit  hood  overhead  heli  reverse  side  cinematic  low  tcam  rear
```

- **drift** — action chase that swings to the OUTSIDE of a slide so the car's flank
  faces camera under oversteer; settles behind when gripping.
- **heli/side/cinematic** are corner-aware: they auto-pick the OUTSIDE of the
  upcoming bend and shoot across the apex (driven by look-ahead curvature).
- **chase/far/cockpit/hood/tcam** aim at the *curved* centreline ahead, so
  they look INTO the corner rather than straight off the car's tail.

Set by id, label, or index: `__apex.camera("cockpit")` / `__apex.camera(3)`.
All 13 render non-blank (confirmed via screenshot byte-size). After switching,
call `__apex.snapCam()` to jump the rig to position without damping — it now snaps
**every** mode correctly (essential before a screenshot). `camera()` clears any
active `view()`. Cuts ease in over ~0.35 s (a brief gentle glide, not a hard pop);
onboard cams (cockpit/hood/tcam) lock instantly to the car.

## Preview any in-game mode anywhere (no driving)

`__apex.previewCam(mode, frac, speed, lat)` sets the debug free-cam to EXACTLY how
the in-game camera `mode` would frame the car at lap-fraction `frac` (speed m/s,
lat off centre) — without moving the car. Ideal for screenshotting how DRIFT or
HELI frames a specific corner. Cleared by `camera()`/`snapCam()` like other debug
cams. e.g. `__apex.previewCam("drift", 0.21, 65)`.

## Free debug-camera framing hooks

Each returns the resolved `{eye, target, ...}` and sets a debug override
(`camState().debug === true`). They persist until you call a game `camera()`.

| Hook | Returns | Use |
|---|---|---|
| `view({s, radius})` | `{eye,target,span}` | frame a track fraction from a distance |
| `view({s, side, dist, height, look})` | `{eye,target,look}` | trackside survey; `look` = `in`/`out`/`fwd`/`back` |
| `view({eye, target, fov})` | explicit placement | hand-place the camera |
| `eyeAt(frac, lat, height)` | `{eye,target}` | driver's-eye / how it reads at the wheel |
| `orbit(frac, az, el, dist, h)` | `{eye,target,fov}` | inspect a point from any angle |
| `cinematic(frac)` | `{eye,target,fov,az,k}` | auto outside-of-corner framing (reads curvature `k`) |
| `roadside(frac, side, dist, h)` | `{eye,target,look}` | stand beside the track |
| `dolly(frac, fwd, right, up)` | `{eye,target}` | track-relative offset looking at another point |
| `carOrbit(idx, az, el, dist)` | `{eye,target,fov,carIdx,speed}` | orbit any car (livery/car3d checks) |
| `previewCam(mode, frac, speed, lat)` | `{eye,target,fov,mode}` | preview any in-game mode's framing at a point (no driving) |
| `tourShots(n)` | `Array(n)` shot descriptors | evenly-spaced orbit shots for a tour |
| `tourShots(n, {atCorners:true})` | `Array` corner shots | one outside-of-apex shot per detected corner (broadcast tour) |

## Inspectors

- `__apex.camState()` → `{eye, tgt, fov, debug}` — `debug:true` means a `view()`
  override is active.
- `__apex.viewState()` → `{camMode, camIndex, frozen, dbgCamActive, skyOverride,
  weather, state, eye, tgt, fov, debug}` — the full scene/camera snapshot.

## Quick recipes

```sh
# one-off via the reusable evaluator (boots headless, prints JSON):
node tools/apex-eval.mjs monaco "a.camera()"                 # list modes / current
node tools/apex-eval.mjs spa    "a.cinematic(0.07)"          # resolve Eau Rouge cinematic
node tools/apex-eval.mjs monza  "(a.park(0.1), a.orbit(0.1,45,18,45), a.camState())"

# lap tour — chase cam at every 5% of a circuit (20 shots in order):
node tools/apex-capture.mjs lap-tour monza           # → scratch/captures/apex-capture/lap-tour/01-f0.00.png … 20-f0.95.png
node tools/apex-capture.mjs lap-tour monaco 55       # slower speed for tighter street circuit
node tools/apex-capture.mjs lap-tour spa 70 scratch/captures/apex-capture/spa # custom outdir
```
```js
// in a Playwright page or the dev console — frame + freeze + (screenshot):
__apex.race("monaco"); __apex.park(0.18);   // stationary + frozen
__apex.orbit(0.18, 60, 20, 40);             // orbit the chicane
// for a PNG, use the playwright-probe skill's shot.mjs (cam = orbit|eye|cinematic|trackside)

// manual chase-cam snap (the lap-tour pattern in bare JS):
__apex.jump(0.35, 60, 0);   // teleport to 35% of lap at 60 m/s
__apex.camera("chase");     // switch to chase mode
__apex.snapCam();           // snap rig without damping — essential before a screenshot
```

To capture a single framed shot, a full lap tour, or a parallel multi-track
sweep, see **playwright-probe** (owns `shot.mjs`, `apex-eval.mjs`,
`apex-capture.mjs` and all Playwright/Chromium mechanics).
