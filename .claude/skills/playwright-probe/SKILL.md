---
name: playwright-probe
description: "Use when asked for batch headless screenshots or evals of a track or car (shot.mjs, apex-eval.mjs, apex-capture.mjs), before/after or GLX-vs-TLX frames (backend-compare), flicker/shimmer/z-fighting clips (motion-capture), CPU profiles / flame charts / GC spikes, the CAR STUDIO (livery, sponsors, carview.html), or camera modes (cockpit/chase/orbit/roadside, camState/viewState, framing a corner, camera lag). Not the parts catalog (garage-parts-livery), UI-fit shots (survey-ui-matrix) or a live canvas (mcp-probe)."
---

# Headless Playwright probing

The parent owns one browser session and serialized captures. Subagents may inspect
source, plan recipes or review artifacts; they never launch a browser (AGENTS.md rule 10, hook-enforced).
Write captures under `artifacts/` and return paths plus explicit unverified cells.

## Prerequisites

The SessionStart hook installs deps and the headless shell (AGENTS.md
§Verification 1); `browserType.launch: Executable doesn't exist` means it did
not run — `bash tools/env/cloud-agent-install.sh`. Backend pinning, the
soft-present (`#game-soft`) capture rule and a dead `DISPLAY`:
[references/recipes.md](references/recipes.md) §Backends and display.

Interactive resize / DOM / CSS survey is the **playwright-official** MCP
(`browser_*`, skill `survey-ui-matrix`), not this batch harness.
One-screen CSS edit + hot-swap + structured DOM dump is **css-play**
(`tools/ui/css-play.mjs` / `playwright-mcp.sh play|dom`).

The renderer runs deterministically headless under SwiftShader, so you can drive
the real game and the `__apex` API from Node to validate cameras, modes, tracks,
and physics — and capture screenshots to prove it visually. Two committed tools
cover most needs; drop to a custom harness for bespoke sweeps.

## Committed tools (use these first)

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
node tools/shot/backend-compare.mjs monaco 0.52 park --backends webgl2,three --out artifacts/cmp/before --label tunnel-exit
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
(no pixels). It warns on blank frames and `free-cam inactive`. Find `frac` first
(no browser: `turns:` in `js/circuits/<id>.js`; Spa Eau Rouge compression ~0.075).
Speed notes: `docs/notes/SCREENSHOT-TOOL-SPEED-2026-10-10.md`.

`trackside` here is the free-cam `view({look:"in"})`, not the `trackside` CAM_MODES rig.
`turns:` has no tunnel/bridge entries: read the circuit file's comments (Monaco bore
racing 0.449-0.524) or `flicker-gate.mjs --list` (sites carry racing/scenery fracs).

**Before/after:** the tools serve the working tree, and rule 2 forbids source edits while a
capture runs. Edit already made: `git stash push -m pp-<tag>` → shoot BEFORE → `git stash apply <sha>`
(never `pop`; the stack is shared) → shoot AFTER with the SAME args. Name the out path per state:
`artifacts/cmp/{before,after}/<track>-T1.png`. Several corners: one `--batch` file per state,
`[{"track":"bahrain","frac":0.1038,"cam":"park","out":"artifacts/cmp/before/bahrain-T1.png"}, …]`
(one boot each). `backend-compare` diffs GLX vs TLX within one run, not A vs B; compare the two
runs' PNGs/manifests (`<label>-manifest.json`) yourself. Recipe: [references/recipes.md](references/recipes.md)
§Tunnel before/after. Car-only: `garage-angles.mjs --against=<git ref>` does both in one run.

## Motion and profiling (still this harness)

```sh
node tools/shot/motion-capture.mjs monaco 4 50      # driven clip → per-frame flicker score (trust p90)
node tools/shot/profile-gameloop.mjs singapore render        # .cpuprofile → Chrome DevTools → Performance
```

`flicker-gate.mjs` (still camera, fixed SITES, `--list` is no-browser) and
`tools/track/coplanar-audit.cjs <id>` (no browser) are the z-fight pair
motion-capture's reference points at. A still frame cannot show shimmer and a CPU chart cannot see fill-bound work —
both references say what the numbers mean before you A/B on them.

**Image budget:** `Read` at most 8 images, then compact; JPEG ≤ 800 px wide; more than 3 shots
→ `apex_shot_survey` (combined galleries: recipes.md §Galleries and image budget).

## Load on demand

- UI/DOM shots, camera fanout, env gotchas, harness skeletons →
  [references/recipes.md](references/recipes.md).
- Car-only garage/angle grids (`garage-angles`, `garage-angles-fetch`) → [references/car-studio.md](references/car-studio.md).
- Flicker / z-fighting / shadow shimmer while driving — why headless rAF
  freezes, the `recordVideo` fix, reading `p90` →
  [references/motion-capture.md](references/motion-capture.md).
- Frame-budget hog, GC jitter, slow track build, flame-chart symbols →
  [references/perf-profile.md](references/perf-profile.md).
- **Car studio** — track-free look at just the car (`tools/carview.html`,
  `tools/car/render-car.mjs`, team/livery/part audits) →
  [references/car-studio.md](references/car-studio.md), preset views and the
  `CARVIEW` API in
  [references/car-viewer-presets.md](references/car-viewer-presets.md).
- **Camera semantics** — the 20 built-in modes, `orbit()` vs `snapCam()` (the
  trap that costs a shot), `camState()`/`viewState()` →
  [references/cameras.md](references/cameras.md), free-cam table and framing
  recipes in
  [references/debug-cameras-framing.md](references/debug-cameras-framing.md).
