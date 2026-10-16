# Chrome DevTools MCP recipes

**Use when:** this recipe family is the narrowest match for the question.

**Verification:** record the exact command, target (local or deployed), and returned evidence.

**Writes/ownership:** read-only; the parent owns browser startup and serialized MCP use.

## Contents

- Chrome DevTools MCP — live 3D / __apex debugging

## Chrome DevTools MCP — live 3D / __apex debugging

### Setup (canvas visible — you WANT the render here)

```
# 1. serve the working tree yourself (Playwright's own server uses a random port)
python3 -m http.server 3456        # background it
```
```
mcp__chrome-devtools__navigate_page   http://127.0.0.1:3456/
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

HeadlessChrome GLX paints `#game-soft`, not `#game` (opacity 0). Await
`await __apex.awaitPresent()` (the `__apex` front door — no need to know `GLX`
is a bare global; same thing as `GLX.awaitSoftPresent()`, right whichever
backend is bound) while the loop still runs, then screenshot the overlay or a
compositor clip of its box. `locator("canvas#game").screenshot()` is the
uncomposited GPU buffer — often black even with `preserveDrawingBuffer`.

**Driving a UI screen (Garage/livery, not just camera moves):** the same
soft-present wait applies after ANY DOM interaction that changes the 3D scene,
not only `jump()`/`park()`/`orbit()`. Loop per click: `chrome_click` the
control (a `role=tab` category button can time out with "did not become
interactive" — dispatch a raw `.click()` on the matching element from
`evaluate_script` instead, see `references/traps-chrome.md`), then in one
`evaluate_script` call `await __apex.awaitPresent(8000)` — no `snapCam()`
needed, the wait alone arms the next blit — then `take_screenshot`.

Shell one-liner (auto-starts `:3456` if needed, parks to `about:blank` after):

```sh
python3 tools/mcp/cdmcp-cli.py apex-shot monza 0.97 --az -105 --el 26 --dist 110 \
  --out /opt/cursor/artifacts/baked-models/cdmcp-monza-paddock.png
```

`snapCam()` after every `jump()`/`park()` or the frame is stale — but **never**
after `orbit()`/`view()`/`eyeAt()` (clears dbgCam; see trap above). Screenshots
go under `scratch/` or `/opt/cursor/artifacts/`, never the repo root (AGENTS.md).

### Background Chromium measure (logged)

```
node tools/mcp/cdmcp-bg.mjs boot --port 3462
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

### Heap leak across N races (browser-only; tool names are `mcp__chrome-devtools__<name>`, `chrome_*` in prose)

Every `filePath` is REQUIRED on `take_heapsnapshot` and must sit under a roots dir (`/tmp/...` works; see File writes). No `--expose-gc` in our flags, but a snapshot GCs first.
1. `navigate_page` `http://127.0.0.1:3456/` (`ignoreCache:true` after any edit); do NOT run `lighthouse_audit` on this page first (axe strings fake a leak).
2. Warm-up: `evaluate_script` `__apex.race(id); go()` once, wait ~5 s (Setup above), then `take_heapsnapshot` A.
3. Repeat `race(<same or other id>); go()` for the suspect races (fresh wait each), `take_heapsnapshot` B, then C.
4. `compare_heapsnapshots` A vs B and B vs C: growth that repeats in BOTH deltas is the leak; one-off growth is warm-up. Pass `classIndex` from the summary for one class; `get_heapsnapshot_class_nodes` (`id`) -> `get_heapsnapshot_retaining_paths` (`nodeId`) says who holds it; `close_heapsnapshot` each file when done.
5. Same-track repeat vs different-track answers "cache never evicts" vs "rebuild leaks" (track-switch numbers: `docs/research/CHROME-DEVTOOLS-MCP.md`). SwiftShader + one session = a lead, not a verdict. Record: snapshot paths, per-class delta (count, MB), retaining path head, then `navigate_page about:blank` + `chrome-stop`.
Frame cost instead of memory: `performance_start_trace {reload:false, autoStop:false, filePath}` -> repro -> `performance_stop_trace` -> `performance_analyze_insight`.

### A/B two trees on two ports — the strongest evidence this setup can give

A source guard proves a renderer **asked** for something; only pixels prove it
**got** it. Two `serve` roots on two ports turn "I think this fixes it" into a
measured before/after, in one command, with the browser held constant:

```sh
npx serve -l 3456 /the/pre-fix/tree &     # control
npx serve -l 3466 /the/fixed/tree   &     # patch
for P in 3456 3466; do node tools/mcp/mcp-cli.mjs probe \
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
- **A WebGL drawing buffer is cleared after compositing.** GLX now sets
  `preserveDrawingBuffer: headlessUa` AND 2D-blits onto `#game-soft` under
  HeadlessChrome. A headed player has neither. `drawImage(#game)` on a
  headed tab is usually the CLEAR, not the frame; in HeadlessChrome, `#game`
  is opacity 0 and the visible still is `#game-soft`. Know which of the two
  you are asking before you trust the histogram.

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

Regression coverage, anything that must assert-and-gate, the full spec batch, or
anything in CI. It is one stateful browser driven by the model — no assertion
framework, no parallelism, no reporter. Use Playwright (`tools/ci/test-bg.mjs`).

---