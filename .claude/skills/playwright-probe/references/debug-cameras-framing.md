# Free-cam framing, previewCam, recipes

Index: [SKILL.md](../SKILL.md). Load this file when framing a shot, previewing
an in-game mode at a fraction, or running `apex-eval` / `apex-capture` recipes.

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
| `view({s, side, dist, height, look})` | `{eye,target}` (no `look` field) | trackside survey. **Only `look:"in"` is special** (faces back across the track); any other value, or omitting `look`, gives the SAME "out into the scenery" framing — `view()` does not recognise `"fwd"`/`"back"` at all (that's `roadside()`, below) |
| `view({eye, target, fov})` | explicit placement | hand-place the camera |
| `eyeAt(frac, lat, height)` | `{eye,target}` | driver's-eye / how it reads at the wheel |
| `orbit(frac, az, el, dist, h)` | `{eye,target,fov}` | inspect a point from any angle |
| `cinematic(frac)` | `{eye,target,fov,az,k}` | auto outside-of-corner framing (reads curvature `k`) |
| `roadside(frac, side, dist, h, {look})` | `{eye,target,look}` | stand beside the track; unlike `view()`, `roadside()` supports the FULL set — `look` = `"fwd"` (default, direction of travel) / `"back"` / `"in"` (across the track) / `"out"` (into the scenery), and echoes it back in the return |
| `dolly(frac, fwd, right, up)` | `{eye,target}` | track-relative offset looking at another point |
| `carOrbit(idx, az, el, dist)` | `{eye,target,fov,carIdx,speed}` | orbit any car (livery/car3d checks) |
| `previewCam(mode, frac, speed, lat)` | `{eye,target,fov,mode}` | preview any in-game mode's framing at a point (no driving) |
| `tourShots(n)` | `Array(n)` shot descriptors | evenly-spaced orbit shots for a tour |
| `tourShots(n, {atCorners:true})` | `Array` corner shots | one outside-of-apex shot per detected corner (broadcast tour) |

**`look` trap:** `view()` only treats `look:"in"` as special. `"fwd"` / `"back"`
are `roadside()` only. `orbit()` **replaces** the live camera (not layered);
do **not** `snapCam()` after `orbit()` — `snapCam()` clears `dbgCam`.

## Inspectors

- `__apex.camState()` → `{eye, tgt, fov, debug}` — `debug:true` means a `view()`
  override is active.
- `__apex.viewState()` → `{camMode, camIndex, frozen, dbgCamActive, skyOverride,
  weather, state, eye, tgt, fov, debug}` — the full scene/camera snapshot.

## Quick recipes

```sh
# one-off via the reusable evaluator (boots headless, prints JSON):
node tools/shot/apex-eval.mjs monaco "a.camera()"                 # list modes / current
node tools/shot/apex-eval.mjs spa    "a.cinematic(0.07)"          # resolve Eau Rouge cinematic
node tools/shot/apex-eval.mjs monza  "(a.park(0.03), a.orbit(0.03,45,18,45), a.camState())"  # T1 ~0.016–0.042 (monza.js turns)

# lap tour — chase cam at every 5% of a circuit (20 shots in order):
node tools/shot/apex-capture.mjs lap-tour monza           # → scratch/captures/apex-capture/lap-tour/01-f0.00.png … 20-f0.95.png
node tools/shot/apex-capture.mjs lap-tour monaco 55       # slower speed for tighter street circuit
node tools/shot/apex-capture.mjs lap-tour spa 70 scratch/captures/apex-capture/spa # custom outdir
```
```js
// in a Playwright page or the dev console — frame + freeze + (screenshot):
__apex.race("monaco");
// Probe fractions first — don't hardcode folklore:
// __apex.trackInfo({what:"corners"}) or __apex.corners() or the def's `turns` in js/circuits/<id>.js
__apex.park(0.18);   // stationary + frozen
__apex.orbit(0.18, 60, 20, 40);             // orbit the chicane (dbgCam — no snapCam after)
// for a PNG, use tools/shot/shot.mjs (cam = orbit|eye|cinematic|trackside)

// manual chase-cam snap (the lap-tour pattern in bare JS):
__apex.jump(0.035, 60, 0);  // Monza T1 ~0.016–0.042 (monza.js turns), not 0.1
__apex.camera("chase");     // switch to chase mode
__apex.snapCam();           // snap rig without damping — essential before a screenshot
```

To capture a single framed shot, a full lap tour, or a parallel multi-track
sweep, see **playwright-probe** (owns `shot.mjs`, `apex-eval.mjs`,
`apex-capture.mjs` and all Playwright/Chromium mechanics).
