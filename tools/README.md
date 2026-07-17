# Apex 26 dev tools

Headless Node scripts for verifying and inspecting the game without a browser
window. Most pair with a **skill** in `.claude/skills/` (which explains when/how
to use them) — this index is the quick map. Run from the repo root. Disposable output never goes to `/tmp`: use `artifacts/tmp/` for batch logs/probes and `scratch/` for human-reviewed captures, renders, and profiles.

| Tool | Does | Paired skill |
|---|---|---|
| **verify-track.cjs** | Headless build guard — loads the track defs + engine in a VM, runs `buildRoad/Terrain/Props/Gate`, fails on any THROW. `verify-track.cjs <id>` or `--all`. The fast pre-push check for any `js/tracks/*` edit. | debug-tracks |
| **apex-eval.mjs** | Boot the game headless, evaluate one `__apex` expression, print JSON. `apex-eval.mjs '__apex.corners()'`. | playwright-probe |
| **apex-capture.mjs** | Parallel headless screenshot capture across cameras/tracks/modes for visual validation. Default output lives under `scratch/captures/apex-capture/<purpose>/`. | playwright-probe |
| **motion-capture.mjs** | Capture RENDERED MOTION (screenshots can't — headless rAF is frozen at 0 fps). Records a driven clip via `recordVideo` (which ticks the loop), extracts frames, scores per-frame flicker. For temporal artifacts (z-fight/clipping flicker, shadow crawl, pop-in) and A/B-verifying a renderer fix. Default output: `scratch/captures/motion-capture/<track>/`. `motion-capture.mjs <track> [sec] [speed]`. | motion-capture |
| **survey-track.mjs** | One-command circuit survey — self-boots the game and emits screenshots (aerial + orbit + driver's-eye per spot → `scratch/captures/survey-track/<id>/`) **and** a lateral ground-profile probe table with auto-flagged holes/steps. `survey-track.mjs <id> [label] [fracs]`. | survey-track |
| **carshot.mjs** | Cropped studio-orbit car JPEG (+ paint report). Self-boots. `carshot.mjs [az] [tod] [teamIdx] [outPath]` → `artifacts/tmp/carshot.jpg`. | playwright-probe / car-viewer |
| **shot-car.mjs** | Full-frame chase-cam static + moving PNGs. Self-boots. → `artifacts/tmp/car-static.png` + `car-moving.png`. | playwright-probe |
| **check-bank.mjs**, **check-grip.mjs**, **check-roadfollow.mjs**, **check-steer.mjs** | Physics stability probes — verify no-NaN / forward-motion / banking grip / steering authority via the headless loop. | tune-physics |
| **audio-test.cjs** | Objective engine-audio pitch test (we can't listen headless). | audio-debug |
| **bake-elevation.mjs** | Offline elevation baker — precompute per-track elevation profiles. | new-track |
| **gltf-selftest.mjs** | Self-test for the `js/gltf.js` GLB loader (Node ESM, no deps). | webgl-debug |
| **quick-validate.mjs** | Fast refactor gate — boots the game headless ONCE and probes critical paths (page loads clean, `__apex`/globals exist, race starts, physics steps, telemetry/lighting respond) in ~30-60 s, no test-runner overhead. `quick-validate.mjs [port]`. | — |
| **aerial-survey.mjs** | Top-down + high-oblique aerial survey of ONE circuit — spots floor gaps, floating models, terrain holes, props off the ground. `TRACK=monaco PORT=3510 aerial-survey.mjs [label]` → `scratch/captures/aerial-survey/<track>/`. | survey-track |
| **measure-props-over-road.mjs** | Measures prop geometry on/above the racing line; JSON report, `--shots` writes PNGs to `artifacts/tmp/`. `TRACK=redbull PORT=3471 measure-props-over-road.mjs [--shots]`. | scenery-dress |
| **ab-lighting.mjs** | A/B harness for every tunable lighting constant — renders each knob twice (committed vs swapped value, in-memory), gates on whether the swap changes the frame. `ab:light` npm script; out → `scratch/captures/ab-lighting/`. | lighting-tuner |
| **carview.html** | Standalone, isolated car "photo studio" (no track / no game.js) — procedural Car3D + LiveryTex on a studio backdrop via GLX. URL params or mouse/keys; headless API `window.CARVIEW`. | car-viewer |
| **render-car.mjs** | Headless batch renderer for `carview.html` — screenshots preset orbit angles with studio lighting, writes frames + an HTML contact sheet to `scratch/renders/cars/<team>/`. `render-car.mjs [--views=a,b,c]`. Needs a server on :3456. | car-viewer |
| **audit-parts.mjs** | Renders EVERY option of chosen part categories through `carview.html` (one page load) at the best view for each; per-category contact sheets → `scratch/renders/parts/<category>/`. `audit-parts.mjs [--cats=brakes,gearbox,ers] [--team=mclaren]`. | car-viewer |
| **audit-aero.mjs** | Renders EVERY aero option from 3 wing views into one comparison sheet → `scratch/renders/aero/`. `audit-aero.mjs [--team=mclaren]`. | car-viewer |
| **photoshoot.mjs** | Close-camera photo session across lighting/tracks (small JPEGs) → `artifacts/tmp/shoot`. | — |

### Test runner & coverage

| Tool | Does |
|---|---|
| **run-playwright.mjs** | The engine behind every `npm run test:*` — allocates a free port and port-suffixed report/artifact paths so independent test runs never share or tear down each other's web server. Forwards args to Playwright. |
| **test-coverage-audit.mjs** | Coverage guard (`npm run test:audit`) — every `tests/*.spec.js` must be reachable from at least one `test:<group>` npm script, so a pre-push group run can't silently skip a spec. Exit 1 if any spec is orphaned. |
| **test-shards.sh** | Runs whole npm test groups concurrently, one port + log per group, with a pass/fail summary. `tools/test-shards.sh smoke api collision`; `WORKERS=N` sets workers per group. |

## Conventions

- **Surveying a track:** `survey-track.mjs <id>` is the one-stop pass (shots +
  flagged probe). For a one-off framed shot use `.claude/skills/playwright-probe/shot.mjs`;
  for a parallel multi-track screenshot sweep use `apex-capture.mjs`; for a quick
  numbers-only terrain re-probe use `.claude/skills/survey-track/ground-profile.mjs`.
- **Chromium:** prefer `CHROME` / `PW_CHROMIUM`, then `/opt/pw-browsers/...`
  when present; otherwise Playwright's bundled browser. Servers bind a free
  port (or `:3456`).
- Anything that edits `js/*`/`css/*` still needs a `?v=N` cache bump (bump-cache).
- Never write disposable output to `/tmp`; use `artifacts/tmp/` or the standard `scratch/` subtrees.
