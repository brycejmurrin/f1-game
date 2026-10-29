---
name: playwright-probe
description: "Use when you need batch headless screenshots or evals, GLX vs TLX comparisons, flicker or z-fighting clips, CPU/frame-time profiles, CAR STUDIO livery and sponsors capture, camera modes (cockpit, chase) and camera lag. Not the parts catalogue → garage-parts-livery; the live canvas → mcp-probe."
---

# Headless Playwright probing

Drive the real game and `__apex` from Node under SwiftShader (deterministic headless) to validate
cameras, modes, tracks and physics, and capture screenshots that prove it. The parent owns one
browser session and serializes captures; subagents plan recipes or review artifacts but never
launch a browser (AGENTS.md rule 10, hook-enforced).

## Gotchas

- `orbit()` then `snapCam()` breaks the shot: `snapCam()` is for `park` (chase) only. A chase
  eye hundreds of metres from the car means a missing `snapCam()`, not a short wait (cameras.md).
- A still frame cannot show shimmer (headless rAF freezes at 0 fps), and a CPU chart cannot see
  fill-bound work: use `motion-capture.mjs` (trust p90) or `profile.mjs --repeat 3`.
- Inside a tunnel bore use cam `eye` at a mid-bore frac, never `park` (the chase rig).
- `--gpu llvmpipe` / `APEX_GL=llvmpipe` is CI-only here: it fails fast, never falls back.
- Before/after: rule 2 forbids source edits during a capture; use `git stash apply <sha>`, never
  `pop` (the stash stack is shared).
- `browserType.launch: Executable doesn't exist` means the SessionStart install did not run:
  `bash tools/env/cloud-agent-install.sh`.

## Workflow

1. Pick the tool: one `__apex` value → `tools/shot/apex-eval.mjs`; one framed still →
   `tools/shot/shot.mjs`; mode/track fanout → `tools/shot/apex-capture.mjs`; GLX vs TLX →
   `tools/shot/backend-compare.mjs`; flicker → `tools/shot/motion-capture.mjs`; frame time →
   `tools/perf/profile.mjs`; car only → `tools/car/render-car.mjs`. Menus/DOM resize surveys are
   the `browser_*` MCP (skill `survey-ui-matrix`); one-screen CSS is skill `css-play`.
2. Find the place with no browser first: `frac` from `turns:` in `js/circuits/<id>.js`, or
   `node tools/shot/flicker-gate.mjs --list` for tunnel/bridge sites.
3. A multi-minute capture (GLX `webgl2` boot, `backend-compare`, `motion-capture`,
   `profile.mjs --repeat`) runs as ONE `run_in_background` task logging to `artifacts/logs/`
   (AGENTS.md rules 4, 5, 7 hold the rest).
4. Write captures under `artifacts/` (or the tool's `scratch/` default); for A/B use
   `artifacts/cmp/{before,after}/` with the SAME args in both states.
5. Check the output: blank-frame / `free-cam inactive` warnings, the capture manifest, and
   console errors; view images within the image budget (recipes.md §Galleries and image budget).
6. Return paths plus every cell left unverified.

## References

- [references/commands.md](references/commands.md) — read when you need exact command lines:
  the committed tools and their MCP wraps, `shot.mjs` flags and cams, the stash-based
  before/after procedure, motion and profiling one-liners.
- [references/recipes.md](references/recipes.md) — read when shooting UI/DOM screens, fanning
  out cameras, pinning a backend or fixing soft-present (`#game-soft`) / dead `DISPLAY`
  capture (§Backends and display), budgeting images
  ([§Galleries and image budget](references/recipes.md#galleries-and-image-budget)), writing a
  custom harness, or doing the Monaco tunnel before/after.
- [references/motion-capture.md](references/motion-capture.md) — read when chasing flicker,
  z-fighting or shadow shimmer while driving: why headless rAF freezes, the `recordVideo` fix,
  reading p90, kerb shimmer with `coplanar-audit` and `flicker-gate`.
- [references/perf-profile.md](references/perf-profile.md) — read when hunting a frame-budget
  hog (`tools/perf/profile.mjs --mode spans|cpu|step`), GC jitter, a slow track build, or
  reading flame-chart symbols.
- [references/car-studio.md](references/car-studio.md) — read for a track-free look at just the
  car (`tools/carview.html`, `tools/car/render-car.mjs`), team/livery/part audits, and angle
  grids (`tools/shot/garage-angles.mjs`, `tools/garage-angles-fetch.mjs`).
- [references/car-viewer-presets.md](references/car-viewer-presets.md) — read for car-viewer
  preset views, named shot sets, CLI options, the `CARVIEW` API and decal handedness.
- [references/cameras.md](references/cameras.md) — read for the built-in camera modes
  (`CAM_MODES`, `js/camera/mode-switch.js`), `orbit()` vs `snapCam()`, `camState()` /
  `viewState()`, and measuring camera lag (fixes live in skill f1-animation-cameras).
- [references/debug-cameras-framing.md](references/debug-cameras-framing.md) — read when framing
  a shot with the free debug camera: the free-cam table, `previewCam`, `look:"in"` vs
  `roadside()`, framing recipes.
