---
name: debug-cameras
description: Drive the camera via the __apex debug hooks — the 12 in-game camera modes plus the free debug-camera framing hooks (view/eyeAt/orbit/cinematic/roadside/dolly/carOrbit/tourShots) and the camState/viewState inspectors. Use to frame a corner, switch camera mode, set up a cinematic/orbit shot, or check where the camera is. Triggers - "switch to cockpit cam", "orbit this corner", "what camera modes are there", "frame the chicane", "cinematic shot of turn 1".
---

# Camera debug hooks

Verified live against the running game (`tools/apex-eval.mjs`). Two layers: the
**12 built-in camera modes** (what a player cycles with C / the CAM button) and
the **free debug camera** (`view()` and friends) that overrides them for framing.

## The 12 camera modes

`__apex.camera()` → `{ mode, index, modes:[...] }`. Full list, in cycle order:

```
chase  far  cockpit  hood  overhead  heli  reverse  side  cinematic  low  tcam  rear
```

Set by id, label, or index: `__apex.camera("cockpit")` / `__apex.camera(2)`.
All 12 render non-blank (confirmed via screenshot byte-size). After switching,
call `__apex.snapCam()` to jump the chase/hood/cockpit rig to position without
damping (essential before a screenshot). `camera()` clears any active `view()`.

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
| `tourShots(n)` | `Array(n)` shot descriptors | evenly-spaced orbit shots for a tour |

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
```
```js
// in a Playwright page or the dev console — frame + freeze + (screenshot):
__apex.race("monaco"); __apex.park(0.18);   // stationary + frozen
__apex.orbit(0.18, 60, 20, 40);             // orbit the chicane
// for a PNG, use the inspect-scene skill's shot.mjs (cam = orbit|eye|cinematic|trackside)
```

To actually capture frames, pair this with the **inspect-scene** skill
(`shot.mjs`). For parallel multi-shot/multi-track capture, see **playwright-probe**.
