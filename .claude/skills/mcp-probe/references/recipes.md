# MCP probe recipes (load on demand)

Chrome setup, renderer probes, A/B ports, post-deploy checks (deploy-research).

## Probing a specific renderer

`node tools/mcp-cli.mjs probe` is the shape a renderer question takes. One
command, one browser, no heredoc:

```sh
npx serve -l 3456 .          # the page must be on 127.0.0.1 (see the trap below)
node tools/mcp-cli.mjs probe --backend webgpu --wait 12000 --console 'WGX|error' \
  --eval 'return JSON.stringify({gpuErrors: WGX.gpuErrors ? WGX.gpuErrors() : "n/a"});'
node tools/mcp-cli.mjs probe --dry-run --backend three   # inspect the batch, no browser
```

Four traps, each of which has cost a run:

- **`navigator.gpu` needs a SECURE CONTEXT.** It is undefined on `about:blank`
  no matter which Chrome flags are set, and reads exactly like a missing flag —
  measured across four flag combinations before the origin turned out to be the
  variable. Probe `http://127.0.0.1`. (The flags are needed too: the wrapper now
  passes `--enable-unsafe-webgpu`, without which headless Chrome exposes no
  WebGPU at all and every WGX probe reports "No available adapters".)
- **Script globals are not `window` properties.** `js/*.js` files assign
  `const GLX = …` at top level, a lexical binding: `window.GLX` is `undefined`
  while bare `GLX` works. Same for `Assets`, `Tracks`, `TLX`, `WGX`.
- **The backend pick lives in `localStorage`, and each invocation gets a fresh
  profile** — so it must be written and then RELOADED inside one batch. `--backend`
  does that; setting it as a separate command probes the default and looks like
  the backend silently ignoring you.
- **`--backend three` pins three to WebGL2** (`apex26.tlxForceGL=1`, what
  `tests/specs/tlx-probes.spec.js` sets). `--tlx-auto` leaves the pin unset
  (THREE PATH: AUTO — WebGPU when `navigator.gpu` works). `--tlx-auto-gl`
  is AUTO after `apex26.tlxAutoGL=1` (three WebGL2, still TLX — not game
  GLX). `--tlx-webgpu` pins three's WebGPU path.

What a clean WGX boot looks like: no `WGX` console line at all,
`WGX.gpuErrors()` 0, and `sessionStorage["apex26.gfxBound"]` ABSENT — that key
is written only when WGX refuses and hands the frame back to GLX, so its
presence (`"webgl2"`) is the failure signal, not the success one.

**Those are all ABSENCE signals — pair them with one positive.** Nothing was
logged is also what a probe that never reached the renderer looks like, and
`__apex.info().backend` is the *pick* at menu state, not what bound. Drive a
race and ask the canvas:

```sh
node tools/mcp-cli.mjs probe --backend webgpu --wait 8000 \
  --eval 'await __apex.race("monza"); await __apex.go();
          await new Promise(r=>setTimeout(r,7000));
          return String(document.querySelector("canvas").getContext("webgl2") === null);'
```

`true` proves it: a canvas is bound to one context type for life, so once
WebGPU has claimed it, `getContext("webgl2")` can only return null. It also
means the meshes uploaded, the pipelines built and the post targets allocated —
each of the four 2026-08-17 blockers failed a different one of those stages, and
the earlier ones masked the later ones, so **expect to find them one boot at a
time** rather than in a single pass. Two of the four were format/feature
validation errors that a mock device cannot model at all
(`sampleCount` 2, and `rg11b10ufloat` as a render target without
`rg11b10ufloat-renderable`).

SwiftShader WebGPU is a **validation and lifecycle** oracle — shaders compile,
bind groups match, buffers upload. It is not a visual one. For **pixels**:

```sh
node tools/gfx-probe.mjs --backend webgpu --lite montreal  # visible #game (primary)
node tools/wgx-capture.mjs montreal --lite                 # readback oracle → frame.png
node tools/wgx-lavapipe-probe.mjs montreal --lite   # second Vulkan stack (Lavapipe)
node tools/gfx-probe.mjs --backend three --lite montreal   # TLX via WebGL2
```

