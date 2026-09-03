---
name: debug-cameras
description: Use when the user asks to switch or check camera modes, cockpit/chase/orbit/cinematic/roadside shots, frame a corner/chicane, inspect camState/viewState, debug camera lag/framing, or set up Apex 26 screenshots from specific camera angles.
---

# Camera debug hooks

Verified live (`tools/shot/apex-eval.mjs`). Two layers: the **13 built-in camera
modes** (C / CAM button) and the **free debug camera** (`view()` and friends)
that overrides them for framing.

## The 13 camera modes

`__apex.camera()` → `{ mode, index, modes:[...] }`. Cycle order
(`CamModes.CAM_MODES` in `js/camera/mode-switch.js`):

```
chase  far  drift  cockpit  hood  overhead  heli  reverse  side  cinematic  low  tcam  rear
```

Set by id, label, or index: `__apex.camera("cockpit")` / `__apex.camera(3)`.
All 13 render non-blank. After switching, `__apex.snapCam()` jumps the rig
without damping (every mode). `camera()` clears any `view()` / debug override.
Cuts ease ~0.35 s; onboard (cockpit/hood/tcam) lock instantly.

- **drift** — swings OUTSIDE a slide so the flank faces camera; settles behind when gripping.
- **heli/side/cinematic** — corner-aware: auto-pick the OUTSIDE of the upcoming bend.
- **chase/far/cockpit/hood/tcam** — aim at the *curved* centreline ahead (INTO the corner).

## `orbit()` vs `snapCam()`

`orbit()` sets `dbgCam` and **replaces** the live view — it is not layered on
a player camera. `camera("cockpit")` then `orbit()` does **not** keep cockpit
framing; you get a free-orbit shot.

- **Cockpit-style at a fraction:** `previewCam("cockpit", frac, speed, lat)`
  or `camera("cockpit")` + `park(frac)` + `snapCam()` — never `orbit()` after
  `camera()`.
- **Orbit inspection:** `orbit(frac, az, el, dist)` alone — do **not** call
  `snapCam()` after `orbit()` (it clears `dbgCam` and snaps back to the game rig).
- **Recovery after `snapCam()`:** `snapCam()` clears any active `dbgCam`
  override. Re-call `orbit()` / `eyeAt()` / `view()` with the same args. If
  you lost them, re-derive `frac` from the def's `turns` (`js/circuits/<id>.js`) or `__apex.corners()`.

Inspectors: `camState()` → `{eye, tgt, fov, debug}`; `viewState()` is the
full scene/camera snapshot. Capture → **playwright-probe**.

## Load on demand

- Free-cam table, `previewCam`, `look:"in"` vs `roadside()` look set, recipes →
  [references/framing.md](references/framing.md).
