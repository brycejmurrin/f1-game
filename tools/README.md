# Apex 26 dev tools

Headless Node scripts for verifying and inspecting the game without a browser
window. Most pair with a **skill** in `.claude/skills/` (which explains when/how
to use them) — this index is the quick map. Run from the repo root.

| Tool | Does | Paired skill |
|---|---|---|
| **verify-track.cjs** | Headless build guard — loads the track defs + engine in a VM, runs `buildRoad/Terrain/Props/Gate`, fails on any THROW. `verify-track.cjs <id>` or `--all`. The fast pre-push check for any `js/tracks/*` edit. | track-batch-verify |
| **apex-eval.mjs** | Boot the game headless, evaluate one `__apex` expression, print JSON. `apex-eval.mjs '__apex.corners()'`. | playwright-probe |
| **apex-capture.mjs** | Parallel headless screenshot capture across cameras/tracks/modes for visual validation. | playwright-probe |
| **survey-track.mjs** | One-command circuit survey — self-boots the game and emits screenshots (aerial + orbit + driver's-eye per spot → `scratch/survey-<id>/`) **and** a lateral ground-profile probe table with auto-flagged holes/steps. `survey-track.mjs <id> [label] [fracs]`. | survey-track |
| **shot-car.mjs** | Screenshot a car / livery via the orbit camera. | inspect-scene |
| **check-bank.mjs**, **check-grip.mjs**, **check-roadfollow.mjs**, **check-steer.mjs** | Physics stability probes — verify no-NaN / forward-motion / banking grip / steering authority via the headless loop. | tune-physics |
| **audio-test.cjs** | Objective engine-audio pitch test (we can't listen headless). | audio-debug |
| **bake-elevation.mjs** | Offline elevation baker — precompute per-track elevation profiles. | new-track |
| **gltf-selftest.mjs** | Self-test for the `js/gltf.js` GLB loader (Node ESM, no deps). | webgl-debug |

## Conventions

- **Surveying a track:** `survey-track.mjs <id>` is the one-stop pass (shots +
  flagged probe). For a one-off framed shot use `.claude/skills/inspect-scene/shot.mjs`;
  for a parallel multi-track screenshot sweep use `apex-capture.mjs`; for a quick
  numbers-only terrain re-probe use `.claude/skills/survey-track/ground-profile.mjs`.
- **Chromium:** scripts auto-pick `/opt/pw-browsers/...`; `playwright` resolves
  from the repo. Servers bind a free port (or `:3456`).
- Anything that edits `js/*`/`css/*` still needs a `?v=N` cache bump (bump-cache).