Missing `/usr/share/vulkan/icd.d/lvp_icd.json` → install `mesa-vulkan-drivers`
(and persist the Cloud env snapshot — see `AGENTS.md` §Cursor Cloud).

---

## Chrome DevTools MCP — live 3D / __apex debugging

### Setup (canvas visible — you WANT the render here)

```
# 1. serve the working tree yourself (Playwright's own server uses a random port)
python3 -m http.server 3456        # background it
```
```
mcp__chrome-devtools__navigate_page   http://127.0.0.1:3456/?v=<N>   # N = version.json
```
Then wait for the API and position the shot with the same `__apex` hooks a scratch
script uses (`docs/DEBUG-HOOKS.md`):

```js
// mcp__chrome-devtools__evaluate_script
async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  for (let i=0;i<60 && !window.__apex;i++) await wait(250);
  // Prefetch baked models BEFORE race() so scenery bakedModel() emits
  if (typeof Assets !== "undefined" && Assets.loadModels) await Assets.loadModels();
  __apex.race('portimao');
  for (let i=0;i<80 && !(__apex.info()&&__apex.info().track);i++) await wait(200);
  __apex.go();
  __apex.jump(0.315, 40, 0);   // arc s, speed, lateral — put the car at the feature
  __apex.snapCam();            // REQUIRED after jump()/park() — NOT after orbit/view
  await wait(400);
  return __apex.info();
}
```
```
mcp__chrome-devtools__take_screenshot   filePath: scratch/<name>.png
```

Shell one-liner (auto-starts `:3456` if needed, parks to `about:blank` after):

```sh
python3 tools/cdmcp-cli.py apex-shot monza 0.97 --az -105 --el 26 --dist 110 \
  --out /opt/cursor/artifacts/baked-models/cdmcp-monza-paddock.png
```

`snapCam()` after every `jump()`/`park()` or the frame is stale — but **never**
after `orbit()`/`view()`/`eyeAt()` (clears dbgCam; see trap above). Screenshots
go under `scratch/` or `/opt/cursor/artifacts/`, never the repo root (AGENTS.md).

### Background Chromium measure (logged)

```
node tools/cdmcp-bg.mjs boot --port 3462
tail -f artifacts/logs/cdmcp-measure.log
# watcher: until grep -qE "= run (passed|failed|timedout|interrupted)" artifacts/logs/cdmcp-measure.log
```

Profiles `boot` / `ui` / `full`. JSON sidecar: `artifacts/logs/cdmcp-measure.json`.
See `docs/research/CHROME-DEVTOOLS-MCP.md` § Background measure.

### When this beats a scratch script

- **"Does this visual change look right?"** — one navigate + eval + screenshot,
  no write→run→read-png loop. (This session confirmed the `models.js` grounded-wall
  fix by eye this way: terraces standing above grade at Portimão.)
- **Live `__apex` REPL** during a bug hunt — `physState()`, `cars()`, `scene()`,
  `world()` against the running game, iterating in the same page.
