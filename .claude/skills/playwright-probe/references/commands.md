# Playwright-probe commands — committed tools, `shot.mjs`, before/after, motion

Load from the SKILL.md index when you need exact command lines.

## Contents
- Committed tools (use these first)
- Single framed screenshot (`shot.mjs`)
- Before/after captures
- Motion and profiling

## Committed tools (use these first)

`apex_viewer` (MCP) opens the car/circuit viewer page (`tools/carview.html`) for a framed look.

```sh
# Same CLIs via MCP (takes scratch/apex-browser.lock; apex_status first):
#   ./tools/mcp/apex-tools-mcp.sh call apex_eval '{"track":"monza","expr":"a.info()"}'
#   ./tools/mcp/apex-tools-mcp.sh call apex_shot '{"track":"monza","frac":0.1}'
#   ./tools/mcp/apex-tools-mcp.sh call apex_hud_shot '{"cam":"cockpit","preset":"clean"}'   # race HUD: shot + boxes + findings (survey-ui-matrix)
# Plain CLIs (no MCP wrap): tools/car/carshot.mjs, tools/check/quick-validate.mjs. The wraps cannot pin a backend.
# One-off: boot the game, evaluate an __apex expression, print JSON.
node tools/shot/apex-eval.mjs <track> "<expr>"        # `a` = __apex; async ok; --raw for full JSON
node tools/shot/apex-eval.mjs monaco "a.camera()"
node tools/shot/apex-eval.mjs spa    "({c:a.corners().length, w:a.wallStats()})"
node tools/shot/apex-eval.mjs monaco "a.info()" --backend webgl2   # pin a backend (recipes.md §Backends)

# Parallel screenshot validation (writes PNGs + a blank/fail manifest):
node tools/shot/apex-capture.mjs cameras [track] [outdir]
node tools/shot/apex-capture.mjs modes   [outdir]
node tools/shot/apex-capture.mjs tracks  [outdir] [id ...]

# SAME framed scene on GLX vs TLX (+ numeric pixel diff, per-backend console errors):
# Inside a bore use `eye` at a mid-bore frac (flicker-gate --list), never `park` (the chase rig):
node tools/shot/backend-compare.mjs monaco 0.47 eye --backends webgl2,three --out artifacts/cmp/before --label tunnel-mid
```

## Single framed screenshot (`shot.mjs`)

```sh
node tools/shot/shot.mjs <trackId> <frac> [cam] [out.png|out.jpg] \
  [--az N] [--el N] [--dist N] [--side -1|1] [--tod day|dusk|dawn|night] [--hud] \
  [--weather dry|wet|rain|overcast|fog] [--gpu swiftshader] \
  [--team <id>] [--wait <s>] [--jpeg] [--raster]   # BROWSER (one Chromium; --help ok)
# --gpu llvmpipe / APEX_GL=llvmpipe is CI-only (needs /dev/dri): here it fails fast, never falls back.
# Many frames, one boot (JSON array / {jobs} / JSONL); same track reuses race():
node tools/shot/shot.mjs --batch jobs.json [--jpeg] [--raster]
```

`cam` = `park` (the in-game **chase** rig: snapCam, no free-cam) | `eye` | `orbit`
(default) | `cinematic` | `trackside`. Default out
`scratch/captures/playwright-probe/<track>-<pct>-<cam>.png`; `.jpg` / `--jpeg`
writes JPEG q85 (human review); `--raster` writes `__apex.render` JSON only
(no pixels). It warns on blank frames and `free-cam inactive`. Speed notes:
`docs/notes/SCREENSHOT-TOOL-SPEED-2026-10-10.md`.

Finding `frac` (no browser): `turns:` in `js/circuits/<id>.js` (Spa Eau Rouge compression ~0.075).
`turns:` has no tunnel/bridge entries: read the circuit file's comments (Monaco bore
racing 0.449-0.524) or `node tools/shot/flicker-gate.mjs --list` (sites carry racing/scenery fracs).
`trackside` here is the free-cam `view({look:"in"})`, not the `trackside` CAM_MODES rig.

## Before/after captures

The tools serve the working tree, and AGENTS.md rule 2 forbids source edits while a capture runs.
Edit already made:

1. `git stash push -m pp-<tag>`, then `git stash list --format='%H %gs'` to read its sha.
2. Shoot BEFORE.
3. `git stash apply <sha>` (never `pop`; the stack is shared), then drop that entry by its tag.
4. Shoot AFTER with the SAME args.

Name the out path per state: `artifacts/cmp/{before,after}/<track>-T1.png`. Several corners: one
`--batch` file per state,
`[{"track":"bahrain","frac":0.1038,"cam":"park","out":"artifacts/cmp/before/bahrain-T1.png"}, …]`
(one boot each). `backend-compare` diffs GLX vs TLX within one run, not A vs B; compare the two
runs' PNGs/manifests (`<label>-manifest.json`) yourself. Worked tunnel example: recipes.md
§Tunnel before/after. Car-only: `tools/shot/garage-angles.mjs --against=<git ref>` does both in one run.

## Motion and profiling

```sh
node tools/shot/motion-capture.mjs monaco 4 50      # driven clip → per-frame flicker score (trust p90)
node tools/perf/profile.mjs singapore --mode spans --repeat 3              # THE profiler: per-subsystem p50/p95/p99 + noise floor
node tools/perf/profile.mjs singapore --mode spans --repeat 3 --base HEAD  # A/B delta table (inside the spread = noise)
node tools/shot/profile-gameloop.mjs singapore render        # raw .cpuprofile only (profile.mjs --mode cpu wraps it)
```

`node tools/shot/flicker-gate.mjs` (still camera, fixed SITES, `--list` is no-browser) and
`tools/track/coplanar-audit.cjs <id>` (no browser) are the z-fight pair. A still frame cannot show
shimmer and a CPU chart cannot see fill-bound work: the motion-capture and perf-profile references
(linked from SKILL.md) say what the numbers mean before you A/B on them.