- **DevTools-only instruments the suite never wires up:**
  - `take_heapsnapshot` + `get_heapsnapshot_*` — leak hunting (the mesh-cache
    "frees every cached variant" question, GPU-buffer eviction).
  - `performance_start_trace` / `performance_analyze_insight` — frame-budget /
    GC-jitter profiling (overlaps playwright-probe's `references/perf-profile.md`, but live).
  - `list_console_messages` (`types:["error","warn"]`) — did the page throw.
  - `take_snapshot` — the a11y tree as cheap text (see survey-ui-matrix).
  - `lighthouse_audit` (`mode:"snapshot"`) — a11y/best-practices on the current
    screen (excludes performance; use traces for that).
  - `click` / `press_key` / `wait_for` on snapshot **uids** (`1_12`, not `1`).

### A/B two trees on two ports — the strongest evidence this setup can give

A source guard proves a renderer **asked** for something; only pixels prove it
**got** it. Two `serve` roots on two ports turn "I think this fixes it" into a
measured before/after, in one command, with the browser held constant:

```sh
npx serve -l 3456 /the/pre-fix/tree &     # control
npx serve -l 3466 /the/fixed/tree   &     # patch
for P in 3456 3466; do node tools/mcp-cli.mjs probe \
  --url http://127.0.0.1:$P/index.html --backend three \
  --wait 14000 --eval scratch/my-probe.js; done
```

Measured 2026-08-17 for the transparent-cars fix (`js/render/three/tlx.js` —
canvas alpha), reading composited alpha by `drawImage`-ing `canvas#game` onto a
cleared 2d canvas and histogramming the alpha byte:

| tree | `getContextAttributes().alpha` | min alpha | px < 255 |
| --- | --- | --- | --- |
| pre-fix `?v=1300` | `true` | 0 | 329160 (**100 %**) |
| fixed `?v=1306` | `false` | 255 | 0 |

Two things make this readable rather than lucky:

- **Report the identity of what you measured, not just the number.** The probe
  returns the `game.js?v=` it found alongside the pixels, so the row cannot be
  silently the same tree twice — the failure mode of every two-port A/B.
- **A WebGL drawing buffer is cleared after compositing** (no
  `preserveDrawingBuffer`), so by read time you are usually measuring the CLEAR,
  not the frame: an alpha canvas clears to 0, an opaque one to 255. Perfect for a
  canvas-CONFIG question and useless for a "what colour is the car" one. Know
  which of the two you are asking before you trust the histogram.

### Reproducing the post-death path on purpose (WebGPU + SwiftShader)

`--backend three --tlx-webgpu` cannot render here — it dies inside **three's own**
buffer upload, the same SwiftShader limit that WGX had to route around:

```
[gfx] TLX: shadow pass failed — createBuffer failed, size (7692) is too large
      for the implementation when mappedAtCreation == true
[gfx] TLX: present failed — Cannot read properties of null (reading 'constructor')
```

Useless for parity, but it is the only place the **post-only death path** boots
on demand — `present failed`, repeatedly, with materials that were built while
post was alive. That is the exact state behind the transparent-cars report, so
it is where to point a probe when reasoning about what reaches the canvas after
the post chain gives up. It also means the desktop WebGPU half of any TLX fix
stays source-guarded only; say so rather than implying it was run.

### File writes and roots (measured 2026-08-12)

Heap / perf / lighthouse tools validate paths against MCP **roots**. A stdio
client that never answers `roots/list` only gets `/tmp` by default — writes to
`/workspace/scratch/...` fail with `Access denied: … not within any of the
configured workspace roots`. Fix: advertise `capabilities.roots` on
`initialize`, answer `roots/list` with `file:///workspace`, **or** write
artifacts under `/tmp` and copy out.

Full recipes + measured LCP/heap/a11y numbers:
`docs/research/CHROME-DEVTOOLS-MCP.md`.

### When NOT to use it

Regression coverage, anything that must assert-and-gate, the 113-spec batch, or
anything in CI. It is one stateful browser driven by the model — no assertion
framework, no parallelism, no reporter. Use Playwright (`tools/ci/test-bg.mjs`).

---

## Post-deploy liveness check (deploy-research — host fetch, NOT tinyfish)

The whole suite tests the working tree; **nothing verifies the shipped artifact**.
After a Pages deploy, confirm the live site actually serves the build you shipped.

Since 2026-09 no TinyFish MCP is attached: the container egress blocks
`agent.tinyfish.ai`, so `tools/tinyfish-mcp.sh deploy-check --tip` and
`probe-mcp.py call tinyfish_*` can never answer here (they stay as CLIs for a
box with egress). Route the check to the **deploy-research** subagent, which
uses the host fetch tool (WebFetch, or the hosted TinyFish connector when the
main session has it):

```
WebFetch https://brycejmurrin.github.io/f1-game/version.json     → { "build": N }
git show origin/claude/f1-game-project-26h3ng:version.json         → the deploy tip
# live == tip → OK; live < tip → STALE (Pages lag). Compare to the TIP, not the
# working tree — a behind checkout is not a Pages miss.
```

A stale build here means the Pages deploy lagged or failed (measured 2026-08-12:
live was 971 while the repo was 1089 — a real lag the local suite could never
have caught).

**Go further than `version.json`: fetch the shipped JS and grep it for your
change.** A matching build number only proves Pages published *a* build with
that number, not that your edit is inside it. Read the `?v=<12 hex>` for the
path from the live `index.html`, fetch `…/js/<path>.js?v=<hash>` and grep a
marker unique to your change. MEASURED 2026-08-13, confirming a per-chunk-lamp
feature shipped: `_pickChunkLamps`, `uploadLightSet`, `perChunkLights` and
`uCarBiasScale` all found in the live artifact.

**Gotchas that hand you a FALSE negative.** A markdown-rendering fetcher
escapes `*`, `_` and backticks (`d /= k * k` came back as `d /= k \\* k`;
`CAR_SHADOW_SIZE` as `CAR\\_SHAD…`), and large bodies are TRUNCATED (measured
2026-08-17: 6.1 KB back from a 200 KB `wgx.js`). Check the raw text around an
unescaped anchor before believing a miss, and treat a marker past the first
few KB as **unverifiable from a fetch** — fall back to git provenance (is the
commit an ancestor of the deploy tip?).

## Research recipes (public web — no Chrome)

Use these when the question is the **deployed** artifact or the **public web**.
For a long fetch/search that would flood the main context, delegate to the
`deploy-research` subagent (`.claude/agents/deploy-research.md`) instead of
inlining every page.

| Goal | Command |
|---|---|
| Live vs deploy tip | deploy-research: WebFetch `version.json` + `git show origin/<deploy>:version.json` |
| Confirm a marker shipped | deploy-research: fetch `js/<path>.js?v=<live hash>` then grep the unique string |
| External grounding | WebSearch / hosted TinyFish `search`, then fetch the best URLs |
| Box WITH egress only | `./tools/tinyfish-mcp.sh deploy-check --tip` / `deploy-js --marker RE js/<path>.js` (CLI, not attached; key from shell / gitignored `.env`, no tracked fallback) |

Do **not** use a public-web fetcher for the working tree (localhost). Do **not**
use Chrome DevTools MCP for `github.io` from this container (egress proxy).

**Upstream TinyFish quirk (measured 2026-08-17, hosted connector):
`create_browser_session` returns `session_id: "tf-<uuid>"`, but
`run_web_automation`/`run_web_automation_async` validate `session_id` as a
BARE UUID** — pass the id with the `tf-` prefix stripped or the call fails
`Invalid UUID` without ever reaching the session. Heavier goals from
`list_runs` history took 12–20 minutes, so poll `get_run` at the interval the
queue message suggests, not in a loop.

---
## Getting a report off a REAL device (a phone with the bug)

MCP cannot reach the reporter's phone, and the backends that only misbehave
there (three/TLX on iOS) are exactly the ones a container cannot reproduce. Two
deliveries, same paste — `tools/apex-report.js` (bundle: `diag()`, GL identity,
canvas context attributes, log ring, `apex26.*`, frame sample + PNG, `verdict`).

| Page the device is on | What the reporter does | Where the bundle goes |
| --- | --- | --- |
| Served from your box (`node tools/report-server.mjs`, phone opens the printed LAN URL **with `?report=1`**) | taps SEND REPORT — no console at all | POSTs itself to `artifacts/reports/`, verdict printed in your terminal |
| Same, but they have a console | `fetch("/tools/apex-report.js").then(r=>r.text()).then(s=>(0,eval)(s))` | same |
| The deployed site | same line, but fetch `https://raw.githubusercontent.com/brycejmurrin/f1-game/claude/f1-game-project-26h3ng/tools/apex-report.js` | downloads on the device — the POST cannot cross from https to a plain-http laptop |

Prefer `?report=1` for anyone on an iPhone: iOS Safari has no console without a
Mac on the other end of a cable and Web Inspector switched on, and a tap samples
the frame the reporter is actually looking at.

`pages.yml` stages runtime dirs only, so `tools/` is NOT on the live site: the
same-origin loader works **only** off a local server, which is also the one that
serves whatever tree you are debugging. Ask for the LAN URL, not localhost — the
phone cannot reach your loopback. `apexReport({post:false})` forces a download.
